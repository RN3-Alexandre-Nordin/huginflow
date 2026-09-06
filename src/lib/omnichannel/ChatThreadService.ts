import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { ACTIVE_SPEAKER_TIMEOUT_MINUTES } from '@/lib/omnichannel/dept-sessions-constants'

export type ActiveSpeakerRow = {
  empresa_id: string
  canal_id: string
  external_id: string
  active_sessao_id: string
  active_departamento_id: string | null
  activated_at: string
  activated_by: string | null
  reason: string | null
}

export class ActiveSpeakerService {
  static async get(
    supabase: SupabaseClient,
    empresaId: string,
    canalId: string,
    externalId: string,
  ): Promise<ActiveSpeakerRow | null> {
    const { data } = await supabase
      .from('crm_phone_active_speaker')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('canal_id', canalId)
      .eq('external_id', externalId)
      .maybeSingle()
    return (data as ActiveSpeakerRow | null) ?? null
  }

  static async activate(
    supabase: SupabaseClient,
    input: {
      empresaId: string
      canalId: string
      externalId: string
      sessaoId: string
      departamentoId?: string | null
      activatedBy?: string | null
      reason: string
    },
  ): Promise<void> {
    const { error } = await supabase.from('crm_phone_active_speaker').upsert(
      {
        empresa_id: input.empresaId,
        canal_id: input.canalId,
        external_id: input.externalId,
        active_sessao_id: input.sessaoId,
        active_departamento_id: input.departamentoId ?? null,
        activated_at: new Date().toISOString(),
        activated_by: input.activatedBy ?? null,
        reason: input.reason,
      },
      { onConflict: 'empresa_id,canal_id,external_id' },
    )
    if (error) {
      console.error('[ActiveSpeaker] activate:', error.message)
    }

    await supabase
      .from('crm_chat_threads')
      .update({ status: 'human', updated_at: new Date().toISOString() })
      .eq('id', input.sessaoId)
      .neq('status', 'closed')
  }

  /** Resolve sessão para inbound: falante ativo válido, senão null (caller usa legacy). */
  static async resolveInboundSessao(
    supabase: SupabaseClient,
    empresaId: string,
    canalId: string,
    externalId: string,
  ): Promise<{ sessaoId: string; stale: boolean } | null> {
    const speaker = await this.get(supabase, empresaId, canalId, externalId)
    if (!speaker?.active_sessao_id) return null

    const { data: thread } = await supabase
      .from('crm_chat_threads')
      .select('id, status')
      .eq('id', speaker.active_sessao_id)
      .maybeSingle()

    if (!thread || thread.status === 'closed') return null

    const activatedAt = new Date(speaker.activated_at).getTime()
    const ageMin = (Date.now() - activatedAt) / 60_000
    const stale = ageMin > ACTIVE_SPEAKER_TIMEOUT_MINUTES

    if (stale && thread.status !== 'human') {
      // Timeout sem atendimento humano recente → deixa legacy/clarify decidir
      return { sessaoId: speaker.active_sessao_id, stale: true }
    }

    return { sessaoId: speaker.active_sessao_id, stale: false }
  }
}

export type ChatThread = {
  id: string
  empresa_id: string
  canal_id: string
  external_id: string
  lead_id: string | null
  card_id: string | null
  departamento_id: string | null
  pipeline_id: string | null
  status: string
}

export class ChatThreadService {
  static async getById(
    supabase: SupabaseClient,
    sessaoId: string,
    empresaId?: string,
  ): Promise<ChatThread | null> {
    let q = supabase.from('crm_chat_threads').select('*').eq('id', sessaoId)
    if (empresaId) q = q.eq('empresa_id', empresaId)
    const { data } = await q.maybeSingle()
    return (data as ChatThread | null) ?? null
  }

  static async getOpenByCard(
    supabase: SupabaseClient,
    cardId: string,
    empresaId?: string,
  ): Promise<ChatThread | null> {
    let q = supabase
      .from('crm_chat_threads')
      .select('*')
      .eq('card_id', cardId)
      .neq('status', 'closed')
      .order('updated_at', { ascending: false })
      .limit(1)
    if (empresaId) q = q.eq('empresa_id', empresaId)
    const { data } = await q.maybeSingle()
    return (data as ChatThread | null) ?? null
  }

  /**
   * Modelo (regra de produto):
   * - 1 card = 1 atendimento (pode atravessar funis/depts/operadores).
   * - N conversas WhatsApp por card (1 por departamento que atendeu) — FORK.
   * - Histórico NÃO viaja: origem mantém a thread fechada; destino ganha sessão vazia
   *   no MESMO card_id (nunca cria segundo crm_cards).
   * - Isolamento por departamento + empresa_id; anexos ficam no card.
   */
  static async forkSessionOnDepartmentTransfer(
    supabase: SupabaseClient,
    input: {
      empresaId: string
      cardId: string
      fromDepartamentoId: string | null
      toDepartamentoId: string | null
      toPipelineId: string
      leadId?: string | null
      resolvedByUsuarioId?: string | null
      fromDepartamentoNome?: string | null
      toDepartamentoNome?: string | null
    },
  ): Promise<{ forked: boolean; oldSessaoId: string | null; newSessaoId: string | null; reason?: string }> {
    const {
      empresaId,
      cardId,
      fromDepartamentoId,
      toDepartamentoId,
      toPipelineId,
      leadId,
    } = input

    if (
      !fromDepartamentoId ||
      !toDepartamentoId ||
      fromDepartamentoId === toDepartamentoId
    ) {
      return {
        forked: false,
        oldSessaoId: null,
        newSessaoId: null,
        reason: 'Mesmo departamento — sem fork.',
      }
    }

    const { data: card } = await supabase
      .from('crm_cards')
      .select('id, conversa_id, lead_id')
      .eq('id', cardId)
      .eq('empresa_id', empresaId)
      .maybeSingle()

    if (!card) {
      return { forked: false, oldSessaoId: null, newSessaoId: null, reason: 'Card não encontrado.' }
    }

    let oldThread = await this.getOpenByCard(supabase, cardId, empresaId)
    if (!oldThread && card.conversa_id) {
      oldThread = await this.getById(supabase, card.conversa_id, empresaId)
    }

    const now = new Date().toISOString()
    const oldSessaoId = oldThread?.id ?? (card.conversa_id as string | null) ?? null

    if (oldThread && oldThread.status !== 'closed') {
      await supabase
        .from('crm_chat_threads')
        .update({
          status: 'closed',
          resolved_at: now,
          resolved_by_usuario_id: input.resolvedByUsuarioId ?? null,
          // Mantém departamento_id + card_id: origem continua vendo o histórico isolado
          updated_at: now,
        })
        .eq('id', oldThread.id)
        .eq('empresa_id', empresaId)

      // Fecha conversas da origem; zera freeze nesta sessão (destino começa limpo)
      const { error: oldConvErr } = await supabase
        .from('crm_conversas')
        .update({
          status: 'closed',
          last_human_interaction: null,
          updated_at: now,
        })
        .eq('sessao_id', oldThread.id)
        .eq('empresa_id', empresaId)

      if (oldConvErr) {
        console.error('[ChatThread] fork clear freeze origem:', oldConvErr.message)
      }

      if (oldThread.canal_id && oldThread.external_id) {
        const destLabel = input.toDepartamentoNome || 'outro departamento'
        await supabase.from('crm_conversas').insert({
          sessao_id: oldThread.id,
          empresa_id: empresaId,
          canal_id: oldThread.canal_id,
          lead_id: leadId ?? card.lead_id ?? oldThread.lead_id,
          external_id: oldThread.external_id,
          role: 'system',
          content: `Encaminhado para ${destLabel}. Histórico permanece neste departamento (mesmo card).`,
          direcao: 'outbound',
          last_message: `Encaminhado para ${destLabel}`,
          status: 'closed',
          metadata: {
            type: 'dept_transfer_fork',
            to_departamento_id: toDepartamentoId,
            card_id: cardId,
          },
          created_at: now,
          updated_at: now,
        })
      }
    }

    const canalId = oldThread?.canal_id
    const externalId = oldThread?.external_id
    if (!canalId || !externalId) {
      // Sem canal: card já está no funil destino; destino cria sessão ao abrir WhatsApp
      await supabase
        .from('crm_cards')
        .update({ conversa_id: null, updated_at: now })
        .eq('id', cardId)
        .eq('empresa_id', empresaId)
      return {
        forked: Boolean(oldSessaoId),
        oldSessaoId,
        newSessaoId: null,
        reason: 'Sem canal/external — conversa_id limpa; destino cria sessão ao abrir WhatsApp.',
      }
    }

    // Já existe sessão aberta no depto destino para ESTE card? Reusa (não cria 2ª)
    const { data: existingDest } = await supabase
      .from('crm_chat_threads')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('card_id', cardId)
      .eq('departamento_id', toDepartamentoId)
      .neq('status', 'closed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingDest) {
      await supabase
        .from('crm_cards')
        .update({ conversa_id: existingDest.id, updated_at: now })
        .eq('id', cardId)
        .eq('empresa_id', empresaId)

      await ActiveSpeakerService.activate(supabase, {
        empresaId,
        canalId,
        externalId,
        sessaoId: existingDest.id,
        departamentoId: toDepartamentoId,
        activatedBy: input.resolvedByUsuarioId ?? null,
        reason: 'dept_transfer_reuse',
      })

      return {
        forked: true,
        oldSessaoId,
        newSessaoId: existingDest.id,
        reason: 'Reusou sessão aberta do destino (mesmo card).',
      }
    }

    const newSessaoId = randomUUID()
    const { error: insertErr } = await supabase.from('crm_chat_threads').insert({
      id: newSessaoId,
      empresa_id: empresaId,
      canal_id: canalId,
      external_id: externalId,
      lead_id: leadId ?? card.lead_id ?? oldThread?.lead_id ?? null,
      card_id: cardId, // MESMO card — nunca cria crm_cards aqui
      departamento_id: toDepartamentoId,
      pipeline_id: toPipelineId,
      status: 'human',
      created_at: now,
      updated_at: now,
    })

    if (insertErr) {
      console.error('[ChatThread] fork insert:', insertErr.message)
      return {
        forked: false,
        oldSessaoId,
        newSessaoId: null,
        reason: insertErr.message,
      }
    }

    await supabase
      .from('crm_cards')
      .update({ conversa_id: newSessaoId, updated_at: now })
      .eq('id', cardId)
      .eq('empresa_id', empresaId)

    const fromLabel = input.fromDepartamentoNome || 'outro departamento'
    await supabase.from('crm_conversas').insert({
      sessao_id: newSessaoId,
      empresa_id: empresaId,
      canal_id: canalId,
      lead_id: leadId ?? card.lead_id ?? null,
      external_id: externalId,
      role: 'system',
      content: `Continuação do mesmo atendimento (encaminhado de ${fromLabel}). Histórico do departamento anterior não é compartilhado.`,
      direcao: 'outbound',
      last_message: `Encaminhado de ${fromLabel}`,
      status: 'human',
      metadata: {
        type: 'dept_transfer_fork',
        from_departamento_id: fromDepartamentoId,
        from_sessao_id: oldSessaoId,
        card_id: cardId,
      },
      created_at: now,
      updated_at: now,
    })

    await ActiveSpeakerService.activate(supabase, {
      empresaId,
      canalId,
      externalId,
      sessaoId: newSessaoId,
      departamentoId: toDepartamentoId,
      activatedBy: input.resolvedByUsuarioId ?? null,
      reason: 'dept_transfer_fork',
    })

    console.log(
      `[ChatThread] Fork dept card=${cardId} old=${oldSessaoId} new=${newSessaoId} ${fromDepartamentoId}→${toDepartamentoId}`,
    )

    return { forked: true, oldSessaoId, newSessaoId }
  }
  static async bindCardToInboundSession(
    supabase: SupabaseClient,
    input: {
      empresaId: string
      sessaoId: string
      cardId: string
      leadId: string
      pipelineId: string
      departamentoId?: string | null
      canalId?: string | null
      externalId?: string | null
      status?: string | null
    },
  ): Promise<ChatThread | null> {
    const now = new Date().toISOString()
    const existing = await this.getById(supabase, input.sessaoId)

    if (existing) {
      if (existing.empresa_id !== input.empresaId) {
        throw new Error('Thread pertence a outra empresa.')
      }

      // Thread de outro card: não rouba; só aponta o card para a sessão inbound
      if (existing.card_id && existing.card_id !== input.cardId) {
        await supabase
          .from('crm_cards')
          .update({ conversa_id: input.sessaoId, updated_at: now })
          .eq('id', input.cardId)
          .eq('empresa_id', input.empresaId)
        return existing
      }

      // Isolamento: nunca muda departamento_id da thread existente (histórico fica no depto).
      // Se o card precisa ir a outro depto, o caller deve usar forkSessionOnDepartmentTransfer.
      const deptMismatch =
        Boolean(input.departamentoId) &&
        Boolean(existing.departamento_id) &&
        input.departamentoId !== existing.departamento_id

      if (deptMismatch && existing.card_id === input.cardId) {
        const fork = await this.forkSessionOnDepartmentTransfer(supabase, {
          empresaId: input.empresaId,
          cardId: input.cardId,
          fromDepartamentoId: existing.departamento_id,
          toDepartamentoId: input.departamentoId ?? null,
          toPipelineId: input.pipelineId,
          leadId: input.leadId,
        })
        if (fork.newSessaoId) {
          return (await this.getById(supabase, fork.newSessaoId, input.empresaId)) ?? existing
        }
        return existing
      }

      const nextDept = deptMismatch
        ? existing.departamento_id // outro card / não forkável: preserva isolamento
        : (input.departamentoId ?? existing.departamento_id)

      const { data: updated, error } = await supabase
        .from('crm_chat_threads')
        .update({
          card_id: input.cardId,
          lead_id: input.leadId || existing.lead_id,
          pipeline_id: input.pipelineId || existing.pipeline_id,
          departamento_id: nextDept,
          status: existing.status === 'closed' ? 'human' : existing.status,
          updated_at: now,
        })
        .eq('id', input.sessaoId)
        .eq('empresa_id', input.empresaId)
        .select('*')
        .single()

      if (error) throw new Error(error.message)

      await supabase
        .from('crm_cards')
        .update({ conversa_id: input.sessaoId, updated_at: now })
        .eq('id', input.cardId)
        .eq('empresa_id', input.empresaId)

      return (updated as ChatThread) ?? existing
    }

    // Materializa thread a partir do histórico ou dos IDs informados
    let canalId = input.canalId ?? null
    let externalId = input.externalId ?? null

    if (!canalId || !externalId) {
      const { data: hist } = await supabase
        .from('crm_conversas')
        .select('canal_id, external_id')
        .eq('sessao_id', input.sessaoId)
        .eq('empresa_id', input.empresaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      canalId = canalId || (hist?.canal_id as string | null)
      externalId = externalId || (hist?.external_id as string | null)
    }

    if (!canalId || !externalId) {
      throw new Error(
        'Não foi possível materializar thread: canal_id/external_id ausentes.',
      )
    }

    const { data: created, error: createErr } = await supabase
      .from('crm_chat_threads')
      .insert({
        id: input.sessaoId,
        empresa_id: input.empresaId,
        canal_id: canalId,
        external_id: externalId,
        lead_id: input.leadId || null,
        card_id: input.cardId,
        departamento_id: input.departamentoId ?? null,
        pipeline_id: input.pipelineId || null,
        status: input.status || 'human',
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single()

    if (createErr || !created) {
      throw new Error(createErr?.message ?? 'Falha ao criar thread no bind.')
    }

    await supabase
      .from('crm_cards')
      .update({ conversa_id: input.sessaoId, updated_at: now })
      .eq('id', input.cardId)
      .eq('empresa_id', input.empresaId)

    return created as ChatThread
  }

  /**
   * Garante thread para o card.
   * - Mesmo depto: reusa sessão aberta.
   * - Depto diferente: FORK (fecha origem, cria sessão vazia no destino) — mesmo card_id.
   * - Nunca cria segundo crm_cards.
   */
  static async ensureThreadForCard(
    supabase: SupabaseClient,
    input: {
      empresaId: string
      canalId: string
      externalId: string
      leadId: string
      cardId: string
      pipelineId: string
      departamentoId?: string | null
      /** Se true, cria sessão nova mesmo que o card já tenha conversa_id compartilhada. */
      forceNewIfSharedPhone?: boolean
    },
  ): Promise<{ thread: ChatThread; created: boolean }> {
    const existing = await this.getOpenByCard(supabase, input.cardId, input.empresaId)
    if (existing) {
      const deptMismatch =
        Boolean(input.departamentoId) &&
        Boolean(existing.departamento_id) &&
        existing.departamento_id !== input.departamentoId

      if (!deptMismatch) {
        return { thread: existing, created: false }
      }

      // Isolamento: fork via transfer helper (mesmo card, sessão nova no destino)
      const fork = await this.forkSessionOnDepartmentTransfer(supabase, {
        empresaId: input.empresaId,
        cardId: input.cardId,
        fromDepartamentoId: existing.departamento_id,
        toDepartamentoId: input.departamentoId ?? null,
        toPipelineId: input.pipelineId,
        leadId: input.leadId,
      })
      if (fork.newSessaoId) {
        const dest = await this.getById(supabase, fork.newSessaoId, input.empresaId)
        if (dest) return { thread: dest, created: true }
      }
      // Se fork falhou, cai no fluxo abaixo
    }

    const { data: card } = await supabase
      .from('crm_cards')
      .select('id, conversa_id, pipeline_id')
      .eq('id', input.cardId)
      .eq('empresa_id', input.empresaId)
      .maybeSingle()

    // Reusa conversa_id do card só se já for thread própria (mesmo card + empresa)
    // e sem conflito de departamento.
    if (card?.conversa_id && /^[0-9a-fA-F-]{36}$/.test(card.conversa_id)) {
      const byId = await this.getById(supabase, card.conversa_id)
      if (byId && byId.empresa_id !== input.empresaId) {
        // Tenant errado — cria sessão nova
      } else if (
        byId &&
        byId.card_id === input.cardId &&
        byId.status !== 'closed' &&
        (!input.departamentoId ||
          !byId.departamento_id ||
          byId.departamento_id === input.departamentoId)
      ) {
        return { thread: byId, created: false }
      } else if (
        byId &&
        byId.card_id === input.cardId &&
        byId.departamento_id &&
        input.departamentoId &&
        byId.departamento_id !== input.departamentoId
      ) {
        // Mesmo card, depto diferente: fork (isolamento)
        const fork = await this.forkSessionOnDepartmentTransfer(supabase, {
          empresaId: input.empresaId,
          cardId: input.cardId,
          fromDepartamentoId: byId.departamento_id,
          toDepartamentoId: input.departamentoId,
          toPipelineId: input.pipelineId,
          leadId: input.leadId,
        })
        if (fork.newSessaoId) {
          const dest = await this.getById(supabase, fork.newSessaoId, input.empresaId)
          if (dest) return { thread: dest, created: true }
        }
      } else if (
        byId &&
        byId.departamento_id &&
        input.departamentoId &&
        byId.departamento_id !== input.departamentoId &&
        byId.card_id &&
        byId.card_id !== input.cardId
      ) {
        // Telefone com thread de OUTRO card/atendimento → não reaproveita; cria abaixo
      } else if (byId && byId.card_id && byId.card_id !== input.cardId) {
        // fall through to create
      } else if (byId && !byId.card_id) {
        // Thread legado sem card: reivindica para este card
        const { data: claimed } = await supabase
          .from('crm_chat_threads')
          .update({
            card_id: input.cardId,
            pipeline_id: input.pipelineId,
            departamento_id: input.departamentoId ?? null,
            lead_id: input.leadId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', byId.id)
          .eq('empresa_id', input.empresaId)
          .select('*')
          .single()
        if (claimed) {
          await supabase
            .from('crm_cards')
            .update({ conversa_id: claimed.id, updated_at: new Date().toISOString() })
            .eq('id', input.cardId)
            .eq('empresa_id', input.empresaId)
          return { thread: claimed as ChatThread, created: false }
        }
      } else if (!byId) {
        // Card aponta para sessão existente (ex.: só em crm_conversas) — materializa thread
        // com o MESMO id (não abandona histórico).
        const now = new Date().toISOString()
        const { data: materialised, error: matErr } = await supabase
          .from('crm_chat_threads')
          .insert({
            id: card.conversa_id,
            empresa_id: input.empresaId,
            canal_id: input.canalId,
            external_id: input.externalId,
            lead_id: input.leadId,
            card_id: input.cardId,
            departamento_id: input.departamentoId ?? null,
            pipeline_id: input.pipelineId,
            status: 'human',
            created_at: now,
            updated_at: now,
          })
          .select('*')
          .single()
        if (!matErr && materialised) {
          return { thread: materialised as ChatThread, created: true }
        }
        // conflito de PK / race → tenta ler de novo
        const again = await this.getById(supabase, card.conversa_id)
        if (again && again.empresa_id === input.empresaId) {
          return { thread: again, created: false }
        }
      }
    }

    // Antes de criar sessão nova: se já existe aberta neste depto para o card, reusa
    if (input.departamentoId) {
      const { data: destOpen } = await supabase
        .from('crm_chat_threads')
        .select('*')
        .eq('empresa_id', input.empresaId)
        .eq('card_id', input.cardId)
        .eq('departamento_id', input.departamentoId)
        .neq('status', 'closed')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (destOpen) {
        await supabase
          .from('crm_cards')
          .update({ conversa_id: destOpen.id, updated_at: new Date().toISOString() })
          .eq('id', input.cardId)
          .eq('empresa_id', input.empresaId)
        return { thread: destOpen as ChatThread, created: false }
      }
    }

    const sessaoId = randomUUID()
    const now = new Date().toISOString()
    const { data: created, error } = await supabase
      .from('crm_chat_threads')
      .insert({
        id: sessaoId,
        empresa_id: input.empresaId,
        canal_id: input.canalId,
        external_id: input.externalId,
        lead_id: input.leadId,
        card_id: input.cardId,
        departamento_id: input.departamentoId ?? null,
        pipeline_id: input.pipelineId,
        status: 'human',
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single()

    if (error || !created) {
      throw new Error(error?.message ?? 'Falha ao criar thread de conversa')
    }

    await supabase
      .from('crm_cards')
      .update({ conversa_id: sessaoId, updated_at: now })
      .eq('id', input.cardId)
      .eq('empresa_id', input.empresaId)

    return { thread: created as ChatThread, created: true }
  }

  static async syncThreadFromAppend(
    supabase: SupabaseClient,
    input: {
      sessaoId: string
      empresaId: string
      canalId: string
      externalId: string
      leadId?: string | null
      status?: string
      cardId?: string | null
      departamentoId?: string | null
      pipelineId?: string | null
    },
  ): Promise<void> {
    const now = new Date().toISOString()
    const { data: existing } = await supabase
      .from('crm_chat_threads')
      .select('id, status')
      .eq('id', input.sessaoId)
      .maybeSingle()

    if (existing) {
      // Não reabrir thread encerrada (ex.: card finalizado) — novo atendimento usa nova sessão
      const reopenBlocked = existing.status === 'closed' && input.status && input.status !== 'closed'
      await supabase
        .from('crm_chat_threads')
        .update({
          ...(reopenBlocked ? {} : input.status ? { status: input.status } : {}),
          updated_at: now,
          ...(input.leadId ? { lead_id: input.leadId } : {}),
          ...(input.cardId ? { card_id: input.cardId } : {}),
          ...(input.departamentoId ? { departamento_id: input.departamentoId } : {}),
          ...(input.pipelineId ? { pipeline_id: input.pipelineId } : {}),
        })
        .eq('id', input.sessaoId)
        .eq('empresa_id', input.empresaId)
      return
    }

    const { error } = await supabase.from('crm_chat_threads').insert({
      id: input.sessaoId,
      empresa_id: input.empresaId,
      canal_id: input.canalId,
      external_id: input.externalId,
      lead_id: input.leadId ?? null,
      card_id: input.cardId ?? null,
      departamento_id: input.departamentoId ?? null,
      pipeline_id: input.pipelineId ?? null,
      status: input.status ?? 'ai',
      created_at: now,
      updated_at: now,
    })
    if (error) {
      console.error('[ChatThread] syncThreadFromAppend insert:', error.message)
    }
  }

  static async countOpenThreadsForPhone(
    supabase: SupabaseClient,
    empresaId: string,
    canalId: string,
    externalId: string,
  ): Promise<number> {
    const { count } = await supabase
      .from('crm_chat_threads')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('canal_id', canalId)
      .eq('external_id', externalId)
      .neq('status', 'closed')
    return count ?? 0
  }
}
