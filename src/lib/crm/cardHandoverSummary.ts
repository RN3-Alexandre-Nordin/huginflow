import type { SupabaseClient } from '@supabase/supabase-js'
import {
  generateText,
  getAiConfigErrorMessage,
  HANDOVER_SUMMARY_MODEL,
  resolveEmpresaAiConfig,
} from '@/lib/ai/empresa-ai'

export type HandoverUrgencia = 'baixa' | 'normal' | 'alta'

export const HANDOVER_URGENCIA_LABELS: Record<HandoverUrgencia, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
}

export const HANDOVER_URGENCIA_LEVELS: HandoverUrgencia[] = ['baixa', 'normal', 'alta']

const VALID_URGENCIAS = new Set<HandoverUrgencia>(['baixa', 'normal', 'alta'])

const HANDOVER_AGENT_INSTRUCTIONS = `Você é o agente de briefing de encaminhamento entre departamentos no CRM Hugin Flow.

Leia o histórico da conversa WhatsApp e preencha os campos abaixo em português, de forma objetiva e factual.

NÃO inclua urgência nos textos — ela vai em campo separado.

Analise tom, sentimento e contexto para definir urgencia:
- baixa: rotina, sem pressa
- normal: fluxo padrão
- alta: cliente impaciente, cobrança de retorno, prazo próximo, reclamação grave ou risco operacional

Regras:
- Não invente dados ausentes na conversa ou no card.
- Frases curtas; omita campo vazio com string vazia.
- Se não houver chat, use título/descrição do card.

Responda APENAS com JSON válido (sem markdown):
{"motivo":"...","feito":"...","pendencias":"...","urgencia":"baixa|normal|alta"}`

export type HandoverSummaryInput = {
  empresaId: string
  leadId?: string | null
  card: {
    titulo?: string | null
    descricao?: string | null
    observacao?: string | null
  }
  dePipelineNome: string
  paraPipelineNome: string
}

export type HandoverSummaryResult =
  | { success: true; observacao: string; urgencia: HandoverUrgencia }
  | { success: false; error: string }

export function buildHandoverObservacaoText(parts: {
  motivo?: string
  feito?: string
  pendencias?: string
}): string {
  const blocks: string[] = []

  const motivo = parts.motivo?.trim()
  const feito = parts.feito?.trim()
  const pendencias = parts.pendencias?.trim()

  if (motivo) blocks.push(`Motivo do encaminhamento:\n${motivo}`)
  if (feito) blocks.push(`O que já foi feito:\n${feito}`)
  if (pendencias) blocks.push(`O que falta fazer:\n${pendencias}`)

  return blocks.join('\n\n')
}

const SECTION_HEADER_RE =
  /(motivo do encaminhamento|pedido do cliente|o que j[aá] foi feito|o que falta fazer|pend[eê]ncias(?: para o pr[oó]ximo operador)?)\s*:\s*/gi

/** Normaliza texto legado ou mal formatado da IA em parágrafos legíveis. */
export function formatHandoverObservacao(raw: string): string {
  const text = raw.trim().replace(/\r\n/g, '\n')
  if (!text) return ''

  const segments: { header: string; body: string }[] = []
  let match: RegExpExecArray | null
  let lastHeader = ''
  let lastEnd = 0

  const re = new RegExp(SECTION_HEADER_RE.source, 'gi')
  while ((match = re.exec(text)) !== null) {
    if (lastHeader) {
      segments.push({
        header: lastHeader,
        body: text.slice(lastEnd, match.index).trim(),
      })
    }
    lastHeader = match[1].toLowerCase()
    lastEnd = match.index + match[0].length
  }

  if (lastHeader) {
    segments.push({ header: lastHeader, body: text.slice(lastEnd).trim() })
  }

  if (segments.length === 0) return text

  const motivoParts: string[] = []
  let feito = ''
  let pendencias = ''

  for (const seg of segments) {
    const h = seg.header
    if (h.includes('motivo') || h.includes('pedido')) {
      if (seg.body) motivoParts.push(seg.body)
    } else if (h.includes('foi feito')) {
      feito = seg.body
    } else {
      pendencias = seg.body
    }
  }

  const formatted = buildHandoverObservacaoText({
    motivo: motivoParts.join('\n').trim(),
    feito,
    pendencias,
  })

  return formatted || text
}

async function loadConversationTranscript(
  supabase: SupabaseClient,
  leadId: string,
  limit = 30,
): Promise<string> {
  const { data: history } = await supabase
    .from('crm_interacoes')
    .select('role, content, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!history?.length) return ''

  return history
    .map((msg) => {
      const who = msg.role === 'user' ? 'Cliente' : msg.role === 'assistant' ? 'Assistente' : 'Sistema'
      const text = String(msg.content ?? '').trim()
      return text ? `${who}: ${text}` : null
    })
    .filter(Boolean)
    .join('\n')
}

function normalizeUrgencia(raw: unknown): HandoverUrgencia {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (v === 'urgente') return 'alta'
  if (VALID_URGENCIAS.has(v as HandoverUrgencia)) return v as HandoverUrgencia
  return 'normal'
}

function parseHandoverResponse(raw: string): {
  observacao: string
  urgencia: HandoverUrgencia
} | null {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      motivo?: unknown
      feito?: unknown
      pendencias?: unknown
      observacao?: unknown
      urgencia?: unknown
    }

    const urgencia = normalizeUrgencia(parsed.urgencia)

    if (typeof parsed.motivo === 'string' || typeof parsed.feito === 'string' || typeof parsed.pendencias === 'string') {
      const observacao = formatHandoverObservacao(
        buildHandoverObservacaoText({
          motivo: typeof parsed.motivo === 'string' ? parsed.motivo : '',
          feito: typeof parsed.feito === 'string' ? parsed.feito : '',
          pendencias: typeof parsed.pendencias === 'string' ? parsed.pendencias : '',
        }),
      )
      if (!observacao) return null
      return { observacao, urgencia }
    }

    if (typeof parsed.observacao === 'string') {
      const observacao = formatHandoverObservacao(parsed.observacao)
      if (!observacao) return null
      return { observacao, urgencia }
    }

    return null
  } catch {
    return null
  }
}

export async function generateCardHandoverSummary(
  supabase: SupabaseClient,
  input: HandoverSummaryInput,
): Promise<HandoverSummaryResult> {
  const { empresaId, leadId, card, dePipelineNome, paraPipelineNome } = input

  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .select('ai_model')
    .eq('id', empresaId)
    .maybeSingle()

  if (empresaError || !empresa) {
    return { success: false, error: 'Empresa não encontrada para gerar resumo.' }
  }

  const aiConfig = resolveEmpresaAiConfig(empresa)
  if (!aiConfig) {
    return { success: false, error: getAiConfigErrorMessage() }
  }

  const transcript = leadId ? await loadConversationTranscript(supabase, leadId) : ''

  const cardContext = [
    card.titulo?.trim() ? `Título: ${card.titulo.trim()}` : null,
    card.descricao?.trim() ? `Descrição: ${card.descricao.trim()}` : null,
    card.observacao?.trim() ? `Observação atual: ${card.observacao.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = `${HANDOVER_AGENT_INSTRUCTIONS}

── Encaminhamento ${dePipelineNome} → ${paraPipelineNome} ──

[DADOS DO CARD]
${cardContext || 'Sem dados adicionais no card.'}

[HISTÓRICO DA CONVERSA]
${transcript || 'Nenhuma mensagem registrada para este lead.'}`

  try {
    const summary = await generateText(prompt, {
      ...aiConfig,
      model: HANDOVER_SUMMARY_MODEL,
    })

    const parsed = parseHandoverResponse(summary)
    if (!parsed || parsed.observacao.length < 20) {
      return {
        success: false,
        error: 'A IA retornou um resumo inválido. Tente regenerar ou escreva manualmente.',
      }
    }

    return {
      success: true,
      observacao: formatHandoverObservacao(parsed.observacao),
      urgencia: parsed.urgencia,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar resumo com IA.'
    console.error('[HandoverSummary]', err)
    return { success: false, error: msg }
  }
}
