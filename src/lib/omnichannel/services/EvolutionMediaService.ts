import { getResolvedEvolutionCreds } from '@/lib/omnichannel/evolution-config'

type CanalMediaFields = {
  provider_id: string
  provider_token?: string | null
  settings?: Record<string, unknown> | null
}

export type EvolutionRawMessage = {
  key?: {
    id?: string
    remoteJid?: string
    fromMe?: boolean
  }
  message?: Record<string, unknown>
  messageTimestamp?: number
}

export type FetchedEvolutionMedia = {
  buffer: Buffer
  mimeType: string
  base64Length: number
  fileName?: string
}

export type DocumentMessagePayload = {
  mimetype?: string
  fileName?: string
  fileLength?: number
  caption?: string
}

function unwrapMessage(raw: EvolutionRawMessage): Record<string, unknown> | null {
  if (!raw?.message) return null
  const m = raw.message as Record<string, unknown>
  const ephemeral = m.ephemeralMessage as { message?: Record<string, unknown> } | undefined
  return ephemeral?.message ?? m
}

/** Desembrulha documentMessage (direto ou ephemeral). */
export function extractDocumentMessagePayload(
  raw: EvolutionRawMessage | undefined,
): DocumentMessagePayload | null {
  const m = unwrapMessage(raw ?? ({} as EvolutionRawMessage))
  if (!m) return null

  const doc = m.documentMessage as Record<string, unknown> | undefined
  if (doc) {
    return {
      mimetype: doc.mimetype as string | undefined,
      fileName: (doc.fileName as string | undefined) ?? (doc.title as string | undefined),
      fileLength: doc.fileLength as number | undefined,
      caption: doc.caption as string | undefined,
    }
  }
  return null
}

/** Desembrulha imageMessage (foto de comprovante). */
export function extractImageMessagePayload(
  raw: EvolutionRawMessage | undefined,
): DocumentMessagePayload | null {
  const m = unwrapMessage(raw ?? ({} as EvolutionRawMessage))
  if (!m) return null

  const img = m.imageMessage as Record<string, unknown> | undefined
  if (img) {
    return {
      mimetype: img.mimetype as string | undefined,
      fileName: 'whatsapp-image.jpg',
      fileLength: img.fileLength as number | undefined,
      caption: img.caption as string | undefined,
    }
  }
  return null
}

function extensionForDocumentMime(mimeType: string, fileName?: string): string {
  if (fileName?.includes('.')) {
    return fileName.split('.').pop()!.toLowerCase()
  }
  if (mimeType.includes('pdf')) return 'pdf'
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  return 'bin'
}

/** Desembrulha audioMessage (PTT direto ou dentro de ephemeralMessage). */
export function extractAudioMessagePayload(
  raw: EvolutionRawMessage | undefined,
): { mimetype?: string; seconds?: number; ptt?: boolean } | null {
  if (!raw?.message) return null
  const m = raw.message as Record<string, unknown>

  const direct = m.audioMessage as Record<string, unknown> | undefined
  if (direct) {
    return {
      mimetype: direct.mimetype as string | undefined,
      seconds: direct.seconds as number | undefined,
      ptt: direct.ptt as boolean | undefined,
    }
  }

  const ephemeral = m.ephemeralMessage as { message?: Record<string, unknown> } | undefined
  const nested = ephemeral?.message?.audioMessage as Record<string, unknown> | undefined
  if (nested) {
    return {
      mimetype: nested.mimetype as string | undefined,
      seconds: nested.seconds as number | undefined,
      ptt: nested.ptt as boolean | undefined,
    }
  }

  return null
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  return 'ogg'
}

function parseBase64FromEvolutionResponse(data: Record<string, unknown>): string | null {
  if (typeof data.base64 === 'string' && data.base64.length > 0) {
    return data.base64.replace(/^data:[^;]+;base64,/, '')
  }
  const media = data.media as Record<string, unknown> | undefined
  if (typeof media?.base64 === 'string' && media.base64.length > 0) {
    return media.base64.replace(/^data:[^;]+;base64,/, '')
  }
  return null
}

/**
 * Baixa áudio da Evolution API (POST /chat/getBase64FromMediaMessage/{instance}).
 */
export class EvolutionMediaService {
  static async fetchAudioFromMessage(
    canal: CanalMediaFields,
    rawMessage: EvolutionRawMessage,
  ): Promise<FetchedEvolutionMedia> {
    const audioMeta = extractAudioMessagePayload(rawMessage)
    if (!audioMeta) {
      throw new Error('Payload não contém audioMessage.')
    }

    const { apiUrl, apiKey, instance } = getResolvedEvolutionCreds(canal)
    if (!apiUrl || !apiKey || !instance) {
      throw new Error('Credenciais Evolution incompletas para download de mídia.')
    }

    const messageId = rawMessage.key?.id
    if (!messageId) {
      throw new Error('message.key.id ausente no payload Evolution.')
    }

    const url = `${apiUrl.replace(/\/$/, '')}/chat/getBase64FromMediaMessage/${instance}`
    const body = {
      message: rawMessage,
      convertToMp4: false,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify(body),
    })

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>

    if (!response.ok) {
      console.error('[EvolutionMedia] getBase64 falhou:', response.status, data)
      throw new Error(
        `Evolution getBase64 HTTP ${response.status}: ${JSON.stringify(data).slice(0, 200)}`,
      )
    }

    const base64 = parseBase64FromEvolutionResponse(data)
    if (!base64) {
      throw new Error('Evolution não retornou base64 do áudio.')
    }

    const mimeType = audioMeta.mimetype ?? 'audio/ogg'
    const buffer = Buffer.from(base64, 'base64')

    if (buffer.length < 100) {
      throw new Error(`Áudio decodificado muito pequeno (${buffer.length} bytes).`)
    }

    return {
      buffer,
      mimeType,
      base64Length: base64.length,
    }
  }

  static filenameForMime(mimeType: string): string {
    return `whatsapp-audio.${extensionForMime(mimeType)}`
  }

  static filenameForDocument(mimeType: string, fileName?: string): string {
    const ext = extensionForDocumentMime(mimeType, fileName)
    const base = fileName?.replace(/[^\w.\-() ]+/g, '_') ?? 'whatsapp-document'
    return base.includes('.') ? base : `${base}.${ext}`
  }

  private static async fetchBase64Media(
    canal: CanalMediaFields,
    rawMessage: EvolutionRawMessage,
  ): Promise<FetchedEvolutionMedia> {
    const { apiUrl, apiKey, instance } = getResolvedEvolutionCreds(canal)
    if (!apiUrl || !apiKey || !instance) {
      throw new Error('Credenciais Evolution incompletas para download de mídia.')
    }

    const messageId = rawMessage.key?.id
    if (!messageId) {
      throw new Error('message.key.id ausente no payload Evolution.')
    }

    const url = `${apiUrl.replace(/\/$/, '')}/chat/getBase64FromMediaMessage/${instance}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({ message: rawMessage, convertToMp4: false }),
    })

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      console.error('[EvolutionMedia] getBase64 falhou:', response.status, data)
      throw new Error(
        `Evolution getBase64 HTTP ${response.status}: ${JSON.stringify(data).slice(0, 200)}`,
      )
    }

    const base64 = parseBase64FromEvolutionResponse(data)
    if (!base64) {
      throw new Error('Evolution não retornou base64 da mídia.')
    }

    const buffer = Buffer.from(base64, 'base64')
    if (buffer.length < 16) {
      throw new Error(`Mídia decodificada muito pequena (${buffer.length} bytes).`)
    }

    return {
      buffer,
      mimeType: 'application/octet-stream',
      base64Length: base64.length,
    }
  }

  static async fetchDocumentFromMessage(
    canal: CanalMediaFields,
    rawMessage: EvolutionRawMessage,
  ): Promise<FetchedEvolutionMedia> {
    const docMeta = extractDocumentMessagePayload(rawMessage)
    const imgMeta = extractImageMessagePayload(rawMessage)
    const meta = docMeta ?? imgMeta
    if (!meta) {
      throw new Error('Payload não contém documentMessage nem imageMessage.')
    }

    const fetched = await this.fetchBase64Media(canal, rawMessage)
    const mimeType = meta.mimetype ?? fetched.mimeType
    return {
      ...fetched,
      mimeType,
      fileName: this.filenameForDocument(mimeType, meta.fileName),
    }
  }
}
