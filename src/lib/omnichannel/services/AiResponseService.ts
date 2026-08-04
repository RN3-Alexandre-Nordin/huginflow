import type { SupabaseClient } from '@supabase/supabase-js'
import { GeminiChatService } from '@/lib/crm/GeminiChatService'
import { buildEvolutionProviderConfig } from '@/lib/omnichannel/evolution-config'
import { EvolutionProvider } from '@/lib/omnichannel/providers/EvolutionProvider'
import { HuginMessage } from '@/types/omnichannel'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'
import { WHATSAPP_SENDER_LABELS } from '@/lib/omnichannel/whatsapp-outbound'
import { AudioTranscriptionService } from '@/lib/omnichannel/services/AudioTranscriptionService'
type CanalContext = {
  id: string
  provider_id: string
  provider_token?: string | null
  settings?: Record<string, unknown> | null
}

/**
 * Resposta automática omnichannel: mesma IA do Simulador (Gemini + RAG),
 * persiste no Supabase e envia texto pelo WhatsApp (Evolution).
 */
export class AiResponseService {
  static async processAutoResponse(
    message: HuginMessage,
    canal: CanalContext,
    supabase: SupabaseClient,
  ) {
    const empresaId = message.empresa_id
    const leadId = message.metadata?.lead_id as string | undefined
    const sessaoId = message.metadata?.conversa_id as string | undefined

    if (!empresaId || !leadId || !sessaoId) {
      console.error(
        `[AiResponse] Metadados insuficientes: empresa=${empresaId}, lead=${leadId}, sessao=${sessaoId}`,
      )
      return
    }

    try {
      await ConversaHistoricoService.updateLatestSessaoStatus(
        sessaoId,
        { status: 'processing' },
        supabase,
      )

      let messageText = message.content

      if (message.type === 'audio') {
        const transcription = await AudioTranscriptionService.transcribeInboundAudio(
          message,
          canal,
          supabase,
          {
            providerMessageId: message.id,
            sessaoId,
          },
        )

        console.log(`[AiResponse] Transcrição áudio: ${transcription.reasoning}`)

        messageText = transcription.ok ? transcription.text : transcription.fallbackText
        message.content = messageText
      }

      const aiResult = await GeminiChatService.generateReply(supabase, {
        empresaId,
        leadId,
        conversaId: sessaoId,
        contactPhone: message.sender_id,
        contactName: message.sender_name || 'Usuário WhatsApp',
        message: messageText,
      })

      if (!aiResult.success) {
        await this.handleFailure(supabase, message, leadId, sessaoId, aiResult.error)
        return
      }

      const { response, responseForWhatsApp, crmStatus } = aiResult
      const textToSend = responseForWhatsApp || response

      if (!textToSend) {
        await this.handleFailure(supabase, message, leadId, sessaoId, 'Resposta vazia após limpeza.')
        return
      }

      const { data: insertedMsg, error: insertError } = await supabase
        .from('crm_interacoes')
        .insert({
          empresa_id: empresaId,
          lead_id: leadId,
          conversa_id: sessaoId,
          contact_phone: message.sender_id,
          contact_name: message.sender_name || 'Usuário WhatsApp',
          role: 'assistant',
          content: response,
          metadata: {
            provider: 'evolution',
            is_ai: true,
            crm_status: crmStatus ?? null,
            instance: message.metadata?.instance ?? canal.provider_id,
          },
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('[AiResponse] Erro ao salvar resposta da IA:', insertError)
      }

      const config = buildEvolutionProviderConfig(canal)

      const provider = new EvolutionProvider()
      const sendResult = await provider.sendMessageWithSenderLabel(
        message.sender_id,
        WHATSAPP_SENDER_LABELS.ai,
        textToSend,
        config,
      )

      if (!sendResult.success) {
        console.error(
          `[AiResponse] Evolution sendText falhou instance=${config.provider_id} url=${(config.settings as { apiUrl?: string })?.apiUrl}`,
          sendResult.error,
        )
      }

      if (sendResult.success && insertedMsg?.id) {
        await supabase
          .from('crm_interacoes')
          .update({
            metadata: {
              provider: 'evolution',
              is_ai: true,
              crm_status: crmStatus ?? null,
              provider_message_id: sendResult.messageId,
              status: 'sent',
            },
          })
          .eq('id', insertedMsg.id)
      } else if (!sendResult.success) {
        console.error('[AiResponse] Falha ao enviar WhatsApp:', sendResult.error)
        if (insertedMsg?.id) {
          await supabase
            .from('crm_interacoes')
            .update({
              metadata: {
                is_ai: true,
                status: 'error',
                provider_error: sendResult.error,
              },
            })
            .eq('id', insertedMsg.id)
        }
      }

      await ConversaHistoricoService.appendMessage(
        {
          empresa_id: empresaId,
          canal_id: canal.id,
          external_id: message.sender_id,
          lead_id: leadId,
          role: 'assistant',
          content: response,
          direcao: 'outbound',
          status: 'ai',
          is_ai: true,
          metadata: {
            provider: 'evolution',
            is_ai: true,
            crm_status: crmStatus ?? null,
            provider_message_id: sendResult.messageId,
          },
        },
        supabase,
      )

      console.log(
        `[AiResponse] OK lead=${leadId} whatsapp=${sendResult.success} crmStatus=${crmStatus ?? 'n/a'}`,
      )
    } catch (error) {
      console.error('[AiResponse] Erro inesperado:', error)
      await ConversaHistoricoService.updateLatestSessaoStatus(sessaoId, { status: 'ai' }, supabase)
    }
  }

  private static async handleFailure(
    supabase: SupabaseClient,
    message: HuginMessage,
    leadId: string,
    sessaoId: string,
    reason: string,
  ) {
    console.error(`[AiResponse] FALHA: ${reason}`)

    await ConversaHistoricoService.updateLatestSessaoStatus(sessaoId, { status: 'ai' }, supabase)

    const errorLog = `Falha na IA (Gemini) para lead [${leadId}], WhatsApp ${message.sender_id}: ${reason}`

    await supabase.from('crm_interacoes').insert({
      empresa_id: message.empresa_id,
      lead_id: leadId,
      conversa_id: sessaoId,
      contact_phone: message.sender_id,
      contact_name: message.sender_name || 'Usuário',
      role: 'system',
      content: '(Erro ao gerar resposta automática)',
      log_sistema: errorLog,
      metadata: { error: true, type: 'ai_failure' },
    })
  }
}
