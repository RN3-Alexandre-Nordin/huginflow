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

export type DocumentInboundOptions = {
  /**
   * Atendimento humano / silêncio da IA: baixa e anexa ao card da sessão,
   * sem OCR/classificação, sem auto-reply e sem criar card novo.
   */
  skipAutoReply?: boolean
}

/**
 * Pipeline inbound de documentos WhatsApp: OCR → classificar → match card → anexar → resposta automática.
 * Se OCR/IA falhar, o DocumentCardEnsurer garante card + handover (nunca fica sem encaminhamento).
 * Modo humano (skipAutoReply): só download + anexo — sem tokens de OCR.
 */
export class DocumentInboundService {
  static isEnabled(): boolean {
    return isDocumentPipelineEnabled()
  }

  static async process(
    message: HuginMessage,
    canal: CanalContext,
    supabase: SupabaseClient,
    options?: DocumentInboundOptions,
  ): Promise<boolean> {
    if (!this.isEnabled()) return false
    if (message.type !== 'document' && message.type !== 'image') return false

    const skipAutoReply = options?.skipAutoReply === true
    const empresaId = message.empresa_id
    const leadId = message.metadata?.lead_id as string | undefined
    const sessaoId = message.metadata?.conversa_id as string | undefined
    if (!empresaId || !leadId || !sessaoId) return false

    if (skipAutoReply) {
      return this.processHumanAttachOnly(message, canal, supabase, {
        empresaId,
        leadId,
        sessaoId,
      })
    }

    try {
      await ConversaHistoricoService.updateLatestSessaoStatus(
        sessaoId,
        empresaId,
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

      // Prioridade: card aberto da sessão (ex.: operador já em atendimento).
      const sessionCard = await this.findOpenCardOnSession(supabase, empresaId, sessaoId)
      if (sessionCard) {
        cardId = sessionCard.id
        responsavelId = sessionCard.responsavel_id
        reasons.push('Card aberto da sessão atual.')
      }

      if (!docResult.ok) {
        const categoria: DocumentCategory =
          inferCategoryFromHints(fileNameHint, message.content) ?? 'documento_nao_identificado'

        if (!cardId && !skipAutoReply) {
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
        } else if (!cardId && skipAutoReply) {
          reasons.push('Sem card na sessão — anexo não criado (modo humano / silêncio IA).')
        } else {
          handover = true
        }

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

        if (skipAutoReply) {
          await this.restoreHumanStatus(supabase, empresaId, sessaoId, responsavelId)
        } else {
          await this.sendAutoReply(message, canal, supabase, leadId, sessaoId, {
            text: docResult.tooLarge ? DOCUMENT_TOO_LARGE : autoReply,
            cardId,
            responsavelId,
            handover: true,
            reasoning: reasons.join(' '),
          })
        }
        return true
      }

      const { classification, buffer, fileName, mimeType } = docResult

      if (!cardId) {
        const match = await CardDocumentMatcher.findMatchingCard(supabase, {
          empresaId,
          leadId,
          sessaoId,
          categoria: classification.categoria,
        })

        if (match) {
          cardId = match.cardId
          reasons.push(match.matchReason)
          const { data: cardRow } = await supabase
            .from('crm_cards')
            .select('responsavel_id')
            .eq('id', cardId)
            .single()
          responsavelId = cardRow?.responsavel_id ?? null
          handover = true
        }
      }

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
          reasons.push(
            attach.deduplicated ? 'Anexo já existia (idempotente).' : 'Anexo salvo no card.',
          )
        } else {
          reasons.push(`Falha ao anexar: ${attach.error}`)
        }
        handover = true
        if (!skipAutoReply) {
          await this.applyHandover(supabase, empresaId, sessaoId, responsavelId)
        }
      } else if (!skipAutoReply) {
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
      } else {
        reasons.push('Sem card na sessão — anexo não criado (modo humano / silêncio IA).')
      }

      // Última rede de segurança (somente fluxo IA): se ainda sem card, força ensurer genérico
      if (!cardId && !skipAutoReply) {
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

      if (skipAutoReply) {
        await this.restoreHumanStatus(supabase, empresaId, sessaoId, responsavelId)
      } else {
        await this.sendAutoReply(message, canal, supabase, leadId, sessaoId, {
          text: autoReply,
          cardId,
          responsavelId,
          handover: handover || Boolean(cardId),
          reasoning: reasons.join(' '),
        })
      }

      return true
    } catch (err) {
      console.error('[DocumentInbound] Erro:', err)
      try {
        if (skipAutoReply) {
          const sessionCard = await this.findOpenCardOnSession(supabase, empresaId, sessaoId)
          await this.logDocumentReasoning(
            supabase,
            message,
            leadId,
            sessaoId,
            canal.id,
            [
              `Exception no pipeline (modo humano): ${err instanceof Error ? err.message : String(err)}`,
            ],
            sessionCard?.id ?? null,
            'documento_nao_identificado',
          )
          await this.restoreHumanStatus(
            supabase,
            empresaId,
            sessaoId,
            sessionCard?.responsavel_id ?? null,
          )
        } else {
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
        }
      } catch (inner) {
        console.error('[DocumentInbound] Fallback de exceção falhou:', inner)
        await ConversaHistoricoService.updateLatestSessaoStatus(
          sessaoId,
          empresaId,
          { status: skipAutoReply ? 'human' : 'ai' },
          supabase,
        )
      }
      return true
    }
  }

  /**
   * Atendimento humano: download + anexo ao card da sessão.
   * Sem OCR, sem classificação, sem auto-reply, sem criar card novo.
   */
  private static async processHumanAttachOnly(
    message: HuginMessage,
    canal: CanalContext,
    supabase: SupabaseClient,
    ctx: { empresaId: string; leadId: string; sessaoId: string },
  ): Promise<boolean> {
    const { empresaId, sessaoId } = ctx
    const reasons: string[] = []

    try {
      const downloaded = await DocumentProcessingService.downloadInboundMediaOnly(
        message,
        canal,
        supabase,
        {
          providerMessageId: message.id,
          sessaoId,
        },
      )
      reasons.push(downloaded.reasoning)

      const sessionCard = await this.findOpenCardOnSession(supabase, empresaId, sessaoId)
      const cardId: string | null = sessionCard?.id ?? null
      const responsavelId = sessionCard?.responsavel_id ?? null

      if (sessionCard) {
        reasons.push('Card aberto da sessão atual.')
      } else {
        reasons.push('Sem card na sessão — anexo não criado (modo humano / silêncio IA).')
      }

      if (
        cardId &&
        downloaded.buffer &&
        !(downloaded.ok === false && downloaded.tooLarge)
      ) {
        const attach = await CardAttachmentService.attachFromInbound(supabase, {
          cardId,
          empresaId,
          buffer: downloaded.buffer,
          fileName: downloaded.fileName || 'documento',
          mimeType: downloaded.mimeType || 'application/octet-stream',
          providerMessageId: message.id,
        })
        reasons.push(
          attach.ok
            ? attach.deduplicated
              ? 'Anexo já existia (idempotente).'
              : downloaded.ok
                ? 'Anexo salvo no card (sem OCR).'
                : 'Documento anexado ao card apesar de falha no metadata.'
            : `Falha ao anexar: ${attach.error}`,
        )
      }

      // Não grava bolha "(Documento WhatsApp)" no chat — só log de servidor (economia + UX).
      console.log(
        `[DocumentInbound] humano sessao=${sessaoId} card=${cardId ?? 'n/a'}: ${reasons.join(' ')}`,
      )
      await this.restoreHumanStatus(supabase, empresaId, sessaoId, responsavelId)
      return true
    } catch (err) {
      console.error('[DocumentInbound] Erro modo humano:', err)
      const sessionCard = await this.findOpenCardOnSession(supabase, empresaId, sessaoId)
      console.log(
        `[DocumentInbound] humano exception sessao=${sessaoId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      await this.restoreHumanStatus(
        supabase,
        empresaId,
        sessaoId,
        sessionCard?.responsavel_id ?? null,
      )
      return true
    }
  }

  private static async findOpenCardOnSession(
    supabase: SupabaseClient,
    empresaId: string,
    sessaoId: string,
  ): Promise<{ id: string; responsavel_id: string | null } | null> {
    const { data: byConversa } = await supabase
      .from('crm_cards')
      .select('id, responsavel_id')
      .eq('empresa_id', empresaId)
      .eq('conversa_id', sessaoId)
      .eq('finalizado', false)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (byConversa?.id) {
      return { id: byConversa.id, responsavel_id: byConversa.responsavel_id ?? null }
    }

    const { data: thread } = await supabase
      .from('crm_chat_threads')
      .select('card_id')
      .eq('id', sessaoId)
      .eq('empresa_id', empresaId)
      .maybeSingle()

    if (!thread?.card_id) return null

    const { data: byThread } = await supabase
      .from('crm_cards')
      .select('id, responsavel_id')
      .eq('id', thread.card_id)
      .eq('empresa_id', empresaId)
      .eq('finalizado', false)
      .maybeSingle()

    return byThread?.id
      ? { id: byThread.id, responsavel_id: byThread.responsavel_id ?? null }
      : null
  }

  private static async restoreHumanStatus(
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
        ...(responsavelId ? { atribuido_a_id: responsavelId } : {}),
        updated_at: now,
      })
      .eq('sessao_id', sessaoId)
      .eq('empresa_id', empresaId)

    await supabase
      .from('crm_chat_threads')
      .update({
        status: 'human',
        updated_at: now,
      })
      .eq('id', sessaoId)
      .eq('empresa_id', empresaId)
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
        .eq('empresa_id', empresaId)
    }

    if (handover) {
      await this.applyHandover(supabase, empresaId, sessaoId, responsavelId)
    } else {
      await ConversaHistoricoService.updateLatestSessaoStatus(
        sessaoId,
        empresaId,
        { status: 'ai' },
        supabase,
      )
    }
  }
}
