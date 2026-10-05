import type { ComprasReportFilterKey } from './catalog'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { rpc: (fn: string, args?: Record<string, unknown>) => any }

export const PAGE_SIZE_DEFAULT = 50
const PAGE_SIZE_MAX = 200

export type ComprasReportFilters = {
  data_inicio?: string
  data_fim?: string
  tipo?: string
  sku_codigo?: string
  situacao?: string
  status?: string
  limit?: number
  offset?: number
}

export async function runComprasReport(
  slug: string,
  empresaId: string,
  filters: ComprasReportFilters,
  client: Sb,
): Promise<{
  rows: Record<string, unknown>[]
  resumo?: Record<string, unknown>
  error?: string
  pageSize: number
  offset: number
}> {
  const pageSize = Math.min(Math.max(filters.limit || PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX)
  const offset = Math.max(filters.offset || 0, 0)
  const filtros: Record<string, unknown> = { limit: pageSize, offset }

  if (filters.data_inicio) filtros.data_inicio = filters.data_inicio
  if (filters.data_fim) filtros.data_fim = filters.data_fim
  if (filters.tipo) filtros.tipo = filters.tipo
  if (filters.sku_codigo?.trim()) filtros.sku_codigo = filters.sku_codigo.trim()
  if (filters.situacao) filtros.situacao = filters.situacao
  if (filters.status) filtros.status = filters.status

  const { data, error } = await client.rpc('com_rpc_relatorio', {
    p_empresa_id: empresaId,
    p_slug: slug,
    p_filtros: filtros,
  })

  if (error) {
    const message = error.message || 'Falha ao carregar o relatório.'
    const limpa = message.replace(/^ACESSO_NEGADO:\s*/i, '')
    return { rows: [], error: limpa, pageSize, offset }
  }

  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  if (payload.error) {
    return {
      rows: [],
      error: String(payload.error),
      pageSize,
      offset,
      resumo: payload.resumo as Record<string, unknown> | undefined,
    }
  }

  return {
    rows: Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : [],
    resumo:
      payload.resumo && typeof payload.resumo === 'object'
        ? (payload.resumo as Record<string, unknown>)
        : undefined,
    pageSize,
    offset,
  }
}

export type { ComprasReportFilterKey }
