import type { ReportFiltersInput } from './catalog'

/** Cliente Supabase mínimo — `rpc` / `from` thenable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { rpc: (fn: string, args?: Record<string, unknown>) => any; from: (table: string) => any }

const PAGE_SIZE_DEFAULT = 50
const PAGE_SIZE_MAX = 200

function hojeISODateLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function runValidadeLotesReport(
  empresaId: string,
  filters: ReportFiltersInput,
  client: Sb,
  pageSize: number,
  offset: number,
): Promise<{
  rows: Record<string, unknown>[]
  resumo?: Record<string, unknown>
  error?: string
  pageSize: number
  offset: number
}> {
  const hoje = hojeISODateLocal()
  const status = (filters.status_validade || 'todos').toLowerCase()

  let q = client
    .from('est_saldos')
    .select(
      `quantidade, local_id, sku_id, lote_produto_id,
       cad_skus!inner(codigo, nome),
       cad_locais_estoque!inner(codigo, nome),
       est_lotes_produto!inner(numero_lote, data_validade)`,
      { count: 'exact' },
    )
    .eq('empresa_id', empresaId)
    .not('lote_produto_id', 'is', null)
    .gt('quantidade', 0)
    .order('quantidade', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (filters.local_id) q = q.eq('local_id', filters.local_id)
  if (filters.sku_codigo?.trim()) {
    q = q.ilike('cad_skus.codigo', `%${filters.sku_codigo.trim()}%`)
  }

  // Filtro de validade via embed (PostgREST)
  if (status === 'vencido') {
    q = q.lt('est_lotes_produto.data_validade', hoje)
  } else if (status === 'a_vencer') {
    // próximos 30 dias (inclui hoje)
    const lim = new Date()
    lim.setDate(lim.getDate() + 30)
    const limStr = lim.toISOString().slice(0, 10)
    q = q.gte('est_lotes_produto.data_validade', hoje).lte('est_lotes_produto.data_validade', limStr)
  }

  const { data, error, count } = await q
  if (error) {
    return { rows: [], error: error.message, pageSize, offset }
  }

  type Row = {
    quantidade: number
    cad_skus?: { codigo?: string; nome?: string } | { codigo?: string; nome?: string }[] | null
    cad_locais_estoque?: { codigo?: string; nome?: string } | { codigo?: string; nome?: string }[] | null
    est_lotes_produto?:
      | { numero_lote?: string; data_validade?: string | null }
      | { numero_lote?: string; data_validade?: string | null }[]
      | null
  }

  const unwrap = <T,>(v: T | T[] | null | undefined): T | null => {
    if (!v) return null
    return Array.isArray(v) ? v[0] ?? null : v
  }

  const rows = ((data || []) as Row[]).map((r) => {
    const sku = unwrap(r.cad_skus)
    const local = unwrap(r.cad_locais_estoque)
    const lote = unwrap(r.est_lotes_produto)
    const val = lote?.data_validade || null
    let statusVal = 'sem_validade'
    if (val) {
      if (val < hoje) statusVal = 'vencido'
      else if (val <= (() => {
        const lim = new Date()
        lim.setDate(lim.getDate() + 30)
        return lim.toISOString().slice(0, 10)
      })())
        statusVal = 'a_vencer'
      else statusVal = 'ok'
    }
    return {
      sku_codigo: sku?.codigo || '',
      sku_nome: sku?.nome || '',
      local: local ? `${local.codigo || ''} — ${local.nome || ''}`.trim() : '',
      numero_lote: lote?.numero_lote || '',
      data_validade: val || '',
      quantidade: Number(r.quantidade) || 0,
      status_validade: statusVal,
    }
  })

  return {
    rows,
    resumo: { total_count: count ?? rows.length },
    pageSize,
    offset,
  }
}

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

  if (slug === 'validade-lotes') {
    return runValidadeLotesReport(empresaId, filters, client, pageSize, offset)
  }

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
