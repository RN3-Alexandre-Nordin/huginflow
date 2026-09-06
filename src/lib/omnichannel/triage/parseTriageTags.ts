export type TriageFields = {
  departamento_id?: string
  departamento_nome?: string
  funil_id?: string
  funil_nome?: string
  estagio_id?: string
  categoria?: string
  prioridade?: string
  resumo?: string
  motivo?: string
}

export type TriageAction =
  | 'CREATE_CARD'
  | 'HANDOVER'
  | 'ASK_CLARIFY'
  | 'FORA_HORARIO'
  | 'QUEUE_UNASSIGNED'
  | 'OUT_OF_SCOPE'

export type ParsedAiTags = {
  triage: TriageFields | null
  actions: TriageAction[]
  crmStatus?: string
}

const ACTION_SET = new Set<string>([
  'CREATE_CARD',
  'HANDOVER',
  'ASK_CLARIFY',
  'FORA_HORARIO',
  'QUEUE_UNASSIGNED',
  'OUT_OF_SCOPE',
])

const TRIAGE_KEYS = [
  'departamento_id',
  'departamento_nome',
  'funil_id',
  'funil_nome',
  'estagio_id',
  'categoria',
  'prioridade',
  'resumo',
  'motivo',
] as const

type TriageKey = (typeof TRIAGE_KEYS)[number]

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const PRIORIDADE_RE = /^(baixa|normal|alta|urgente)$/i

export function parseCrmStatus(text: string): string | undefined {
  const match = text.match(/\[STATUS_CRM:\s*([^\]]+)\]/i)
  return match?.[1]?.trim().toUpperCase()
}

function assignTriageField(fields: TriageFields, key: string, rawValue: string) {
  let value = rawValue.replace(/\s+/g, ' ').trim()
  if (!value) return

  const k = key.toLowerCase() as TriageKey

  // IDs: fica só com o UUID (IA às vezes cola outros campos na mesma linha)
  if (k === 'departamento_id' || k === 'funil_id' || k === 'estagio_id') {
    const uuid = value.match(UUID_RE)?.[0]
    if (uuid) value = uuid
  }

  if (k === 'prioridade') {
    const hit = value.match(PRIORIDADE_RE)?.[0]
    if (hit) value = hit.toLowerCase()
  }

  // categoria=prioridade normal → prioridade vazia no bloco; salva prioridade se detectar
  if (k === 'categoria' && PRIORIDADE_RE.test(value)) {
    fields.prioridade = value.toLowerCase()
    return
  }
  if (k === 'categoria' && /^prioridade\s+/i.test(value)) {
    const rest = value.replace(/^prioridade\s+/i, '').trim()
    if (PRIORIDADE_RE.test(rest)) {
      fields.prioridade = rest.toLowerCase()
      return
    }
  }

  switch (k) {
    case 'departamento_id':
      fields.departamento_id = value
      break
    case 'departamento_nome':
      fields.departamento_nome = value
      break
    case 'funil_id':
      fields.funil_id = value
      break
    case 'funil_nome':
      fields.funil_nome = value
      break
    case 'estagio_id':
      fields.estagio_id = value
      break
    case 'categoria':
      fields.categoria = value
      break
    case 'prioridade':
      fields.prioridade = value
      break
    case 'resumo':
      fields.resumo = value
      break
    case 'motivo':
      fields.motivo = value
      break
    default:
      break
  }
}

/**
 * Aceita TRIAGE multilinha OU numa linha só (key=value key=value …).
 * Ex. falha comum da LLM: tudo colado após departamento_id=.
 */
export function parseTriageBlock(text: string): TriageFields | null {
  const match = text.match(/\[TRIAGE:([\s\S]*?)\]/i)
  if (!match) return null

  const body = match[1]
  const fields: TriageFields = {}
  const keyAlt = TRIAGE_KEYS.join('|')
  const re = new RegExp(
    `(?:^|[\\s\\n])(${keyAlt})\\s*=\\s*([\\s\\S]*?)(?=(?:\\s+(?:${keyAlt})\\s*=)|$)`,
    'gi',
  )

  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    assignTriageField(fields, m[1], m[2])
  }

  // Fallback linha a linha (compat)
  if (Object.keys(fields).length === 0) {
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.includes('=')) continue
      const eq = trimmed.indexOf('=')
      assignTriageField(fields, trimmed.slice(0, eq), trimmed.slice(eq + 1))
    }
  }

  return Object.keys(fields).length > 0 ? fields : null
}

export function parseActions(text: string): TriageAction[] {
  const actions: TriageAction[] = []
  const re = /\[ACTION:\s*([A-Z_]+)\]/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const name = m[1].toUpperCase()
    if (ACTION_SET.has(name) && !actions.includes(name as TriageAction)) {
      actions.push(name as TriageAction)
    }
  }
  return actions
}

export function parseAiTags(text: string): ParsedAiTags {
  return {
    triage: parseTriageBlock(text),
    actions: parseActions(text),
    crmStatus: parseCrmStatus(text),
  }
}

/** Remove tags internas da IA — WhatsApp, cockpit e cards (nunca exibir UUIDs/triage ao operador). */
export function stripOutboundTags(text: string): string {
  return text
    .replace(/\[TRIAGE:[\s\S]*?\]/gi, '')
    .replace(/\[ACTION:\s*[^\]]+\]/gi, '')
    .replace(/\[DOCUMENT:[\s\S]*?\]/gi, '')
    .replace(/\[STATUS_CRM:\s*[^\]]+\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
