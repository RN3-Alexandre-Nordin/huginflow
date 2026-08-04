import OpenAI from 'openai'

export const AI_MODELS = [
  { value: 'gpt-4', label: 'GPT-4' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
] as const

export const DEFAULT_AI_MODEL = 'gpt-4'

export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-large'

export type EmpresaAiRow = {
  ai_model?: string | null
}

export type EmpresaAiConfig = {
  apiKey: string
  model: string
}

export function getOpenAiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim()
}

export function resolveEmpresaAiConfig(empresa: EmpresaAiRow): EmpresaAiConfig | null {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) return null

  const requested = empresa.ai_model?.trim()
  const model =
    requested && AI_MODELS.some((m) => m.value === requested) ? requested : DEFAULT_AI_MODEL

  return { apiKey, model }
}

export function getAiConfigErrorMessage(): string {
  return 'OPENAI_API_KEY não configurada no ambiente (.env / variáveis do servidor).'
}

export async function generateEmbedding(text: string, config: EmpresaAiConfig): Promise<number[]> {
  const client = new OpenAI({ apiKey: config.apiKey })
  const result = await client.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: text,
  })
  return result.data[0]?.embedding ?? []
}

export async function generateText(prompt: string, config: EmpresaAiConfig): Promise<string> {
  const client = new OpenAI({ apiKey: config.apiKey })
  const result = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
  })
  return result.choices[0]?.message?.content?.trim() ?? ''
}

export type TranscribeAudioOptions = {
  language?: string
  filename?: string
  mimeType?: string
}

/** Transcrição de áudio inbound (WhatsApp PTT) via OpenAI Whisper. */
export async function transcribeAudio(
  audioBuffer: Buffer,
  config: EmpresaAiConfig,
  options: TranscribeAudioOptions = {},
): Promise<string> {
  const client = new OpenAI({ apiKey: config.apiKey })
  const filename = options.filename ?? 'audio.ogg'
  const mimeType = options.mimeType ?? 'audio/ogg'
  const file = await OpenAI.toFile(audioBuffer, filename, { type: mimeType })

  const result = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: options.language ?? 'pt',
  })

  const text = result.text?.trim() ?? ''
  if (!text) {
    throw new Error('Whisper retornou transcrição vazia.')
  }
  return text
}
