/** Parse CSV simples (vírgula ou ponto-e-vírgula) → matriz de células. */

export function parseCsvToMatrix(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) return []

  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === sep) {
      row.push(cell.trim())
      cell = ''
      continue
    }
    if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(cell.trim())
      cell = ''
      if (row.some((c) => c.length > 0)) rows.push(row)
      row = []
      if (ch === '\r') i++
      continue
    }
    if (ch === '\r') {
      row.push(cell.trim())
      cell = ''
      if (row.some((c) => c.length > 0)) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }

  row.push(cell.trim())
  if (row.some((c) => c.length > 0)) rows.push(row)

  return rows
}

export function digitsOnly(v: string): string {
  return String(v || '').replace(/\D/g, '')
}

/** Extrai código antes de " :: " (legado ATC). */
export function splitCodigoNome(raw: string): { codigo: string; nome: string } {
  const s = String(raw || '').trim()
  const idx = s.indexOf('::')
  if (idx < 0) return { codigo: s, nome: '' }
  return {
    codigo: s.slice(0, idx).trim().replace(/\s+/g, ' '),
    nome: s.slice(idx + 2).trim(),
  }
}
