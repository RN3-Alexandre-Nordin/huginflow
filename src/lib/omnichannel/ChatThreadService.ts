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
  ): Promise<ChatThread | null> {
    const { data } = await supabase
      .from('crm_chat_threads')
      .select('*')
      .eq('id', sessaoId)
      .maybeSingle()
    return (data as ChatThread | null) ?? null
  }

  static async getOpenByCard(
    supabase: SupabaseClient,
    cardId: string,
  ): Promise<ChatThread | null> {
    const { data } = await supabase
      .from('crm_chat_threads')
      .select('*')
      .eq('card_id', cardId)
      .neq('status', 'closed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as ChatThread | null) ?? null
  }

  /**
   * Garante thread para o card. Se card já tem conversa_id válida, reusa;
   * senão cria nova sessão isolada (não reaproveita a do telefone de outro depto).
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
    const existing = await this.getOpenByCard(supabase, input.cardId)
    if (existing) {
      return { thread: existing, created: false }
    }

    const { data: card } = await supabase
      .from('crm_cards')
      .select('id, conversa_id, pipeline_id')
      .eq('id', input.cardId)
      .eq('empresa_id', input.empresaId)
      .maybeSingle()

    // Reusa conversa_id do card só se já for uma thread própria (mesmo card_id)
    if (card?.conversa_id && /^[0-9a-fA-F-]{36}$/.test(card.conversa_id)) {
      const byId = await this.getById(supabase, card.conversa_id)
      if (byId && byId.card_id === input.cardId && byId.status !== 'closed') {
        return { thread: byId, created: false }
      }
      // conversa compartilhada com outro card/telefone → cria sessão nova para isolamento
      if (byId && byId.card_id && byId.card_id !== input.cardId) {
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
      .select('id')
      .eq('id', input.sessaoId)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('crm_chat_threads')
        .update({
          status: input.status ?? undefined,
          updated_at: now,
          ...(input.leadId ? { lead_id: input.leadId } : {}),
        })
        .eq('id', input.sessaoId)
      return
    }

    await supabase.from('crm_chat_threads').insert({
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
