import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { isDeptSessionsEnabled } from '@/lib/omnichannel/dept-sessions-constants'
import {
  ActiveSpeakerService,
  ChatThreadService,
} from '@/lib/omnichannel/ChatThreadService'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'
import { normalizeWhatsAppPhone } from '@/lib/omnichannel/phone'

export type PersistMessageInput = {
  empresaId: string
  canalId: string
  externalId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  direcao: 'inbound' | 'outbound'
  leadId?: string | null
  sessaoId?: string | null
  cardId?: string | null
  pipelineId?: string | null
  departamentoId?: string | null
  status?: string
  lastHumanInteraction?: string | null
  atribuidoAId?: string | null
  isAi?: boolean
  metadata?: Record<string, unknown>
  contactPhone?: string | null
  contactName?: string | null
  userId?: string | null
  logSistema?: string | null
  createdAt?: string
  /** Ativa falante deste número para a sessão. */
  activateSpeaker?: boolean
  activatedBy?: string | null
  speakerReason?: string
}

export type PersistMessageResult = {
  success: boolean
  sessaoId?: string
  interacaoId?: string | null
  error?: string
}

export type EnsureSessionInput = {
  empresaId: string
  canalId: string
  externalId: string
  sessaoId: string
  leadId?: string | null
  cardId?: string | null
  pipelineId?: string | null
  departamentoId?: string | null
  status?: string
}

export type EnsureSessionResult = {
  success: boolean
  sessaoId?: string
  error?: string
}

/**
 * Caminho único de persistência omnichannel:
 * thread + crm_conversas + crm_interacoes (+ card.conversa_id).
 * Fail-closed: não grava interação órfã sem histórico/index.
 */
export class SessionPersistenceService {
  static async persistMessage(
    supabase: SupabaseClient,
    input: PersistMessageInput,
  ): Promise<PersistMessageResult> {
    const empresaId = input.empresaId
    const canalId = input.canalId
    const externalId = normalizeWhatsAppPhone(input.externalId) || input.externalId

    if (!empresaId || !canalId || !externalId) {
      return { success: false, error: 'empresaId, canalId e externalId são obrigatórios.' }
    }

    const canalOk = await this.assertCanalEmpresa(supabase, canalId, empresaId)
    if (!canalOk) return { success: false, error: 'Canal não pertence à empresa.' }

    if (input.leadId) {
      const leadOk = await this.assertLeadEmpresa(supabase, input.leadId, empresaId)
      if (!leadOk) return { success: false, error: 'Lead não pertence à empresa.' }
    }

    if (input.cardId) {
      const cardOk = await this.assertCardEmpresa(supabase, input.cardId, empresaId)
      if (!cardOk) return { success: false, error: 'Card não pertence à empresa.' }
    }

    const departamentoId = await this.resolveDepartamentoId(supabase, {
      empresaId,
      canalId,
      externalId,
      explicit: input.departamentoId,
      pipelineId: input.pipelineId,
      cardId: input.cardId,
      sessaoId: input.sessaoId,
    })

    let pipelineId = input.pipelineId ?? null
    if (!pipelineId && input.cardId) {
      pipelineId = await this.pipelineIdFromCard(supabase, input.cardId, empresaId)
    }

    if (input.sessaoId) {
      const owned = await this.assertSessaoEmpresa(supabase, input.sessaoId, empresaId)
      if (!owned) {
        return { success: false, error: 'Sessão não pertence à empresa.' }
      }
    }

    // Resolve sessao: forçada → snapshot existente do telefone → nova UUID
    let provisionalSessao = input.sessaoId ?? null
    if (!provisionalSessao) {
      const latest = await ConversaHistoricoService.getLatestSessao(
        canalId,
        externalId,
        supabase,
      )
      if (latest?.sessao_id) {
        const owned = await this.assertSessaoEmpresa(supabase, latest.sessao_id, empresaId)
        if (owned) provisionalSessao = latest.sessao_id
      }
    }
    if (!provisionalSessao) provisionalSessao = randomUUID()

    // Garante índice de thread antes do histórico (evita órfão conversas↔thread)
    if (isDeptSessionsEnabled()) {
      await ChatThreadService.syncThreadFromAppend(supabase, {
        sessaoId: provisionalSessao,
        empresaId,
        canalId,
        externalId,
        leadId: input.leadId,
        status: input.status,
        cardId: input.cardId,
        departamentoId,
        pipelineId,
      })
    }

    const sessaoId = await ConversaHistoricoService.appendMessage(
      {
        empresa_id: empresaId,
        canal_id: canalId,
        external_id: externalId,
        lead_id: input.leadId ?? undefined,
        role: input.role,
        content: input.content,
        direcao: input.direcao,
        status: input.status,
        last_human_interaction: input.lastHumanInteraction,
        atribuido_a_id: input.atribuidoAId,
        metadata: input.metadata,
        is_ai: input.isAi,
        sessao_id: provisionalSessao,
      },
      supabase,
    )

    if (!sessaoId) {
      return { success: false, error: 'Falha ao gravar crm_conversas.' }
    }

    // Reconciliar thread se append gerou/confirmou outro id (não deve, com sessao forçada)
    if (isDeptSessionsEnabled() && sessaoId !== provisionalSessao) {
      await ChatThreadService.syncThreadFromAppend(supabase, {
        sessaoId,
        empresaId,
        canalId,
        externalId,
        leadId: input.leadId,
        status: input.status,
        cardId: input.cardId,
        departamentoId,
        pipelineId,
      })
    } else if (isDeptSessionsEnabled() && (input.cardId || departamentoId || pipelineId)) {
      // Atualiza metadados de vínculo que sync inicial pode ter omitido em update parcial
      await supabase
        .from('crm_chat_threads')
        .update({
          ...(input.cardId ? { card_id: input.cardId } : {}),
          ...(input.leadId ? { lead_id: input.leadId } : {}),
          ...(departamentoId ? { departamento_id: departamentoId } : {}),
          ...(pipelineId ? { pipeline_id: pipelineId } : {}),
          ...(input.status ? { status: input.status } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessaoId)
        .eq('empresa_id', empresaId)
    }

    const contactPhone = input.contactPhone ?? externalId
    const contactName = input.contactName ?? 'Cliente WhatsApp'

    const interacaoRow: Record<string, unknown> = {
      empresa_id: empresaId,
      lead_id: input.leadId ?? null,
      conversa_id: sessaoId,
      contact_phone: contactPhone,
      contact_name: contactName,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
    }
    if (input.userId) interacaoRow.user_id = input.userId
    if (input.logSistema) interacaoRow.log_sistema = input.logSistema
    if (input.createdAt) interacaoRow.created_at = input.createdAt

    const { data: interacao, error: interacaoError } = await supabase
      .from('crm_interacoes')
      .insert(interacaoRow)
      .select('id')
      .single()

    if (interacaoError) {
      console.error('[SessionPersistence] Falha crm_interacoes:', interacaoError)
      return {
        success: false,
        sessaoId,
        error: `Falha ao gravar crm_interacoes: ${interacaoError.message}`,
      }
    }

    if (input.cardId) {
      const { error: cardErr } = await supabase
        .from('crm_cards')
        .update({
          conversa_id: sessaoId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.cardId)
        .eq('empresa_id', empresaId)

      if (cardErr) {
        console.error('[SessionPersistence] Falha ao vincular card:', cardErr)
        return {
          success: false,
          sessaoId,
          interacaoId: interacao?.id ?? null,
          error: `Falha ao vincular card: ${cardErr.message}`,
        }
      }
    }

    if (input.activateSpeaker && isDeptSessionsEnabled()) {
      await ActiveSpeakerService.activate(supabase, {
        empresaId,
        canalId,
        externalId,
        sessaoId,
        departamentoId,
        activatedBy: input.activatedBy ?? null,
        reason: input.speakerReason ?? (input.direcao === 'outbound' ? 'outbound' : 'inbound'),
      })
    }

    return {
      success: true,
      sessaoId,
      interacaoId: interacao?.id ?? null,
    }
  }

  /**
   * Garante thread + ponteiro no card sem gravar mensagem.
   * Usado por triagem/bind após CREATE_CARD.
   */
  static async ensureSession(
    supabase: SupabaseClient,
    input: EnsureSessionInput,
  ): Promise<EnsureSessionResult> {
    const empresaId = input.empresaId
    const externalId = normalizeWhatsAppPhone(input.externalId) || input.externalId

    if (!empresaId || !input.canalId || !input.sessaoId || !externalId) {
      return { success: false, error: 'empresaId, canalId, sessaoId e externalId são obrigatórios.' }
    }

    const canalOk = await this.assertCanalEmpresa(supabase, input.canalId, empresaId)
    if (!canalOk) return { success: false, error: 'Canal não pertence à empresa.' }

    if (input.cardId) {
      const cardOk = await this.assertCardEmpresa(supabase, input.cardId, empresaId)
      if (!cardOk) return { success: false, error: 'Card não pertence à empresa.' }
    }

    const departamentoId = await this.resolveDepartamentoId(supabase, {
      empresaId,
      canalId: input.canalId,
      externalId,
      explicit: input.departamentoId,
      pipelineId: input.pipelineId,
      cardId: input.cardId,
      sessaoId: input.sessaoId,
    })

    let pipelineId = input.pipelineId ?? null
    if (!pipelineId && input.cardId) {
      pipelineId = await this.pipelineIdFromCard(supabase, input.cardId, empresaId)
    }

    if (input.cardId) {
      try {
        await ChatThreadService.bindCardToInboundSession(supabase, {
          empresaId,
          sessaoId: input.sessaoId,
          cardId: input.cardId,
          leadId: input.leadId ?? '',
          pipelineId: pipelineId ?? '',
          departamentoId,
          canalId: input.canalId,
          externalId,
          status: input.status,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, error: msg }
      }
    } else if (isDeptSessionsEnabled()) {
      await ChatThreadService.syncThreadFromAppend(supabase, {
        sessaoId: input.sessaoId,
        empresaId,
        canalId: input.canalId,
        externalId,
        leadId: input.leadId,
        status: input.status ?? 'ai',
        departamentoId,
        pipelineId,
      })
    }

    return { success: true, sessaoId: input.sessaoId }
  }

  /**
   * Repara sessão órfã: interações/card existem, mas falta crm_conversas e/ou thread.
   */
  static async healOrphanSession(
    supabase: SupabaseClient,
    sessaoId: string,
    empresaId: string,
  ): Promise<{ success: boolean; healed: boolean; error?: string }> {
    if (!sessaoId || !empresaId) {
      return { success: false, healed: false, error: 'sessaoId e empresaId obrigatórios.' }
    }

    const { data: card } = await supabase
      .from('crm_cards')
      .select('id, empresa_id, lead_id, pipeline_id, conversa_id')
      .eq('conversa_id', sessaoId)
      .eq('empresa_id', empresaId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: interacoes } = await supabase
      .from('crm_interacoes')
      .select('id, role, content, metadata, created_at, contact_phone, contact_name, lead_id')
      .eq('conversa_id', sessaoId)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: true })

    if (!interacoes?.length && !card) {
      return { success: false, healed: false, error: 'Nenhuma interação/card para heal.' }
    }

    const leadId = card?.lead_id ?? interacoes?.[0]?.lead_id ?? null
    const externalId =
      normalizeWhatsAppPhone(interacoes?.[0]?.contact_phone ?? '') ||
      (await this.externalIdFromLead(supabase, leadId, empresaId))

    if (!externalId) {
      return { success: false, healed: false, error: 'Não foi possível resolver external_id.' }
    }

    const canalId = await this.resolveCanalForHeal(supabase, empresaId, leadId)
    if (!canalId) {
      return { success: false, healed: false, error: 'Não foi possível resolver canal_id.' }
    }

    const pipelineId = card?.pipeline_id ?? null
    const departamentoId = await this.resolveDepartamentoId(supabase, {
      empresaId,
      canalId,
      externalId,
      pipelineId,
      cardId: card?.id,
      sessaoId,
    })

    const { count: conversasCount } = await supabase
      .from('crm_conversas')
      .select('id', { count: 'exact', head: true })
      .eq('sessao_id', sessaoId)
      .eq('empresa_id', empresaId)

    if ((conversasCount ?? 0) === 0 && interacoes?.length) {
      for (const row of interacoes) {
        const role = (row.role as 'user' | 'assistant' | 'system') || 'system'
        const direcao: 'inbound' | 'outbound' = role === 'user' ? 'inbound' : 'outbound'
        const { error } = await supabase.from('crm_conversas').insert({
          sessao_id: sessaoId,
          empresa_id: empresaId,
          canal_id: canalId,
          lead_id: leadId,
          external_id: externalId,
          role,
          content: row.content ?? '',
          direcao,
          last_message: row.content ?? '',
          status: role === 'assistant' && !(row.metadata as { is_ai?: boolean } | null)?.is_ai
            ? 'human'
            : 'ai',
          metadata: {
            ...(typeof row.metadata === 'object' && row.metadata ? row.metadata : {}),
            healed: true,
          },
          created_at: row.created_at,
          updated_at: row.created_at,
        })
        if (error) {
          console.error('[SessionPersistence] heal conversas:', error)
          return { success: false, healed: false, error: error.message }
        }
      }
    }

    await ChatThreadService.syncThreadFromAppend(supabase, {
      sessaoId,
      empresaId,
      canalId,
      externalId,
      leadId,
      status: 'human',
      cardId: card?.id ?? null,
      departamentoId,
      pipelineId,
    })

    if (card?.id) {
      await supabase
        .from('crm_cards')
        .update({ conversa_id: sessaoId, updated_at: new Date().toISOString() })
        .eq('id', card.id)
        .eq('empresa_id', empresaId)
    }

    return { success: true, healed: true }
  }

  /** Resolução de departamento_id (ordem do plano). */
  static async resolveDepartamentoId(
    supabase: SupabaseClient,
    opts: {
      empresaId: string
      canalId: string
      externalId: string
      explicit?: string | null
      pipelineId?: string | null
      cardId?: string | null
      sessaoId?: string | null
    },
  ): Promise<string | null> {
    if (opts.explicit) {
      const ok = await this.assertDepartamentoEmpresa(supabase, opts.explicit, opts.empresaId)
      if (ok) return opts.explicit
    }

    let pipelineId = opts.pipelineId ?? null
    if (!pipelineId && opts.cardId) {
      pipelineId = await this.pipelineIdFromCard(supabase, opts.cardId, opts.empresaId)
    }
    if (pipelineId) {
      const { data: pipe } = await supabase
        .from('pipelines')
        .select('departamento_id')
        .eq('id', pipelineId)
        .eq('empresa_id', opts.empresaId)
        .maybeSingle()
      if (pipe?.departamento_id) return pipe.departamento_id as string
    }

    if (opts.sessaoId) {
      const thread = await ChatThreadService.getById(supabase, opts.sessaoId)
      if (thread?.empresa_id === opts.empresaId && thread.departamento_id) {
        return thread.departamento_id
      }
    }

    const speaker = await ActiveSpeakerService.get(
      supabase,
      opts.empresaId,
      opts.canalId,
      opts.externalId,
    )
    if (speaker?.active_departamento_id) {
      const ok = await this.assertDepartamentoEmpresa(
        supabase,
        speaker.active_departamento_id,
        opts.empresaId,
      )
      if (ok) return speaker.active_departamento_id
    }

    return null
  }

  private static async assertCanalEmpresa(
    supabase: SupabaseClient,
    canalId: string,
    empresaId: string,
  ): Promise<boolean> {
    const { data } = await supabase
      .from('crm_canais')
      .select('id')
      .eq('id', canalId)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    return Boolean(data?.id)
  }

  private static async assertLeadEmpresa(
    supabase: SupabaseClient,
    leadId: string,
    empresaId: string,
  ): Promise<boolean> {
    const { data } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('id', leadId)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    return Boolean(data?.id)
  }

  private static async assertCardEmpresa(
    supabase: SupabaseClient,
    cardId: string,
    empresaId: string,
  ): Promise<boolean> {
    const { data } = await supabase
      .from('crm_cards')
      .select('id')
      .eq('id', cardId)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    return Boolean(data?.id)
  }

  private static async assertDepartamentoEmpresa(
    supabase: SupabaseClient,
    departamentoId: string,
    empresaId: string,
  ): Promise<boolean> {
    const { data } = await supabase
      .from('departamentos')
      .select('id')
      .eq('id', departamentoId)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    return Boolean(data?.id)
  }

  private static async assertSessaoEmpresa(
    supabase: SupabaseClient,
    sessaoId: string,
    empresaId: string,
  ): Promise<boolean> {
    const thread = await ChatThreadService.getById(supabase, sessaoId)
    if (thread) return thread.empresa_id === empresaId

    const { data: conv } = await supabase
      .from('crm_conversas')
      .select('empresa_id')
      .eq('sessao_id', sessaoId)
      .limit(1)
      .maybeSingle()

    if (conv) return conv.empresa_id === empresaId

    // Sessão nova (ainda sem linhas) — ok criar
    return true
  }

  private static async pipelineIdFromCard(
    supabase: SupabaseClient,
    cardId: string,
    empresaId: string,
  ): Promise<string | null> {
    const { data } = await supabase
      .from('crm_cards')
      .select('pipeline_id')
      .eq('id', cardId)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    return (data?.pipeline_id as string | undefined) ?? null
  }

  private static async externalIdFromLead(
    supabase: SupabaseClient,
    leadId: string | null,
    empresaId: string,
  ): Promise<string | null> {
    if (!leadId) return null
    const { data } = await supabase
      .from('crm_leads')
      .select('whatsapp, telefone')
      .eq('id', leadId)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    return (
      normalizeWhatsAppPhone(data?.whatsapp || data?.telefone || '') || null
    )
  }

  private static async resolveCanalForHeal(
    supabase: SupabaseClient,
    empresaId: string,
    leadId: string | null,
  ): Promise<string | null> {
    if (leadId) {
      const { data: lead } = await supabase
        .from('crm_leads')
        .select('canal_id')
        .eq('id', leadId)
        .eq('empresa_id', empresaId)
        .maybeSingle()
      if (lead?.canal_id) return lead.canal_id as string
    }

    const { data: canal } = await supabase
      .from('crm_canais')
      .select('id')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    return (canal?.id as string | undefined) ?? null
  }
}
