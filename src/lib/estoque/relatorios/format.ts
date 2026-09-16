import { formatBRL } from '@/lib/finance/format'

/** Formata célula de relatório (money → R$ …). */
export function formatReportCell(
  value: unknown,
  format?: 'money' | 'number'
): string {
  if (value == null || value === '') return ''
  if (format === 'money') {
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    return formatBRL(n)
  }
  return String(value)
}

export function formatReportResumo(key: string, value: unknown): string {
  if (key === 'total_valor') return formatBRL(Number(value) || 0)
  return String(value ?? '')
}
