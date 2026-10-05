import type { BiReportFiltersInput } from './catalog'

/** Cliente Supabase mínimo — `rpc` retorna builder thenable, não Promise estrita. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { rpc: (fn: string, args?: Record<string, unknown>) => any }

export const BI_PAGE_SIZE_DEFAULT = 50
export const BI_PAGE_SIZE_MAX = 200

export async function runBiReport(
  slug: string,
  empresaId: string,
  filters: BiReportFiltersInput,
  client: Sb
): Promise<{
  rows: Record<string, unknown>[]
  resumo?: Record<string, unknown>
  error?: string
  pageSize: number
  offset: number
}> {
  const pageSize = Math.min(Math.max(filters.limit || BI_PAGE_SIZE_DEFAULT, 1), BI_PAGE_SIZE_MAX)
  const offset = Math.max(filters.offset || 0, 0)

  const filtros: Record<string, unknown> = {
    limit: pageSize,
    offset,
  }
  if (filters.data_inicio) filtros.data_inicio = filters.data_inicio
  if (filters.data_fim) filtros.data_fim = filters.data_fim
  if (filters.departamento_id) filtros.departamento_id = filters.departamento_id
  if (filters.canal_id) filtros.canal_id = filters.canal_id
  if (filters.pipeline_id) filtros.pipeline_id = filters.pipeline_id
  if (filters.responsavel_id) filtros.responsavel_id = filters.responsavel_id
  if (filters.min_cards != null) filtros.min_cards = filters.min_cards

  const { data, error } = await client.rpc('crm_rpc_relatorio', {
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
