import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveEmpresaAiConfig,
  transcribeAudio,
  getAiConfigErrorMessage,
} from '@/lib/ai/empresa-ai'
import {
  EvolutionMediaService,
  extractAudioMessagePayload,
  type EvolutionRawMessage,
} from '@/lib/omnichannel/services/EvolutionMediaService'
import type { HuginMessage } from '@/types/omnichannel'
import {
  AUDIO_PLACEHOLDER,
  AUDIO_TRANSCRIPTION_FAILED,
} from '@/lib/omnichannel/audio-transcription-constants'

export { AUDIO_PLACEHOLDER, AUDIO_TRANSCRIPTION_FAILED }

type CanalFields = {
  id: string
  provider_id: string
  provider_token?: string | null
  settings?: Record<string, unknown> | null
}

export type TranscriptionMetadata = {
  media_type: 'audio'
  mimetype?: string
  ptt?: boolean
  duration_seconds?: number
  transcription: {
    status: 'pending' | 'completed' | 'failed'
    provider?: string
    language?: string
    text?: string
    error?: string
    processed_at?: string
  }
}

export type TranscriptionResult =
  | {
      ok: true
      text: string
      metadata: TranscriptionMetadata
      reasoning: string
    }
  | {
      ok: false
      fallbackText: string
      metadata: TranscriptionMetadata
      reasoning: string
      error: string
    }

function buildTranscriptionMeta(
  audioInfo: { mimetype?: string; ptt?: boolean; seconds?: number } | null,
  patch: TranscriptionMetadata['transcription'],
): TranscriptionMetadata {
  return {
    media_type: 'audio',
    mimetype: audioInfo?.mimetype,
    ptt: audioInfo?.ptt,
    duration_seconds: audioInfo?.seconds,
    transcription: patch,
  }
}

async function resolveAiConfigForEmpresa(
  supabase: SupabaseClient,
  empresaId: string,
): Promise<ReturnType<typeof resolveEmpresaAiConfig>> {
  const { data: empresa } = await supabase
    .from('empresas')
    .select('ai_model')
    .eq('id', empresaId)
    .single()
  return empresa ? resolveEmpresaAiConfig(empresa) : null
}

export class AudioTranscriptionService {
  /**
   * Transcreve buffer de áudio enviado diretamente (simulador / upload).
   */
  static async transcribeUploadedBuffer(
    empresaId: string,
    buffer: Buffer,
    mimeType: string,
    filename: string,
    supabase: SupabaseClient,
    opts?: { ptt?: boolean },
  ): Promise<TranscriptionResult> {
    const audioMeta = { mimetype: mimeType, ptt: opts?.ptt ?? true }

    const aiConfig = await resolveAiConfigForEmpresa(supabase, empresaId)
    if (!aiConfig) {
      const meta = buildTranscriptionMeta(audioMeta, {
        status: 'failed',
        error: getAiConfigErrorMessage(),
        processed_at: new Date().toISOString(),
      })
      return {
        ok: false,
        fallbackText: AUDIO_TRANSCRIPTION_FAILED,
        metadata: meta,
        reasoning: 'OPENAI_API_KEY ausente — transcrição impossível.',
        error: getAiConfigErrorMessage(),
      }
    }

    try {
      if (buffer.length < 100) {
        throw new Error(`Áudio muito pequeno (${buffer.length} bytes).`)
      }

      const text = await transcribeAudio(buffer, aiConfig, {
        language: 'pt',
        filename,
        mimeType,
      })

      const completedMeta = buildTranscriptionMeta(audioMeta, {
        status: 'completed',
        provider: 'openai-whisper',
        language: 'pt',
        text,
        processed_at: new Date().toISOString(),
      })

      const reasoning = `Áudio transcrito (${buffer.length} bytes, ${mimeType}) → "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`

      return {
        ok: true,
        text,
        metadata: completedMeta,
        reasoning,
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erro desconhecido na transcrição'
      console.error('[AudioTranscription] upload:', errMsg, err)

      const failedMeta = buildTranscriptionMeta(audioMeta, {
        status: 'failed',
        error: errMsg,
        processed_at: new Date().toISOString(),
      })

      return {
        ok: false,
        fallbackText: AUDIO_TRANSCRIPTION_FAILED,
        metadata: failedMeta,
        reasoning: `Falha na transcrição: ${errMsg}`,
        error: errMsg,
      }
    }
  }

  /**
   * Baixa áudio na Evolution, transcreve com Whisper e atualiza crm_interacoes.
   */
  static async transcribeInboundAudio(
    message: HuginMessage,
    canal: CanalFields,
    supabase: SupabaseClient,
    opts?: { providerMessageId?: string; sessaoId?: string },
  ): Promise<TranscriptionResult> {
    const raw = message.metadata?.raw as EvolutionRawMessage | undefined
    const audioMeta = extractAudioMessagePayload(raw)

    const aiConfig = await resolveAiConfigForEmpresa(supabase, message.empresa_id)
    if (!aiConfig) {
      const meta = buildTranscriptionMeta(audioMeta, {
        status: 'failed',
        error: getAiConfigErrorMessage(),
        processed_at: new Date().toISOString(),
      })
      await this.patchInteracaoContent(supabase, message, opts, AUDIO_TRANSCRIPTION_FAILED, meta)
      return {
        ok: false,
        fallbackText: AUDIO_TRANSCRIPTION_FAILED,
        metadata: meta,
        reasoning: 'OPENAI_API_KEY ausente — transcrição impossível.',
        error: getAiConfigErrorMessage(),
      }
    }

    try {
      if (!raw) {
        throw new Error('metadata.raw ausente — impossível baixar áudio na Evolution.')
      }

      const media = await EvolutionMediaService.fetchAudioFromMessage(canal, raw)

      const text = await transcribeAudio(media.buffer, aiConfig, {
        language: 'pt',
        filename: EvolutionMediaService.filenameForMime(media.mimeType),
        mimeType: media.mimeType,
      })

      const completedMeta = buildTranscriptionMeta(audioMeta, {
        status: 'completed',
        provider: 'openai-whisper',
        language: 'pt',
        text,
        processed_at: new Date().toISOString(),
      })

      const displayText = `🎤 ${text}`

      await this.patchInteracaoContent(supabase, message, opts, displayText, completedMeta)

      const reasoning = `Áudio transcrito (${media.buffer.length} bytes, ${media.mimeType}) → "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`

      return {
        ok: true,
        text,
        metadata: completedMeta,
        reasoning,
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erro desconhecido na transcrição'
      console.error('[AudioTranscription]', errMsg, err)

      const failedMeta = buildTranscriptionMeta(audioMeta, {
        status: 'failed',
        error: errMsg,
        processed_at: new Date().toISOString(),
      })

      await this.patchInteracaoContent(
        supabase,
        message,
        opts,
        AUDIO_TRANSCRIPTION_FAILED,
        failedMeta,
      )

      return {
        ok: false,
        fallbackText: AUDIO_TRANSCRIPTION_FAILED,
        metadata: failedMeta,
        reasoning: `Falha na transcrição: ${errMsg}`,
        error: errMsg,
      }
    }
  }

  private static async patchInteracaoContent(
    supabase: SupabaseClient,
    message: HuginMessage,
    opts: { providerMessageId?: string; sessaoId?: string } | undefined,
    content: string,
    transcriptionMeta: TranscriptionMetadata,
  ) {
    const providerMessageId =
      opts?.providerMessageId ?? (message.metadata?.provider_message_id as string | undefined)

    const mergedMetadata = {
      ...(message.metadata ?? {}),
      ...transcriptionMeta,
      provider: message.metadata?.provider ?? 'evolution',
    }

    if (providerMessageId) {
      const { data: rows, error: findError } = await supabase
        .from('crm_interacoes')
        .select('id, metadata')
        .eq('empresa_id', message.empresa_id)
        .contains('metadata', { provider_message_id: providerMessageId })
        .limit(1)

      if (findError) {
        console.error('[AudioTranscription] Erro ao localizar interação:', findError)
        return
      }

      const row = rows?.[0]
      if (!row) return

      const { error } = await supabase
        .from('crm_interacoes')
        .update({
          content,
          metadata: { ...(row.metadata as Record<string, unknown>), ...mergedMetadata },
        })
        .eq('id', row.id)
        .eq('empresa_id', message.empresa_id)

      if (error) {
        console.error('[AudioTranscription] Erro ao atualizar crm_interacoes:', error)
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
        await supabase
          .from('crm_interacoes')
          .update({
            content,
            metadata: { ...(row.metadata as Record<string, unknown>), ...mergedMetadata },
          })
          .eq('id', row.id)
          .eq('empresa_id', message.empresa_id)
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

      const conversa = conversas?.[0]
      if (conversa) {
        await supabase
          .from('crm_conversas')
          .update({
            last_message: content,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversa.id)
          .eq('empresa_id', message.empresa_id)
      }
    }
  }
}
