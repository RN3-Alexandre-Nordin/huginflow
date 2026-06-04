import { RagnarMessage } from '@/types/omnichannel'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeWhatsAppPhone } from '@/lib/omnichannel/phone'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'

export class TriageService {
  /**
   * Decide se a IA deve responder a uma mensagem recebida.
   */
  static async shouldAiRespond(
    message: RagnarMessage,
    canalId: string,
    supabase: SupabaseClient,
  ): Promise<boolean> {
    const externalId = normalizeWhatsAppPhone(message.sender_id)

    const { data: conversa, error } = await supabase
      .from('crm_conversas')
      .select(`
        status,
        last_human_interaction,
        empresas (
          ia_silence_timeout
        )
      `)
      .eq('empresa_id', message.empresa_id)
      .eq('canal_id', canalId)
      .eq('external_id', externalId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[Triage] Erro ao buscar conversa:', error)
    }

    if (!conversa) {
      return true
    }

    if (conversa.status === 'human') {
      return false
    }

    if (conversa.status === 'closed') {
      return true
    }

    if (conversa.status === 'processing') {
      return false
    }

    if (conversa.last_human_interaction) {
      const lastInteraction = new Date(conversa.last_human_interaction).getTime()
      const diffInMinutes = (Date.now() - lastInteraction) / (1000 * 60)
      const timeout =
        (conversa.empresas as { ia_silence_timeout?: number } | null)?.ia_silence_timeout ?? 60

      if (diffInMinutes < timeout) {
        console.log(`[Triage] Silêncio IA ativo: ${diffInMinutes.toFixed(1)}m / ${timeout}m`)
        return false
      }
    }

    return !conversa.status || conversa.status === 'ai'
  }

  /**
   * Grava uma nova linha em crm_conversas (mensagem recebida) e retorna o sessao_id do thread.
   */
  static async recordInboundMessage(
    message: RagnarMessage,
    canalId: string,
    supabase: SupabaseClient,
    leadId?: string,
  ): Promise<string | null> {
    const externalId = normalizeWhatsAppPhone(message.sender_id)
    message.sender_id = externalId

    return ConversaHistoricoService.appendMessage(
      {
        empresa_id: message.empresa_id,
        canal_id: canalId,
        external_id: externalId,
        lead_id: leadId,
        role: 'user',
        content: message.content,
        direcao: 'inbound',
        metadata: message.metadata as Record<string, unknown> | undefined,
      },
      supabase,
    )
  }

  /** @deprecated Use recordInboundMessage — mantido para compatibilidade interna */
  static async updateConversaState(
    message: RagnarMessage,
    canalId: string,
    supabase: SupabaseClient,
    leadId?: string,
  ): Promise<string | null> {
    return this.recordInboundMessage(message, canalId, supabase, leadId)
  }
}
