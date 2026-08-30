import type { SupabaseClient } from '@supabase/supabase-js'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'
import type { ParsedAiTags, TriageAction } from './parseTriageTags'
import { pickAssignee, resolveFunilFromTriage, type SystemFacts } from './systemFacts'

export type TriageExecutionInput = {
  empresaId: string
  leadId: string
  sessaoId: string
  canalId: string
  contactPhone: string
  contactName: string
  facts: SystemFacts
  tags: ParsedAiTags
}

export type TriageExecutionResult = {
  executed: TriageAction[]
  cardId: string | null
  responsavelId: string | null
  handover: boolean
  reasoning: string
}

/**
 * Executa ações estruturadas da IA: criar/atualizar card, atribuir responsável e handover humano.
 * A escolha do usuário é SEMPRE do sistema (carga/rodízio), não da LLM.
 */
export class TriageActionExecutor {
  static async execute(
    supabase: SupabaseClient,
    input: TriageExecutionInput,
  ): Promise<TriageExecutionResult> {
    const { facts, tags } = input
    const actions = new Set(tags.actions)
    const executed: TriageAction[] = []
    let cardId = facts.card_id
    let responsavelId: string | null = facts.card_responsavel_id
    let handover = false
    const reasons: string[] = []

    if (actions.has('ASK_CLARIFY')) {
      executed.push('ASK_CLARIFY')
      reasons.push('IA pediu esclarecimento — sem CREATE_CARD/HANDOVER.')
      await this.logReasoning(supabase, input, reasons.join(' '), { actions: [...executed] })
      return { executed, cardId, responsavelId, handover: false, reasoning: reasons.join(' ') }
    }

    const wantsCard =
      actions.has('CREATE_CARD') || actions.has('HANDOVER') || actions.has('QUEUE_UNASSIGNED')

    // Fora do horário: sistema bloqueia card/atribuição mesmo se a IA pedir CREATE_CARD
    if (!facts.dentro_horario) {
      if (wantsCard || actions.has('FORA_HORARIO')) {
        executed.push('FORA_HORARIO')
        reasons.push('Fora do horário comercial — card/atribuição bloqueados pelo sistema.')
        await this.logReasoning(supabase, input, reasons.join(' '), {
          actions: [...executed],
          dentro_horario: false,
        })
      } else {
        reasons.push('Fora do horário — sem ação de card.')
      }
      return { executed, cardId, responsavelId, handover: false, reasoning: reasons.join(' ') }
    }

    if (!wantsCard) {
      reasons.push('Nenhuma ação de card/handover emitida.')
      return { executed, cardId, responsavelId, handover: false, reasoning: reasons.join(' ') }
    }

    const funil = resolveFunilFromTriage(facts, tags.triage ?? {})
    if (!funil?.id || !funil.estagio_inicial_id) {
      reasons.push('Funil/estágio não resolvido a partir dos fatos — card não criado.')
      await this.logReasoning(supabase, input, reasons.join(' '), { triage: tags.triage })
      return { executed, cardId, responsavelId, handover: false, reasoning: reasons.join(' ') }
    }

    const queueUnassigned = actions.has('QUEUE_UNASSIGNED')
    const assignee = queueUnassigned
      ? null
      : pickAssignee(facts, funil.id, funil.departamento_id)

    if (!assignee && !queueUnassigned && actions.has('HANDOVER')) {
      // Sem usuário apto: cria card sem responsável (fila)
      executed.push('QUEUE_UNASSIGNED')
      reasons.push('Nenhum usuário apto no departamento/funil — card sem responsável.')
    }

    const resumo =
      tags.triage?.resumo ||
      tags.triage?.motivo ||
      `Atendimento WhatsApp — ${input.contactName}`

    const metadados = {
      triage: tags.triage,
      crm_status: tags.crmStatus ?? null,
      origem: 'ai_triage',
      motivo: tags.triage?.motivo ?? null,
      categoria: tags.triage?.categoria ?? null,
      prioridade: tags.triage?.prioridade ?? 'normal',
      atribuido_em: new Date().toISOString(),
    }

    if (facts.card_aberto && facts.card_id) {
      const { error } = await supabase
        .from('crm_cards')
        .update({
          pipeline_id: funil.id,
          stage_id: tags.triage?.estagio_id || funil.estagio_inicial_id,
          responsavel_id: assignee?.id ?? null,
          titulo: `WhatsApp: ${input.contactName}`,
          cliente_nome: input.contactName,
          descricao: resumo.slice(0, 2000),
          conversa_id: input.sessaoId,
          observacao: tags.triage?.motivo ?? null,
          metadados,
          updated_at: new Date().toISOString(),
        })
        .eq('id', facts.card_id)
        .eq('empresa_id', input.empresaId)

      if (error) {
        reasons.push(`Falha ao atualizar card: ${error.message}`)
      } else {
        cardId = facts.card_id
        responsavelId = assignee?.id ?? null
        executed.push('CREATE_CARD')
        reasons.push(
          assignee
            ? `Card atualizado e atribuído a ${assignee.nome} (${assignee.id}).`
            : 'Card atualizado sem responsável (fila).',
        )
      }
    } else {
      const { data: created, error } = await supabase
        .from('crm_cards')
        .insert({
          empresa_id: input.empresaId,
          pipeline_id: funil.id,
          stage_id: tags.triage?.estagio_id || funil.estagio_inicial_id,
          lead_id: input.leadId,
          responsavel_id: assignee?.id ?? null,
          titulo: `WhatsApp: ${input.contactName}`,
          cliente_nome: input.contactName,
          descricao: resumo.slice(0, 2000),
          conversa_id: input.sessaoId,
          observacao: tags.triage?.motivo ?? null,
          metadados,
        })
        .select('id')
        .single()

      if (error) {
        reasons.push(`Falha ao criar card: ${error.message}`)
      } else {
        cardId = created?.id ?? null
        responsavelId = assignee?.id ?? null
        executed.push('CREATE_CARD')
        reasons.push(
          assignee
            ? `Card criado e atribuído a ${assignee.nome} (${assignee.id}).`
            : 'Card criado sem responsável (fila).',
        )
      }
    }

    const shouldHandover = actions.has('HANDOVER') || Boolean(assignee)
    if (shouldHandover && cardId) {
      await this.applyHandover(supabase, input, assignee?.id ?? null)
      handover = true
      executed.push('HANDOVER')
      reasons.push(
        assignee
          ? `Conversa em status human + atribuido_a_id=${assignee.id}. IA em silêncio.`
          : 'Conversa em status human sem atribuído (fila da equipe).',
      )
    }

    await this.logReasoning(supabase, input, reasons.join(' '), {
      actions: [...executed],
      card_id: cardId,
      responsavel_id: responsavelId,
      funil_id: funil.id,
      triage: tags.triage,
    })

    return {
      executed: [...new Set(executed)],
      cardId,
      responsavelId,
      handover,
      reasoning: reasons.join(' '),
    }
  }

  private static async applyHandover(
    supabase: SupabaseClient,
    input: TriageExecutionInput,
    responsavelId: string | null,
  ) {
    const now = new Date().toISOString()

    // Propaga atribuição em todas as linhas da sessão (dedupe do inbox usa a mais recente)
    const { error } = await supabase
      .from('crm_conversas')
      .update({
        status: 'human',
        atribuido_a_id: responsavelId,
        last_human_interaction: now,
        updated_at: now,
      })
      .eq('sessao_id', input.sessaoId)
      .eq('empresa_id', input.empresaId)

    if (error) {
      console.error('[TriageAction] Falha ao atualizar sessão para human:', error)
      await ConversaHistoricoService.updateLatestSessaoStatus(
        input.sessaoId,
        {
          status: 'human',
          atribuido_a_id: responsavelId,
          last_human_interaction: now,
        },
        supabase,
      )
    }
  }

  private static async logReasoning(
    supabase: SupabaseClient,
    input: TriageExecutionInput,
    reasoning: string,
    meta: Record<string, unknown>,
  ) {
    await supabase.from('crm_interacoes').insert({
      empresa_id: input.empresaId,
      lead_id: input.leadId,
      conversa_id: input.sessaoId,
      contact_phone: input.contactPhone,
      contact_name: input.contactName,
      role: 'system',
      content: '(Triagem IA)',
      log_sistema: reasoning,
      metadata: { type: 'ai_triage_reasoning', ...meta },
    })
  }
}
