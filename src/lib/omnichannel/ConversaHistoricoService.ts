import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export type SessaoSnapshot = {
  sessao_id: string
  status: string | null
  last_human_interaction: string | null
}

export type AppendConversaInput = {
  empresa_id: string
  canal_id: string
  external_id: string
  lead_id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  direcao: 'inbound' | 'outbound'
  status?: string
  last_human_interaction?: string | null
  metadata?: Record<string, unknown>
  is_ai?: boolean
}

/** Uma linha em crm_conversas por mensagem; sessao_id = thread do chat. */
export class ConversaHistoricoService {
  static async getLatestSessao(
    canalId: string,
    externalId: string,
    supabase: SupabaseClient,
  ): Promise<SessaoSnapshot | null> {
    const { data, error } = await supabase
      .from('crm_conversas')
      .select('sessao_id, status, last_human_interaction')
      .eq('canal_id', canalId)
      .eq('external_id', externalId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[ConversaHistorico] Erro ao buscar sessão:', error)
      return null
    }
    if (!data?.sessao_id) return null
    return data as SessaoSnapshot
  }

  static async appendMessage(
    input: AppendConversaInput,
    supabase: SupabaseClient,
  ): Promise<string | null> {
    const latest = await this.getLatestSessao(input.canal_id, input.external_id, supabase)
    const sessaoId = latest?.sessao_id ?? randomUUID()
    const now = new Date().toISOString()

    let status = input.status ?? latest?.status ?? 'ai'
    let lastHuman = input.last_human_interaction ?? latest?.last_human_interaction ?? null

    if (input.direcao === 'outbound' && !input.is_ai) {
      status = 'human'
      lastHuman = now
    } else if (!latest) {
      status = 'ai'
    }

    const { data, error } = await supabase
      .from('crm_conversas')
      .insert({
        sessao_id: sessaoId,
        empresa_id: input.empresa_id,
        canal_id: input.canal_id,
        lead_id: input.lead_id ?? null,
        external_id: input.external_id,
        role: input.role,
        content: input.content,
        direcao: input.direcao,
        last_message: input.content,
        status,
        last_human_interaction: lastHuman,
        metadata: input.metadata ?? {},
        created_at: now,
        updated_at: now,
      })
      .select('sessao_id')
      .single()

    if (error) {
      console.error('[ConversaHistorico] Erro ao inserir mensagem:', error)
      return null
    }

    console.log(
      `[ConversaHistorico] Linha criada sessao=${data?.sessao_id} role=${input.role} dir=${input.direcao}`,
    )
    return data?.sessao_id ?? null
  }

  static async updateLatestSessaoStatus(
    sessaoId: string,
    patch: Record<string, unknown>,
    supabase: SupabaseClient,
  ): Promise<void> {
    const { data: latest, error: findErr } = await supabase
      .from('crm_conversas')
      .select('id')
      .eq('sessao_id', sessaoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (findErr || !latest?.id) {
      console.error('[ConversaHistorico] Sessão não encontrada para update:', findErr)
      return
    }

    const { error } = await supabase
      .from('crm_conversas')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', latest.id)

    if (error) {
      console.error('[ConversaHistorico] Erro ao atualizar status da sessão:', error)
    }
  }
}
