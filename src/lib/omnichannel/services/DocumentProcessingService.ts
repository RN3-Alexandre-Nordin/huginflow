import type { SupabaseClient } from '@supabase/supabase-js'
import {
  EvolutionMediaService,
  extractDocumentMessagePayload,
  extractImageMessagePayload,
  type EvolutionRawMessage,
} from '@/lib/omnichannel/services/EvolutionMediaService'
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_PLACEHOLDER,
  DOCUMENT_PROCESS_FAILED,
  DOCUMENT_TOO_LARGE,
  ILLEGIBLE_DOCUMENT_OBSERVATION,
  isInboundDocumentType,
} from '@/lib/omnichannel/document-constants'
import {
  DocumentClassificationService,
  DocumentExtractionService,
  type DocumentClassification,
} from '@/lib/omnichannel/services/DocumentClassificationService'
import type { HuginMessage } from '@/types/omnichannel'

type CanalFields = {
  id: string
  provider_id: string
  provider_token?: string | null
  settings?: Record<string, unknown> | null
}

export type DocumentMediaMetadata = {
  media_type: 'document' | 'image'
  mimetype?: string
  file_name?: string
  file_length?: number
  document: {
    status: 'pending' | 'processed' | 'failed'
    categoria?: string
    confianca?: number
    legivel?: boolean
    resumo?: string
    extracted_text_preview?: string
    card_file_id?: string
    error?: string
    processed_at?: string
  }
}

export type ProcessedInboundDocument =
  | {
      ok: true
      classification: DocumentClassification
      buffer: Buffer
      fileName: string
      mimeType: string
      displayContent: string
      metadata: DocumentMediaMetadata
      reasoning: string
    }
  | {
      ok: false
      fallbackContent: string
      metadata: DocumentMediaMetadata
      reasoning: string
      error: string
      tooLarge?: boolean
      /** Presente quando o arquivo foi baixado mas a classificação/OCR falhou. */
      buffer?: Buffer
      fileName?: string
      mimeType?: string
    }

export class DocumentProcessingService {
  /**
   * Processa arquivo já em buffer (simulador / upload) — sem Evolution.
   */
  static async processUploadedBuffer(
    empresaId: string,
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    supabase: SupabaseClient,
    opts?: { caption?: string },
  ): Promise<ProcessedInboundDocument> {
    const mediaType: 'document' | 'image' = mimeType.startsWith('image/') ? 'image' : 'document'
    const baseMeta: DocumentMediaMetadata = {
      media_type: mediaType,
      mimetype: mimeType,
      file_name: fileName,
      file_length: buffer.length,
      document: { status: 'pending' },
    }

    if (buffer.length > DOCUMENT_MAX_BYTES) {
      return this.fail(
        baseMeta,
        `Arquivo excede ${DOCUMENT_MAX_BYTES} bytes`,
        DOCUMENT_TOO_LARGE,
        true,
        { buffer, fileName, mimeType },
      )
    }

    const aiConfig = await DocumentClassificationService.resolveAiConfig(supabase, empresaId)

    try {
      const { text: extractedText, legivel: legibleExtract } =
        await DocumentExtractionService.extractText(buffer, mimeType, aiConfig)

      const classification = await DocumentClassificationService.classify(
        extractedText,
        fileName,
        opts?.caption,
        aiConfig,
        legibleExtract,
      )

      const displayContent = classification.legivel
        ? `📎 ${classification.resumo}${extractedText ? `\n${extractedText.slice(0, 500)}${extractedText.length > 500 ? '…' : ''}` : ''}`
        : `📎 ${classification.resumo} (conteúdo parcial ou ilegível)`

      return {
        ok: true,
        classification,
        buffer,
        fileName,
        mimeType,
        displayContent,
        metadata: {
          ...baseMeta,
          document: {
            status: 'processed',
            categoria: classification.categoria,
            confianca: classification.confianca,
            legivel: classification.legivel,
            resumo: classification.resumo,
            extracted_text_preview: extractedText.slice(0, 500),
            processed_at: new Date().toISOString(),
          },
        },
        reasoning: `Documento classificado: ${classification.categoria} (conf=${classification.confianca})`,
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[DocumentProcessing] upload:', errMsg, err)
      return this.fail(baseMeta, errMsg, DOCUMENT_PROCESS_FAILED, false, {
        buffer,
        fileName,
        mimeType,
      })
    }
  }

  static async processInboundDocument(
    message: HuginMessage,
    canal: CanalFields,
    supabase: SupabaseClient,
    opts?: { providerMessageId?: string; sessaoId?: string },
  ): Promise<ProcessedInboundDocument> {
    const raw = message.metadata?.raw as EvolutionRawMessage | undefined
    const docMeta = extractDocumentMessagePayload(raw)
    const imgMeta = extractImageMessagePayload(raw)
    const meta = docMeta ?? imgMeta
    const mediaType: 'document' | 'image' = docMeta ? 'document' : 'image'

    const baseMeta: DocumentMediaMetadata = {
      media_type: mediaType,
      mimetype: meta?.mimetype,
      file_name: meta?.fileName,
      file_length: meta?.fileLength,
      document: { status: 'pending' },
    }

    if (!raw || !meta) {
      const failed = this.fail(baseMeta, 'Payload de mídia ausente.')
      await this.patchInteracao(supabase, message, opts, failed.fallbackContent, failed.metadata)
      return failed
    }

    try {
      const media = await EvolutionMediaService.fetchDocumentFromMessage(canal, raw)
      const processed = await this.processUploadedBuffer(
        message.empresa_id,
        media.buffer,
        media.mimeType,
        media.fileName ?? meta.fileName ?? 'documento',
        supabase,
        { caption: meta.caption ?? message.content },
      )

      if (processed.ok) {
        await this.patchInteracao(
          supabase,
          message,
          opts,
          processed.displayContent,
          processed.metadata,
        )
      } else {
        await this.patchInteracao(
          supabase,
          message,
          opts,
          processed.fallbackContent,
          processed.metadata,
        )
      }

      return processed
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[DocumentProcessing]', errMsg, err)
      const failed = this.fail(baseMeta, errMsg)
      await this.patchInteracao(supabase, message, opts, failed.fallbackContent, failed.metadata)
      return failed
    }
  }

  private static fail(
    baseMeta: DocumentMediaMetadata,
    error: string,
    fallbackContent = DOCUMENT_PROCESS_FAILED,
    tooLarge = false,
    media?: { buffer: Buffer; fileName: string; mimeType: string },
  ): Extract<ProcessedInboundDocument, { ok: false }> {
    return {
      ok: false,
      fallbackContent,
      metadata: {
        ...baseMeta,
        document: {
          status: 'failed',
          error,
          processed_at: new Date().toISOString(),
        },
      },
      reasoning: error,
      error,
      tooLarge,
      buffer: media?.buffer,
      fileName: media?.fileName,
      mimeType: media?.mimeType,
    }
  }

  private static async patchInteracao(
    supabase: SupabaseClient,
    message: HuginMessage,
    opts: { providerMessageId?: string; sessaoId?: string } | undefined,
    content: string,
    docMeta: DocumentMediaMetadata,
  ) {
    const providerMessageId =
      opts?.providerMessageId ?? (message.metadata?.provider_message_id as string | undefined)

    const mergedMetadata = {
      ...(message.metadata ?? {}),
      ...docMeta,
      provider: message.metadata?.provider ?? 'evolution',
    }

    const patchRow = async (rowId: string, prevMeta: Record<string, unknown>) => {
      await supabase
        .from('crm_interacoes')
        .update({
          content,
          metadata: { ...prevMeta, ...mergedMetadata },
        })
        .eq('id', rowId)
        .eq('empresa_id', message.empresa_id)
    }

    if (providerMessageId) {
      const { data: rows } = await supabase
        .from('crm_interacoes')
        .select('id, metadata')
        .eq('empresa_id', message.empresa_id)
        .contains('metadata', { provider_message_id: providerMessageId })
        .limit(1)

      const row = rows?.[0]
      if (row) {
        await patchRow(row.id, row.metadata as Record<string, unknown>)
      }
    } else if (opts?.sessaoId) {
      const { data: rows } = await supabase
        .from('crm_interacoes')
        .select('id, metadata')
        .eq('empresa_id', message.empresa_id)
        .eq('conversa_id', opts.sessaoId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1)

      const row = rows?.[0]
      if (row) {
        await patchRow(row.id, row.metadata as Record<string, unknown>)
      }
    }

    if (opts?.sessaoId) {
      const { data: conversas } = await supabase
        .from('crm_conversas')
        .select('id')
        .eq('sessao_id', opts.sessaoId)
        .eq('empresa_id', message.empresa_id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (conversas?.[0]) {
        await supabase
          .from('crm_conversas')
          .update({ last_message: content, updated_at: new Date().toISOString() })
          .eq('id', conversas[0].id)
          .eq('empresa_id', message.empresa_id)
      }
    }
  }
}

export function shouldProcessAsDocument(message: HuginMessage): boolean {
  return isInboundDocumentType(message.type)
}

export { DOCUMENT_PLACEHOLDER, ILLEGIBLE_DOCUMENT_OBSERVATION }
