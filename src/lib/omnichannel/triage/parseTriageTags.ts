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
])

export function parseCrmStatus(text: string): string | undefined {
  const match = text.match(/\[STATUS_CRM:\s*([^\]]+)\]/i)
  return match?.[1]?.trim().toUpperCase()
}

export function parseTriageBlock(text: string): TriageFields | null {
  const match = text.match(/\[TRIAGE:([\s\S]*?)\]/i)
  if (!match) return null

  const fields: TriageFields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes('=')) continue
    const eq = trimmed.indexOf('=')
    const key = trimmed.slice(0, eq).trim().toLowerCase()
    const value = trimmed.slice(eq + 1).trim()
    if (!value) continue

    switch (key) {
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

/** Remove tags internas para envio ao cliente WhatsApp. */
export function stripOutboundTags(text: string): string {
  return text
    .replace(/\[TRIAGE:[\s\S]*?\]/gi, '')
    .replace(/\[ACTION:\s*[^\]]+\]/gi, '')
    .replace(/\[STATUS_CRM:\s*[^\]]+\]/gi, '')
    .replace(/\[[A-Z_][A-Z0-9_]*:[^\]]*\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
