/** Constantes e helpers de listagem paginada (Performance SaaS). */

export const ESTOQUE_PAGE_SIZE = 50

export function parseEstoquePage(raw: string | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export function estoqueRange(page: number, pageSize = ESTOQUE_PAGE_SIZE) {
  const p = Math.max(1, page)
  const from = (p - 1) * pageSize
  const to = from + pageSize - 1
  return { from, to, page: p, pageSize }
}

export function estoqueTotalPages(total: number, pageSize = ESTOQUE_PAGE_SIZE) {
  if (total <= 0) return 1
  return Math.max(1, Math.ceil(total / pageSize))
}
