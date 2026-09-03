import type { SupabaseClient } from '@supabase/supabase-js'
import { buildEvolutionProviderConfig } from '@/lib/omnichannel/evolution-config'
import { EvolutionProvider } from '@/lib/omnichannel/providers/EvolutionProvider'
import type { HuginMessage } from '@/types/omnichannel'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'
import { SessionPersistenceService } from '@/lib/omnichannel/SessionPersistenceService'
import { CardDocumentMatcher } from '@/lib/omnichannel/triage/CardDocumentMatcher'
import { CardAttachmentService } from '@/lib/omnichannel/services/CardAttachmentService'
import { DocumentCardEnsurer } from '@/lib/omnichannel/services/DocumentCardEnsurer'
import {
  DocumentProcessingService,
  ILLEGIBLE_DOCUMENT_OBSERVATION,
} from '@/lib/omnichannel/services/DocumentProcessingService'
import {
  DOCUMENT_AUTO_REPLY_IN_HOURS,
  DOCUMENT_AUTO_REPLY_OUT_HOURS,
  DOCUMENT_TOO_LARGE,
  inferCategoryFromHints,
  isDocumentPipelineEnabled,
  type DocumentCategory,
} from '@/lib/omnichannel/document-constants'
import { buildSystemFacts } from '@/lib/omnichannel/triage/systemFacts'

type CanalContext = {
  id: string
  provider_id: string
  provider_token?: string | null
  settings?: Record<string, unknown> | null
}

/**
 * Pipeline inbound de documentos WhatsApp: OCR → classificar → match card → anexar → resposta automática.
 * Se OCR/IA falhar, o DocumentCardEnsurer garante card + handover (nunca fica sem encaminhamento).
 */
export class DocumentInboundService {
  static isEnabled(): boolean {
    return isDocumentPipelineEnabled()
  }

  static async process(
    message: HuginMessage,
    canal: CanalContext,
    supabase: SupabaseClient,
  ): Promise<boolean> {
    if (!this.isEnabled()) return false
    if (message.type !== 'document' && message.type !== 'image') return false

    const empresaId = message.empresa_id
    const leadId = message.metadata?.lead_id as string | undefined
    const sessaoId = message.metadata?.conversa_id as string | undefined
    if (!empresaId || !leadId || !sessaoId) return false

    try {
      await ConversaHistoricoService.updateLatestSessaoStatus(
        sessaoId,
        { status: 'processing' },
        supabase,
      )

      const docResult = await DocumentProcessingService.processInboundDocument(
        message,
        canal,
        supabase,
        {
          providerMessageId: message.id,
          sessaoId,
        },
      )

      const facts = await buildSystemFacts(supabase, empresaId, leadId)
      const autoReply = facts.dentro_horario
        ? DOCUMENT_AUTO_REPLY_IN_HOURS
        : DOCUMENT_AUTO_REPLY_OUT_HOURS

      const reasons: string[] = [docResult.reasoning]
      let cardId: string | null = null
      let responsavelId: string | null = null
      let handover = false

      const fileNameHint =
        (docResult.ok ? docResult.fileName : docResult.fileName) ||
        (message.metadata as { file_name?: string } | undefined)?.file_name ||
        'documento'
      const mimeHint =
        (docResult.ok ? docResult.mimeType : docResult.mimeType) || 'application/octet-stream'
      const bufferHint = docResult.ok ? docResult.buffer : docResult.buffer

      if (!docResult.ok) {
        const categoria: DocumentCategory =
          inferCategoryFromHints(fileNameHint, message.content) ?? 'documento_nao_identificado'

        const ensured = await DocumentCardEnsurer.ensure(supabase, {
          empresaId,
          leadId,
          sessaoId,
          canalId: canal.id,
          contactPhone: message.sender_id,
          contactName: message.sender_name || 'Usuário WhatsApp',
          facts,
          categoria,
          resumo: `Documento recebido (${fileNameHint}) — processamento falhou: ${docResult.error}`,
          observacao: ILLEGIBLE_DOCUMENT_OBSERVATION,
          origem: 'whatsapp_document_failed',
          ilegivel: true,
        })
        cardId = ensured.cardId
        responsavelId = ensured.responsavelId
        handover = ensured.handover || Boolean(ensured.cardId)
        reasons.push(ensured.reasoning)

        if (cardId && bufferHint && !docResult.tooLarge) {
          const attach = await CardAttachmentService.attachFromInbound(supabase, {
            cardId,
            empresaId,
            buffer: bufferHint,
            fileName: fileNameHint,
            mimeType: mimeHint,
            providerMessageId: message.id,
          })
          reasons.push(
            attach.ok
              ? attach.deduplicated
                ? 'Anexo já existia.'
                : 'Documento anexado ao card (fallback).'
              : `Falha ao anexar no fallback: ${attach.error}`,
          )
        }

        await this.logDocumentReasoning(
          supabase,
          message,
          leadId,
          sessaoId,
          canal.id,
          reasons,
          cardId,
          categoria,
        )

        await this.sendAutoReply(message, canal, supabase, leadId, sessaoId, {
          text: docResult.tooLarge ? DOCUMENT_TOO_LARGE : autoReply,
          cardId,
          responsavelId,
          handover: true,
          reasoning: reasons.join(' '),
        })
        return true
      }

      const { classification, buffer, fileName, mimeType } = docResult

      const match = await CardDocumentMatcher.findMatchingCard(supabase, {
        empresaId,
        leadId,
        sessaoId,
        categoria: classification.categoria,
      })

      if (match) {
        cardId = match.cardId
        reasons.push(match.matchReason)
        const attach = await CardAttachmentService.attachFromInbound(supabase, {
          cardId,
          empresaId,
          buffer,
          fileName,
          mimeType,
          providerMessageId: message.id,
        })
        if (attach.ok) {
          reasons.push(
            attach.deduplicated ? 'Anexo já existia (idempotente).' : 'Anexo salvo no card.',
          )
        } else {
          reasons.push(`Falha ao anexar: ${attach.error}`)
        }

        const { data: cardRow } = await supabase
          .from('crm_cards')
          .select('responsavel_id')
          .eq('id', cardId)
          .single()
        responsavelId = cardRow?.responsavel_id ?? null
        handover = true
        await this.applyHandover(supabase, empresaId, sessaoId, responsavelId)
      } else {
        // Encaminhamento determinístico — não depende de tags CREATE_CARD da IA
        const ensured = await DocumentCardEnsurer.ensure(supabase, {
          empresaId,
          leadId,
          sessaoId,
          canalId: canal.id,
          contactPhone: message.sender_id,
          contactName: message.sender_name || 'Usuário WhatsApp',
          facts,
          categoria: classification.categoria,
          resumo: classification.resumo,
          observacao:
            !classification.legivel || classification.categoria === 'documento_nao_identificado'
              ? ILLEGIBLE_DOCUMENT_OBSERVATION
              : classification.resumo,
          origem: 'whatsapp_document',
          ilegivel: !classification.legivel,
        })
        cardId = ensured.cardId
        responsavelId = ensured.responsavelId
        handover = ensured.handover
        reasons.push(ensured.reasoning)

        if (cardId) {
          const attach = await CardAttachmentService.attachFromInbound(supabase, {
            cardId,
            empresaId,
            buffer,
            fileName,
            mimeType,
            providerMessageId: message.id,
          })
          if (attach.ok) {
            reasons.push('Documento anexado ao card criado/atualizado.')
          } else {
            reasons.push(`Falha ao anexar no novo card: ${attach.error}`)
          }
        }
      }

      // Última rede de segurança: se ainda sem card, força ensurer genérico
      if (!cardId) {
        const ensured = await DocumentCardEnsurer.ensure(supabase, {
          empresaId,
          leadId,
          sessaoId,
          canalId: canal.id,
          contactPhone: message.sender_id,
          contactName: message.sender_name || 'Usuário WhatsApp',
          facts,
          categoria: 'documento_nao_identificado',
          resumo: `Documento ${fileName} — encaminhamento de emergência`,
          observacao: ILLEGIBLE_DOCUMENT_OBSERVATION,
          origem: 'whatsapp_document_emergency',
          ilegivel: true,
        })
        cardId = ensured.cardId
        responsavelId = ensured.responsavelId
        handover = ensured.handover || Boolean(ensured.cardId)
        reasons.push(`Emergência: ${ensured.reasoning}`)
        if (cardId) {
          await CardAttachmentService.attachFromInbound(supabase, {
            cardId,
            empresaId,
            buffer,
            fileName,
            mimeType,
            providerMessageId: message.id,
          })
        }
      }

      await this.logDocumentReasoning(
        supabase,
        message,
        leadId,
        sessaoId,
        canal.id,
        reasons,
        cardId,
        classification.categoria,
      )

      await this.sendAutoReply(message, canal, supabase, leadId, sessaoId, {
        text: autoReply,
        cardId,
        responsavelId,
        handover: handover || Boolean(cardId),
        reasoning: reasons.join(' '),
      })

      return true
    } catch (err) {
      console.error('[DocumentInbound] Erro:', err)
      try {
        const facts = await buildSystemFacts(supabase, empresaId, leadId)
        const ensured = await DocumentCardEnsurer.ensure(supabase, {
          empresaId,
          leadId,
          sessaoId,
          canalId: canal.id,
          contactPhone: message.sender_id,
          contactName: message.sender_name || 'Usuário WhatsApp',
          facts,
          categoria: 'documento_nao_identificado',
          resumo: 'Documento WhatsApp — erro inesperado no pipeline; análise manual.',
          observacao: ILLEGIBLE_DOCUMENT_OBSERVATION,
          origem: 'whatsapp_document_exception',
          ilegivel: true,
        })
        await this.sendAutoReply(message, canal, supabase, leadId, sessaoId, {
          text: DOCUMENT_AUTO_REPLY_IN_HOURS,
          cardId: ensured.cardId,
          responsavelId: ensured.responsavelId,
          handover: true,
          reasoning: `Exception no pipeline. ${ensured.reasoning}`,
        })
      } catch (inner) {
        console.error('[DocumentInbound] Fallback de exceção falhou:', inner)
        await ConversaHistoricoService.updateLatestSessaoStatus(sessaoId, { status: 'ai' }, supabase)
      }
      return true
    }
  }

  private static async logDocumentReasoning(
    supabase: SupabaseClient,
    message: HuginMessage,
    leadId: string,
    sessaoId: string,
    canalId: string,
    reasons: string[],
    cardId: string | null,
    categoria: string,
  ) {
    await SessionPersistenceService.persistMessage(supabase, {
      empresaId: message.empresa_id,
      canalId,
      externalId: message.sender_id,
      leadId,
      sessaoId,
      cardId,
      role: 'system',
      content: '(Documento WhatsApp)',
      direcao: 'outbound',
      contactPhone: message.sender_id,
      contactName: message.sender_name || 'Usuário WhatsApp',
      logSistema: reasons.join(' '),
      metadata: {
        type: 'whatsapp_document_reasoning',
        card_id: cardId,
        categoria,
      },
    })
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

  private static async sendAutoReply(
    message: HuginMessage,
    canal: CanalContext,
    supabase: SupabaseClient,
    leadId: string,
    sessaoId: string,
    opts: {
      text: string
      cardId: string | null
      responsavelId: string | null
      handover: boolean
      reasoning: string
    },
  ) {
    const { text, cardId, responsavelId, handover } = opts
    const empresaId = message.empresa_id

    const persist = await SessionPersistenceService.persistMessage(supabase, {
      empresaId,
      canalId: canal.id,
      externalId: message.sender_id,
      leadId,
      sessaoId,
      cardId,
      role: 'assistant',
      content: text,
      direcao: 'outbound',
      status: handover ? 'human' : 'ai',
      atribuidoAId: responsavelId,
      isAi: true,
      contactPhone: message.sender_id,
      contactName: message.sender_name || 'Usuário WhatsApp',
      metadata: {
        provider: 'evolution',
        is_ai: true,
        document_auto_reply: true,
        card_id: cardId,
        responsavel_id: responsavelId,
      },
    })

    const insertedMsgId = persist.interacaoId

    const config = buildEvolutionProviderConfig(canal)
    const provider = new EvolutionProvider()
    const sendResult = await provider.sendPlainMessage(
      message.sender_id,
      text,
      config,
    )

    if (sendResult.success && insertedMsgId) {
      await supabase
        .from('crm_interacoes')
        .update({
          metadata: {
            provider: 'evolution',
            is_ai: true,
            document_auto_reply: true,
            provider_message_id: sendResult.messageId,
            status: 'sent',
            card_id: cardId,
          },
        })
        .eq('id', insertedMsgId)
    }

    if (handover) {
      await this.applyHandover(supabase, empresaId, sessaoId, responsavelId)
    } else {
      await ConversaHistoricoService.updateLatestSessaoStatus(sessaoId, { status: 'ai' }, supabase)
    }
  }
}
