import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_AI_MODEL,
  generateEmbedding,
  generateText,
  resolveEmpresaAiConfig,
  type EmpresaAiConfig,
} from '@/lib/ai/empresa-ai'

/** Resposta curta e genérica — sem menção a empresa específica. */
export const DEFAULT_OUT_OF_SCOPE_REPLY =
  'Posso ajudar apenas com assuntos relacionados ao atendimento desta empresa (nossos departamentos e serviços). Como posso ajudar nesse sentido?'

export type ScopeGateDecision =
  | {
      inScope: true
      reason: string
      via: 'greeting' | 'active_card' | 'recent_triage' | 'kb_match' | 'classifier' | 'ambiguous'
    }
  | {
      inScope: false
      reason: string
      via: 'obvious_offtopic' | 'classifier' | 'no_kb_and_classifier'
      reply: string
    }

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Cumprimentos / ack — não bloquear; a triagem completa decide. */
export function isLikelyGreetingOrAck(message: string): boolean {
  const t = normalize(message).replace(/[!?.…]+$/g, '').trim()
  if (!t || t.length > 40) return false
  const greetings = [
    'oi',
    'ola',
    'bom dia',
    'boa tarde',
    'boa noite',
    'hey',
    'eai',
    'e ai',
    'tudo bem',
    'td bem',
    'obrigado',
    'obrigada',
    'valeu',
    'ok',
    'certo',
    'beleza',
    'blz',
    'sim',
    'nao',
  ]
  return greetings.some((g) => t === g || t.startsWith(`${g} `))
}

/**
 * Off-topic óbvio e universal (clima, jogos, receitas, etc.).
 * Não lista produtos/serviços de nenhuma empresa — só abuso genérico do canal.
 */
export function isObviousOffTopic(message: string): boolean {
  const t = normalize(message)
  if (t.length < 8) return false

  const patterns: RegExp[] = [
    /\b(previsao|previsão)\b.*\b(tempo|clima)\b/,
    /\b(como esta|como está|qual)\b.*\b(tempo|clima)\b/,
    /\btempo\b.*\b(hoje|amanha|amanhã|semana)\b/,
    /\b(receita|como fazer)\b.*\b(bolo|pizza|comida)\b/,
    /\b(piada|conte uma historia|conte uma hist[oó]ria)\b/,
    /\b(resultado|placar|quem ganhou)\b.*\b(jogo|partida|campeonato|futebol)\b/,
    /\b(mega.?sena|lotofacil|loteria)\b/,
    /\b(traduz(a|ir)?|translate)\b/,
    /\b(escreva (um )?poema|gere (um )?codigo|gere (um )?c[oó]digo)\b/,
    /\b(capital da|quem descobriu|quanto e [0-9]|quanto é [0-9])\b/,
  ]
  return patterns.some((re) => re.test(t))
}

function buildScopeHintReply(labels: string[]): string {
  const unique = [...new Set(labels.map((l) => l.trim()).filter(Boolean))].slice(0, 8)
  if (unique.length === 0) return DEFAULT_OUT_OF_SCOPE_REPLY
  return `Posso ajudar apenas com assuntos do atendimento desta empresa (ex.: ${unique.join(', ')}). Como posso ajudar nesse sentido?`
}

async function loadEmpresaScopeLabels(
  supabase: SupabaseClient,
  empresaId: string,
): Promise<{ empresaNome: string; labels: string[] }> {
  const [{ data: empresa }, { data: departamentos }, { data: funis }] = await Promise.all([
    supabase.from('empresas').select('nome').eq('id', empresaId).maybeSingle(),
    supabase.from('departamentos').select('nome').eq('empresa_id', empresaId).order('nome'),
    supabase.from('pipelines').select('nome').eq('empresa_id', empresaId).order('nome'),
  ])

  const labels = [
    ...((departamentos ?? []).map((d) => String(d.nome || '')).filter(Boolean)),
    ...((funis ?? []).map((f) => String(f.nome || '')).filter(Boolean)),
  ]

  return {
    empresaNome: String(empresa?.nome || 'esta empresa').trim() || 'esta empresa',
    labels,
  }
}

async function hasKbMatch(
  supabase: SupabaseClient,
  empresaId: string,
  message: string,
  aiConfig: EmpresaAiConfig,
): Promise<boolean> {
  try {
    const embedding = await generateEmbedding(message, aiConfig)
    const { data, error } = await supabase.rpc('match_knowledge_base', {
      query_embedding: embedding,
      match_threshold: 0.52,
      match_count: 3,
      org_id: empresaId,
    })
    if (error) {
      console.warn('[ScopeGate] match_knowledge_base:', error.message)
      return false
    }
    return Array.isArray(data) && data.length > 0
  } catch (err) {
    console.warn('[ScopeGate] KB match falhou:', err)
    return false
  }
}

async function classifyWithMicroPrompt(
  message: string,
  empresaNome: string,
  labels: string[],
  aiConfig: EmpresaAiConfig,
): Promise<'IN_SCOPE' | 'OUT_OF_SCOPE' | 'AMBIGUOUS'> {
  const scopeList =
    labels.length > 0
      ? labels.slice(0, 20).join('; ')
      : 'atendimento comercial, suporte e processos da empresa (conforme base de conhecimento)'

  const prompt = `Você é um classificador de escopo para o canal de atendimento WhatsApp da empresa "${empresaNome}".
Escopo válido = mensagens sobre atendimento, produtos/serviços, processos, departamentos ou funis desta empresa.
Departamentos/funis conhecidos: ${scopeList}

Fora de escopo = curiosidades gerais, clima, esportes, loteria, receitas, piadas, dever de casa, programação genérica, ou qualquer tema sem relação com o negócio.

Mensagem do cliente:
"""${message.trim().slice(0, 500)}"""

Responda APENAS com uma palavra: IN_SCOPE | OUT_OF_SCOPE | AMBIGUOUS`

  const gateConfig: EmpresaAiConfig = { ...aiConfig, model: DEFAULT_AI_MODEL }
  const raw = await generateText(prompt, gateConfig, { maxTokens: 16, temperature: 0 })
  const token = raw.toUpperCase().replace(/[^A-Z_]/g, '')
  if (token.includes('OUT_OF_SCOPE')) return 'OUT_OF_SCOPE'
  if (token.includes('IN_SCOPE')) return 'IN_SCOPE'
  return 'AMBIGUOUS'
}

/**
 * Gate barato multi-empresa: cumprimentos/card ativo passam; off-topic óbvio bloqueia;
 * senão RAG da empresa + micro-classificador (sem hardcode de cliente).
 */
export async function evaluateMessageScope(
  supabase: SupabaseClient,
  input: {
    empresaId: string
    leadId: string
    message: string
    hasOpenCard?: boolean
  },
): Promise<ScopeGateDecision> {
  const message = input.message?.trim() || ''
  if (!message) {
    return { inScope: true, reason: 'Mensagem vazia — deixa fluxo principal tratar.', via: 'ambiguous' }
  }

  if (isLikelyGreetingOrAck(message)) {
    return { inScope: true, reason: 'Cumprimento/ack — não bloqueia.', via: 'greeting' }
  }

  if (input.hasOpenCard) {
    return {
      inScope: true,
      reason: 'Card aberto — continua no fluxo de atendimento.',
      via: 'active_card',
    }
  }

  const { data: recentAssistant } = await supabase
    .from('crm_interacoes')
    .select('id, metadata')
    .eq('empresa_id', input.empresaId)
    .eq('lead_id', input.leadId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentAssistant?.id) {
    const meta = (recentAssistant.metadata ?? {}) as Record<string, unknown>
    const actions = Array.isArray(meta.triage_actions)
      ? (meta.triage_actions as string[])
      : []
    const lastWasOutOfScope =
      meta.scope_gate === true ||
      meta.crm_status === 'FORA_ESCOPO' ||
      actions.includes('OUT_OF_SCOPE')

    if (!lastWasOutOfScope) {
      return {
        inScope: true,
        reason: 'Já há triagem em andamento — não interrompe com gate.',
        via: 'recent_triage',
      }
    }
  }

  const { empresaNome, labels } = await loadEmpresaScopeLabels(supabase, input.empresaId)
  const reply = buildScopeHintReply(labels)

  if (isObviousOffTopic(message)) {
    return {
      inScope: false,
      reason: 'Heurística: tema genérico fora de atendimento empresarial.',
      via: 'obvious_offtopic',
      reply,
    }
  }

  const { data: empresaRow } = await supabase
    .from('empresas')
    .select('ai_model')
    .eq('id', input.empresaId)
    .maybeSingle()

  const aiConfig = resolveEmpresaAiConfig(empresaRow ?? {})
  if (!aiConfig) {
    // Sem API key: não bloqueia (fail-open) — triagem completa decide.
    return {
      inScope: true,
      reason: 'Sem config IA no gate — fail-open para triagem completa.',
      via: 'ambiguous',
    }
  }

  const kbHit = await hasKbMatch(supabase, input.empresaId, message, aiConfig)
  if (kbHit) {
    return { inScope: true, reason: 'RAG da empresa encontrou contexto relevante.', via: 'kb_match' }
  }

  try {
    const verdict = await classifyWithMicroPrompt(message, empresaNome, labels, aiConfig)
    if (verdict === 'OUT_OF_SCOPE') {
      return {
        inScope: false,
        reason: 'Micro-classificador: fora do escopo desta empresa.',
        via: 'classifier',
        reply,
      }
    }
    if (verdict === 'IN_SCOPE') {
      return { inScope: true, reason: 'Micro-classificador: dentro do escopo.', via: 'classifier' }
    }
    return {
      inScope: true,
      reason: 'Ambíguo no gate — deixa triagem completa esclarecer.',
      via: 'ambiguous',
    }
  } catch (err) {
    console.warn('[ScopeGate] Classificador falhou (fail-open):', err)
    return {
      inScope: true,
      reason: 'Falha no classificador — fail-open.',
      via: 'ambiguous',
    }
  }
}
