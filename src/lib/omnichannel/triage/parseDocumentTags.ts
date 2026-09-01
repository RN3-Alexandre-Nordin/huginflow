export type DocumentFields = {
  tipo?: string
  confianca?: number
  legivel?: boolean
  resumo?: string
}

export function parseDocumentBlock(text: string): DocumentFields | null {
  const match = text.match(/\[DOCUMENT:([\s\S]*?)\]/i)
  if (!match) return null

  const fields: DocumentFields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes('=')) continue
    const eq = trimmed.indexOf('=')
    const key = trimmed.slice(0, eq).trim().toLowerCase()
    const value = trimmed.slice(eq + 1).trim()
    if (!value) continue

    switch (key) {
      case 'tipo':
        fields.tipo = value
        break
      case 'confianca':
        fields.confianca = Number.parseFloat(value)
        break
      case 'legivel':
        fields.legivel = value === 'true' || value === '1'
        break
      case 'resumo':
        fields.resumo = value
        break
      default:
        break
    }
  }

  return Object.keys(fields).length > 0 ? fields : null
}
