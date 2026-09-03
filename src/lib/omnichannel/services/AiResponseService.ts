import type { SupabaseClient } from '@supabase/supabase-js'
import { GeminiChatService } from '@/lib/crm/GeminiChatService'
import { buildEvolutionProviderConfig } from '@/lib/omnichannel/evolution-config'
import { EvolutionProvider } from '@/lib/omnichannel/providers/EvolutionProvider'
import { HuginMessage } from '@/types/omnichannel'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'
import { SessionPersistenceService } from '@/lib/omnichannel/SessionPersistenceService'
import { AudioTranscriptionService } from '@/lib/omnichannel/services/AudioTranscriptionService'
import { DocumentInboundService } from '@/lib/omnichannel/services/DocumentInboundService'
import { shouldProcessAsDocument } from '@/lib/omnichannel/services/DocumentProcessingService'
import { TriageActionExecutor } from '@/lib/omnichannel/triage/TriageActionExecutor'
import { stripOutboundTags } from '@/lib/omnichannel/triage/parseTriageTags'
import {
  DEFAULT_OUT_OF_SCOPE_REPLY,
  evaluateMessageScope,
} from '@/lib/omnichannel/triage/scopeGate'

type CanalContext = {
  id: string
  provider_id: string
  provider_token?: string | null
  settings?: Record<string, unknown> | null
}

/**
 * Resposta automática omnichannel: IA + RAG + triagem estruturada (card/handover).
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

      if (shouldProcessAsDocument(message)) {
        const handled = await DocumentInboundService.process(message, canal, supabase)
        if (handled) return
      }

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

      const { data: openCard } = await supabase
        .from('crm_cards')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('lead_id', leadId)
        .eq('finalizado', false)
        .limit(1)
        .maybeSingle()

      const scope = await evaluateMessageScope(supabase, {
        empresaId,
        leadId,
        message: messageText,
        hasOpenCard: Boolean(openCard?.id),
      })

      console.log(
        `[AiResponse] ScopeGate inScope=${scope.inScope} via=${scope.via} reason=${scope.reason}`,
      )

      if (!scope.inScope) {
        await this.handleOutOfScope(supabase, message, canal, leadId, sessaoId, scope.reply, scope.reason)
        return
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
        await this.handleFailure(supabase, message, canal.id, leadId, sessaoId, aiResult.error)
        return
      }

      let { response, responseForWhatsApp, crmStatus, tags, facts } = aiResult

      if (tags.actions.includes('OUT_OF_SCOPE')) {
        const cleaned = stripOutboundTags(responseForWhatsApp || response)
        responseForWhatsApp =
          cleaned.length >= 12 ? cleaned : DEFAULT_OUT_OF_SCOPE_REPLY
        crmStatus = crmStatus ?? 'FORA_ESCOPO'
      }

      const triageResult = await TriageActionExecutor.execute(supabase, {
        empresaId,
        leadId,
        sessaoId,
        canalId: canal.id,
        contactPhone: message.sender_id,
        contactName: message.sender_name || 'Usuário WhatsApp',
        facts,
        tags,
      })

      console.log(
        `[AiResponse] Triagem: ${triageResult.reasoning} actions=${triageResult.executed.join(',') || 'none'}`,
      )

      const textToSend = responseForWhatsApp || stripOutboundTags(response)

      if (!textToSend) {
        await this.handleFailure(supabase, message, canal.id, leadId, sessaoId, 'Resposta vazia após limpeza.')
        return
      }

      const sessaoStatus = triageResult.handover ? 'human' : 'ai'

      const persist = await SessionPersistenceService.persistMessage(supabase, {
        empresaId,
        canalId: canal.id,
        externalId: message.sender_id,
        leadId,
        sessaoId,
        cardId: triageResult.cardId,
        role: 'assistant',
        content: textToSend,
        direcao: 'outbound',
        status: sessaoStatus,
        atribuidoAId: triageResult.responsavelId,
        isAi: true,
        contactPhone: message.sender_id,
        contactName: message.sender_name || 'Usuário WhatsApp',
        metadata: {
          provider: 'evolution',
          is_ai: true,
          crm_status: crmStatus ?? null,
          instance: message.metadata?.instance ?? canal.provider_id,
          triage_actions: triageResult.executed,
          card_id: triageResult.cardId,
          responsavel_id: triageResult.responsavelId,
          triage: tags.triage ?? null,
        },
      })

      if (!persist.success) {
        console.error('[AiResponse] Erro ao salvar resposta da IA:', persist.error)
      }

      const insertedMsgId = persist.interacaoId

      const config = buildEvolutionProviderConfig(canal)

      const provider = new EvolutionProvider()
      const sendResult = await provider.sendPlainMessage(
        message.sender_id,
        textToSend,
        config,
      )

      if (!sendResult.success) {
        console.error(
          `[AiResponse] Evolution sendText falhou instance=${config.provider_id} url=${(config.settings as { apiUrl?: string })?.apiUrl}`,
          sendResult.error,
        )
      }

      if (sendResult.success && insertedMsgId) {
        await supabase
          .from('crm_interacoes')
          .update({
            metadata: {
              provider: 'evolution',
              is_ai: true,
              crm_status: crmStatus ?? null,
              provider_message_id: sendResult.messageId,
              status: 'sent',
              triage_actions: triageResult.executed,
              card_id: triageResult.cardId,
              responsavel_id: triageResult.responsavelId,
            },
          })
          .eq('id', insertedMsgId)
      } else if (!sendResult.success) {
        console.error('[AiResponse] Falha ao enviar WhatsApp:', sendResult.error)
        if (insertedMsgId) {
          await supabase
            .from('crm_interacoes')
            .update({
              metadata: {
                is_ai: true,
                status: 'error',
                provider_error: sendResult.error,
              },
            })
            .eq('id', insertedMsgId)
        }
      }

      // Garante status human após append (sem last_human_interaction — freeze só com resposta humana)
      if (triageResult.handover) {
        await supabase
          .from('crm_conversas')
          .update({
            status: 'human',
            atribuido_a_id: triageResult.responsavelId,
            updated_at: new Date().toISOString(),
          })
          .eq('sessao_id', sessaoId)
          .eq('empresa_id', empresaId)
      }

      console.log(
        `[AiResponse] OK lead=${leadId} whatsapp=${sendResult.success} crmStatus=${crmStatus ?? 'n/a'} handover=${triageResult.handover}`,
      )
    } catch (error) {
      console.error('[AiResponse] Erro inesperado:', error)
      await ConversaHistoricoService.updateLatestSessaoStatus(sessaoId, { status: 'ai' }, supabase)
    }
  }

  private static async handleOutOfScope(
    supabase: SupabaseClient,
    message: HuginMessage,
    canal: CanalContext,
    leadId: string,
    sessaoId: string,
    reply: string,
    reason: string,
  ) {
    const empresaId = message.empresa_id
    const textToSend = reply.trim() || DEFAULT_OUT_OF_SCOPE_REPLY

    await SessionPersistenceService.persistMessage(supabase, {
      empresaId,
      canalId: canal.id,
      externalId: message.sender_id,
      leadId,
      sessaoId,
      role: 'system',
      content: '(Escopo IA)',
      direcao: 'outbound',
      contactPhone: message.sender_id,
      contactName: message.sender_name || 'Usuário WhatsApp',
      logSistema: `OUT_OF_SCOPE (gate): ${reason}`,
      metadata: {
        type: 'ai_scope_reasoning',
        action: 'OUT_OF_SCOPE',
        crm_status: 'FORA_ESCOPO',
      },
    })

    const persist = await SessionPersistenceService.persistMessage(supabase, {
      empresaId,
      canalId: canal.id,
      externalId: message.sender_id,
      leadId,
      sessaoId,
      role: 'assistant',
      content: textToSend,
      direcao: 'outbound',
      status: 'ai',
      isAi: true,
      contactPhone: message.sender_id,
      contactName: message.sender_name || 'Usuário WhatsApp',
      metadata: {
        provider: 'evolution',
        is_ai: true,
        crm_status: 'FORA_ESCOPO',
        triage_actions: ['OUT_OF_SCOPE'],
        scope_gate: true,
      },
    })

    const config = buildEvolutionProviderConfig(canal)
    const provider = new EvolutionProvider()
    const sendResult = await provider.sendPlainMessage(message.sender_id, textToSend, config)

    if (sendResult.success && persist.interacaoId) {
      await supabase
        .from('crm_interacoes')
        .update({
          metadata: {
            provider: 'evolution',
            is_ai: true,
            crm_status: 'FORA_ESCOPO',
            provider_message_id: sendResult.messageId,
            status: 'sent',
            triage_actions: ['OUT_OF_SCOPE'],
            scope_gate: true,
          },
        })
        .eq('id', persist.interacaoId)
    }

    await ConversaHistoricoService.updateLatestSessaoStatus(sessaoId, { status: 'ai' }, supabase)

    console.log(
      `[AiResponse] OUT_OF_SCOPE (gate) lead=${leadId} whatsapp=${sendResult.success} reason=${reason}`,
    )
  }

  private static async handleFailure(
    supabase: SupabaseClient,
    message: HuginMessage,
    canalId: string,
    leadId: string,
    sessaoId: string,
    reason: string,
  ) {
    console.error(`[AiResponse] FALHA: ${reason}`)

    await ConversaHistoricoService.updateLatestSessaoStatus(sessaoId, { status: 'ai' }, supabase)

    const errorLog = `Falha na IA (Gemini) para lead [${leadId}], WhatsApp ${message.sender_id}: ${reason}`

    await SessionPersistenceService.persistMessage(supabase, {
      empresaId: message.empresa_id,
      canalId,
      externalId: message.sender_id,
      leadId,
      sessaoId,
      role: 'system',
      content: '(Erro ao gerar resposta automática)',
      direcao: 'outbound',
      contactPhone: message.sender_id,
      contactName: message.sender_name || 'Usuário',
      logSistema: errorLog,
      metadata: { error: true, type: 'ai_failure' },
    })
  }
}
