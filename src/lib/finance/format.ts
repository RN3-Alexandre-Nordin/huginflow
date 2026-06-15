export function formatBRL(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Meses de vigência para mensalidades; sem fim => 12 (espelha fn_finance_meses_vigencia). */
export function computeMesesVigencia(dataInicio: string, dataFim: string | null): number {
  if (!dataFim) return 12
  const start = new Date(dataInicio.slice(0, 10) + 'T12:00:00')
  const end = new Date(dataFim.slice(0, 10) + 'T12:00:00')
  if (end < start) return 0
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return Math.min(Math.max(months <= 0 ? 1 : months, 0), 120)
}
