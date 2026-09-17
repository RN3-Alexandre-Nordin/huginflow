import type { ReportFiltersInput } from './catalog'

/** Cliente Supabase mínimo — `rpc` retorna builder thenable, não Promise estrita. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { rpc: (fn: string, args?: Record<string, unknown>) => any }

const PAGE_SIZE_DEFAULT = 50
const PAGE_SIZE_MAX = 200

export async function runEstoqueReport(
  slug: string,
  empresaId: string,
  filters: ReportFiltersInput,
  client: Sb
): Promise<{
  rows: Record<string, unknown>[]
  resumo?: Record<string, unknown>
  error?: string
  pageSize: number
  offset: number
}> {
  const pageSize = Math.min(
    Math.max(filters.limit || PAGE_SIZE_DEFAULT, 1),
    PAGE_SIZE_MAX
  )
  const offset = Math.max(filters.offset || 0, 0)

  const filtros: Record<string, unknown> = {
    limit: pageSize,
    offset,
    so_com_saldo: filters.so_com_saldo !== false,
  }

  if (filters.data_inicio) filtros.data_inicio = filters.data_inicio
  if (filters.data_fim) filtros.data_fim = filters.data_fim
  if (filters.local_id) filtros.local_id = filters.local_id
  if (filters.sku_codigo?.trim()) filtros.sku_codigo = filters.sku_codigo.trim()
  if (filters.familia_id) filtros.familia_id = filters.familia_id
  if (filters.criterio_critico) filtros.criterio_critico = filters.criterio_critico
  if (filters.status_req) filtros.status_req = filters.status_req
  if (filters.origem_req) filtros.origem_req = filters.origem_req
  if (filters.origem_saida) filtros.origem_saida = filters.origem_saida
  if (filters.dias_sem_movimento != null) {
    filtros.dias_sem_movimento = filters.dias_sem_movimento
  }
  if (filters.terceiro_id) filtros.terceiro_id = filters.terceiro_id
  if (filters.status_remessa) filtros.status_remessa = filters.status_remessa
  if (filters.sinal_ajuste) filtros.sinal_ajuste = filters.sinal_ajuste

  const { data, error } = await client.rpc('est_rpc_relatorio', {
    p_empresa_id: empresaId,
    p_slug: slug,
    p_filtros: filtros,
  })

  if (error) {
    return { rows: [], error: error.message, pageSize, offset }
  }

  const payload = data && typeof data === 'object' ? data : {}
  if (payload.error) {
    return {
      rows: [],
      error: String(payload.error),
      pageSize,
      offset,
      resumo: payload.resumo,
    }
  }

  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    resumo: payload.resumo && typeof payload.resumo === 'object' ? payload.resumo : undefined,
    pageSize,
    offset,
  }
}

export { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX }
