import { HuginMessage } from '@/types/omnichannel'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeWhatsAppPhone } from '@/lib/omnichannel/phone'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'
import { isDeptSessionsEnabled } from '@/lib/omnichannel/dept-sessions-constants'
import { ActiveSpeakerService } from '@/lib/omnichannel/ChatThreadService'

export class TriageService {
  /**
   * Decide se a IA deve responder a uma mensagem recebida.
   */
  static async shouldAiRespond(
    message: HuginMessage,
    canalId: string,
    supabase: SupabaseClient,
  ): Promise<boolean> {
    const externalId = normalizeWhatsAppPhone(message.sender_id)

    let conversaQuery = supabase
      .from('crm_conversas')
      .select(
        `
        status,
        last_human_interaction,
        sessao_id,
        empresas (
          ia_silence_timeout
        )
      `,
      )
      .eq('empresa_id', message.empresa_id)
      .eq('canal_id', canalId)
      .eq('external_id', externalId)

    if (isDeptSessionsEnabled()) {
      const resolved = await ActiveSpeakerService.resolveInboundSessao(
        supabase,
        message.empresa_id,
        canalId,
        externalId,
      )
      if (resolved && !resolved.stale) {
        conversaQuery = conversaQuery.eq('sessao_id', resolved.sessaoId)
      }
    }

    const { data: conversa, error } = await conversaQuery
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
   * Com dept sessions: usa falante ativo quando válido.
   */
  static async recordInboundMessage(
    message: HuginMessage,
    canalId: string,
    supabase: SupabaseClient,
    leadId?: string,
  ): Promise<string | null> {
    const externalId = normalizeWhatsAppPhone(message.sender_id)
    message.sender_id = externalId

    let forcedSessao: string | undefined
    if (isDeptSessionsEnabled()) {
      const resolved = await ActiveSpeakerService.resolveInboundSessao(
        supabase,
        message.empresa_id,
        canalId,
        externalId,
      )
      if (resolved && !resolved.stale) {
        forcedSessao = resolved.sessaoId
        console.log(`[Triage] Inbound → falante ativo sessao=${forcedSessao}`)
      } else if (resolved?.stale) {
        console.log(`[Triage] Falante ativo stale sessao=${resolved.sessaoId} — usando legado/reuso`)
      }
    }

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
        sessao_id: forcedSessao,
      },
      supabase,
    )
  }

  /** @deprecated Use recordInboundMessage — mantido para compatibilidade interna */
  static async updateConversaState(
    message: HuginMessage,
    canalId: string,
    supabase: SupabaseClient,
    leadId?: string,
  ): Promise<string | null> {
    return this.recordInboundMessage(message, canalId, supabase, leadId)
  }
}
