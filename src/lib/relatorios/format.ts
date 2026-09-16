import { formatBRL } from '@/lib/finance/format'

export function formatBiReportCell(
  value: unknown,
  format?: 'money' | 'number' | 'percent' | 'seconds'
): string {
  if (value == null || value === '') return ''
  if (format === 'money') {
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    return formatBRL(n)
  }
  if (format === 'percent') {
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  }
  if (format === 'seconds') {
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    if (n >= 3600) return `${(n / 3600).toFixed(1)} h`
    if (n >= 60) return `${(n / 60).toFixed(1)} min`
    return `${Math.round(n)} s`
  }
  if (format === 'number') {
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  }
  return String(value)
}

export function formatBiReportResumo(key: string, value: unknown): string {
  if (key === 'total_valor' || key === 'receita' || key === 'valor_aberto' || key === 'valor_ponderado') {
    return formatBRL(Number(value) || 0)
  }
  if (key === 'taxa_handover_pct' || key.endsWith('_pct')) {
    const n = Number(value)
    return Number.isFinite(n) ? `${n}%` : String(value ?? '')
  }
  return String(value ?? '')
}
