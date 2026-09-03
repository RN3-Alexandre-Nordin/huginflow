import OpenAI from 'openai'

export const AI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (recomendado)' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano (mais barato)' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-4o', label: 'GPT-4o (qualidade / visão)' },
] as const

/** Modelo padrão para triagem, RAG e respostas — melhor custo-benefício estável. */
export const DEFAULT_AI_MODEL = 'gpt-4o-mini'

/** Modelo dedicado ao resumo de encaminhamento (alto volume, baixo custo). */
export const HANDOVER_SUMMARY_MODEL = 'gpt-4o-mini'

/** Modelos legados gravados no banco → equivalente atual. */
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'gpt-4': 'gpt-4o-mini',
}

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
  const normalized = requested ? (LEGACY_MODEL_ALIASES[requested] ?? requested) : DEFAULT_AI_MODEL
  const model = AI_MODELS.some((m) => m.value === normalized) ? normalized : DEFAULT_AI_MODEL

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

export type GenerateTextOptions = {
  maxTokens?: number
  temperature?: number
}

export async function generateText(
  prompt: string,
  config: EmpresaAiConfig,
  options: GenerateTextOptions = {},
): Promise<string> {
  const client = new OpenAI({ apiKey: config.apiKey })
  const result = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  })
  return result.choices[0]?.message?.content?.trim() ?? ''
}

const VISION_MODEL = 'gpt-4o'

/** Análise de imagem/PDF escaneado via GPT-4o vision. */
export async function analyzeImageWithVision(
  prompt: string,
  imageBuffer: Buffer,
  mimeType: string,
  config: EmpresaAiConfig,
): Promise<string> {
  const client = new OpenAI({ apiKey: config.apiKey })
  const base64 = imageBuffer.toString('base64')
  const result = await client.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ],
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
