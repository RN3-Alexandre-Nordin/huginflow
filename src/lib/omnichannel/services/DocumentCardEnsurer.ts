import type { SupabaseClient } from '@supabase/supabase-js'
import type { DocumentCategory } from '@/lib/omnichannel/document-constants'
import { ILLEGIBLE_DOCUMENT_OBSERVATION } from '@/lib/omnichannel/document-constants'
import { CardDocumentMatcher } from '@/lib/omnichannel/triage/CardDocumentMatcher'
import {
  pickAssignee,
  resolveFunilFromTriage,
  type SystemFacts,
} from '@/lib/omnichannel/triage/systemFacts'
import {
  notifyCardAssignmentAndChanges,
  notifyCardResponsavelOnChange,
} from '@/lib/crm/notifyCardResponsavel'
import { SessionPersistenceService } from '@/lib/omnichannel/SessionPersistenceService'

export type EnsureDocumentCardInput = {
  empresaId: string
  leadId: string
  sessaoId: string
  contactPhone: string
  contactName: string
  facts: SystemFacts
  categoria: DocumentCategory
  resumo: string
  observacao?: string | null
  origem?: string
  ilegivel?: boolean
  canalId?: string | null
}

export type EnsureDocumentCardResult = {
  cardId: string | null
  responsavelId: string | null
  handover: boolean
  created: boolean
  reasoning: string
}

/**
 * Encaminhamento determinístico de documento: nunca deixa o fluxo sem card.
 * Match por categoria → reutiliza; senão cria card no funil certo (não sobrescreve card de outro assunto).
 */
export class DocumentCardEnsurer {
  static resolveFunilForCategory(facts: SystemFacts, categoria: DocumentCategory) {
    const route: Record<DocumentCategory, { funil_nome?: string; departamento_nome?: string }> = {
      financeiro_pagamento: { funil_nome: 'Financeiro', departamento_nome: 'Financeiro' },
      financeiro_boleto: { funil_nome: 'Financeiro', departamento_nome: 'Financeiro' },
      financeiro_recibo: { funil_nome: 'Financeiro', departamento_nome: 'Financeiro' },
      financeiro_documento: { funil_nome: 'Financeiro', departamento_nome: 'Financeiro' },
      expedicao_comprovante: { funil_nome: 'Expedição', departamento_nome: 'Expedição' },
      // Ilegível/incerto (logo, imagem genérica, OCR falhou): Atendimento/Comercial —
      // NÃO Financeiro (KB: assunto ambíguo → Comercial/Atendimento ou perguntar).
      documento_nao_identificado: { funil_nome: 'Atendimento', departamento_nome: 'Comercial' },
    }
    return resolveFunilFromTriage(facts, route[categoria] ?? route.documento_nao_identificado)
  }

  static async ensure(
    supabase: SupabaseClient,
    input: EnsureDocumentCardInput,
  ): Promise<EnsureDocumentCardResult> {
    const {
      empresaId,
      leadId,
      sessaoId,
      contactPhone,
      contactName,
      facts,
      categoria,
      resumo,
      observacao,
      origem = 'document_ensurer',
      ilegivel = false,
      canalId: canalIdInput,
    } = input

    let canalId = canalIdInput ?? null
    if (!canalId) {
      const { data: hist } = await supabase
        .from('crm_conversas')
        .select('canal_id')
        .eq('sessao_id', sessaoId)
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      canalId = (hist?.canal_id as string | null) ?? null
    }

    const match = await CardDocumentMatcher.findMatchingCard(supabase, {
      empresaId,
      leadId,
      sessaoId,
      categoria,
    })

    if (match) {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        conversa_id: sessaoId,
      }
      if (observacao) patch.observacao = observacao
      if (ilegivel) {
        patch.metadados = {
          categoria,
          origem,
          documento_ilegivel: true,
          triage: { categoria, resumo },
        }
      }

      await supabase.from('crm_cards').update(patch).eq('id', match.cardId).eq('empresa_id', empresaId)

      if (canalId) {
        await SessionPersistenceService.ensureSession(supabase, {
          empresaId,
          canalId,
          externalId: contactPhone,
          sessaoId,
          leadId,
          cardId: match.cardId,
          status: 'human',
        })
      }

      const { data: cardRow } = await supabase
        .from('crm_cards')
        .select('responsavel_id, titulo')
        .eq('id', match.cardId)
        .maybeSingle()

      const responsavelId = cardRow?.responsavel_id ?? null
      await this.applyHandover(supabase, empresaId, sessaoId, responsavelId)

      if (responsavelId) {
        try {
          await notifyCardResponsavelOnChange({
            supabase,
            empresaId,
            cardId: match.cardId,
            cardTitulo: cardRow?.titulo || `WhatsApp: ${contactName}`,
            actorId: null,
            actorNome: 'IA HuginFlow',
            notifyUserId: responsavelId,
            changeSummary: ilegivel
              ? 'atualizou o card com documento (leitura parcial/ilegível)'
              : `atualizou o card com documento (${categoria})`,
          })
        } catch (err) {
          console.error('[DocumentCardEnsurer] notify:', err)
        }
      }

      return {
        cardId: match.cardId,
        responsavelId,
        handover: true,
        created: false,
        reasoning: `Encaminhamento garantido: ${match.matchReason}. Handover humano.`,
      }
    }

    const funil = this.resolveFunilForCategory(facts, categoria)
    if (!funil?.id || !funil.estagio_inicial_id) {
      return {
        cardId: null,
        responsavelId: null,
        handover: false,
        created: false,
        reasoning: 'Encaminhamento falhou: nenhum funil/estágio disponível para o documento.',
      }
    }

    const assignee = pickAssignee(facts, funil.id, funil.departamento_id)
    const obs =
      observacao ||
      (ilegivel || categoria === 'documento_nao_identificado'
        ? ILLEGIBLE_DOCUMENT_OBSERVATION
        : null)

    const metadados = {
      origem,
      categoria,
      documento_ilegivel: ilegivel || categoria === 'documento_nao_identificado',
      triage: {
        categoria,
        resumo,
        funil_id: funil.id,
        funil_nome: funil.nome,
        departamento_id: funil.departamento_id ?? undefined,
        motivo: obs ?? resumo,
      },
      atribuido_em: new Date().toISOString(),
    }

    const { data: created, error } = await supabase
      .from('crm_cards')
      .insert({
        empresa_id: empresaId,
        pipeline_id: funil.id,
        stage_id: funil.estagio_inicial_id,
        lead_id: leadId,
        responsavel_id: assignee?.id ?? null,
        titulo: `WhatsApp: ${contactName}`,
        cliente_nome: contactName,
        descricao: resumo.slice(0, 2000),
        // Sempre vincula à sessão WhatsApp onde o documento chegou
        conversa_id: sessaoId,
        observacao: obs,
        metadados,
      })
      .select('id')
      .single()

    if (error || !created?.id) {
      return {
        cardId: null,
        responsavelId: null,
        handover: false,
        created: false,
        reasoning: `Encaminhamento falhou ao criar card: ${error?.message ?? 'sem id'}`,
      }
    }

    // Vincula thread + ponteiro (caminho único)
    if (canalId) {
      try {
        await SessionPersistenceService.ensureSession(supabase, {
          empresaId,
          canalId,
          externalId: contactPhone,
          sessaoId,
          leadId,
          cardId: created.id,
          pipelineId: funil.id,
          departamentoId: funil.departamento_id,
          status: 'human',
        })
      } catch (err) {
        console.error('[DocumentCardEnsurer] ensureSession:', err)
      }
    }

    const responsavelId = assignee?.id ?? null
    // Handover na sessão inbound (falante atual); thread do card isolada sem roubar o falante
    await this.applyHandover(supabase, empresaId, sessaoId, responsavelId)

    if (canalId) {
      await SessionPersistenceService.persistMessage(supabase, {
        empresaId,
        canalId,
        externalId: contactPhone,
        leadId,
        sessaoId,
        cardId: created.id,
        pipelineId: funil.id,
        departamentoId: funil.departamento_id,
        role: 'system',
        content: '(Encaminhamento documento)',
        direcao: 'outbound',
        contactPhone,
        contactName,
        logSistema: `Card criado no funil ${funil.nome} (categoria=${categoria}) por fallback determinístico.`,
        metadata: {
          type: 'document_ensurer_reasoning',
          card_id: created.id,
          categoria,
          funil_id: funil.id,
        },
      })
    } else {
      await supabase.from('crm_interacoes').insert({
        empresa_id: empresaId,
        lead_id: leadId,
        conversa_id: sessaoId,
        contact_phone: contactPhone,
        contact_name: contactName,
        role: 'system',
        content: '(Encaminhamento documento)',
        log_sistema: `Card criado no funil ${funil.nome} (categoria=${categoria}) por fallback determinístico.`,
        metadata: {
          type: 'document_ensurer_reasoning',
          card_id: created.id,
          categoria,
          funil_id: funil.id,
        },
      })
    }

    try {
      await notifyCardAssignmentAndChanges({
        supabase,
        empresaId,
        cardId: created.id,
        cardTitulo: `WhatsApp: ${contactName}`,
        actorId: null,
        actorNome: 'IA HuginFlow',
        previousResponsavelId: null,
        nextResponsavelId: responsavelId,
        otherChanges: [
          ilegivel || categoria === 'documento_nao_identificado'
            ? 'criou card para análise de documento'
            : `criou card com documento (${categoria})`,
        ],
      })
    } catch (err) {
      console.error('[DocumentCardEnsurer] notify create:', err)
    }

    return {
      cardId: created.id,
      responsavelId,
      handover: true,
      created: true,
      reasoning: assignee
        ? `Card criado no funil ${funil.nome} (categoria=${categoria}) e atribuído a ${assignee.nome}.`
        : `Card criado no funil ${funil.nome} (categoria=${categoria}) sem responsável (fila).`,
    }
  }

  private static async applyHandover(
    supabase: SupabaseClient,
    empresaId: string,
    sessaoId: string,
    responsavelId: string | null,
  ) {
    const now = new Date().toISOString()
    await supabase
      .from('crm_conversas')
      .update({
        status: 'human',
        atribuido_a_id: responsavelId,
        updated_at: now,
      })
      .eq('sessao_id', sessaoId)
      .eq('empresa_id', empresaId)
  }
}
