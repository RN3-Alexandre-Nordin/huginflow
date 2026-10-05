/**
 * Alocador FEFO: sugere lotes por validade ASC (NULLS LAST), depois número do lote.
 * UI pré-preenche; operador pode override antes de confirmar.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any }

export interface AlocacaoLoteFefo {
  lote_produto_id: string
  numero_lote: string
  data_validade: string | null
  quantidade: number
  saldo_disponivel?: number
}

export interface ResultadoAlocacaoFefo {
  alocacoes: AlocacaoLoteFefo[]
  quantidade_alocada: number
  quantidade_faltante: number
}

function hojeISODateLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function alocarLotesFefo(
  client: SupabaseClient,
  params: {
    empresa_id: string
    sku_id: string
    local_id: string
    quantidade: number
    bloquear_vencidos?: boolean
    /** Máximo de posições de saldo a considerar (performance SaaS). */
    limit?: number
  },
): Promise<ResultadoAlocacaoFefo> {
  const qtd = Number(params.quantidade)
  if (!Number.isFinite(qtd) || qtd <= 0) {
    return { alocacoes: [], quantidade_alocada: 0, quantidade_faltante: 0 }
  }

  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500)
  const hoje = hojeISODateLocal()

  const { data: rows, error } = await client
    .from('est_saldos')
    .select(
      'quantidade, lote_produto_id, est_lotes_produto!inner(id, numero_lote, data_validade)',
    )
    .eq('empresa_id', params.empresa_id)
    .eq('sku_id', params.sku_id)
    .eq('local_id', params.local_id)
    .not('lote_produto_id', 'is', null)
    .gt('quantidade', 0)
    .limit(limit)

  if (error) {
    throw new Error(`Falha ao listar saldos por lote (FEFO): ${error.message}`)
  }

  type Row = {
    quantidade: number
    lote_produto_id: string
    est_lotes_produto:
      | { id: string; numero_lote: string; data_validade: string | null }
      | { id: string; numero_lote: string; data_validade: string | null }[]
      | null
  }

  const lista = ((rows || []) as Row[])
    .map((r) => {
      const loteRaw = r.est_lotes_produto
      const lote = Array.isArray(loteRaw) ? loteRaw[0] : loteRaw
      if (!lote || !r.lote_produto_id) return null
      return {
        lote_produto_id: r.lote_produto_id,
        numero_lote: lote.numero_lote,
        data_validade: lote.data_validade,
        saldo: Number(r.quantidade) || 0,
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.saldo > 0)
    .filter((x) => {
      if (!params.bloquear_vencidos) return true
      if (!x.data_validade) return true
      return x.data_validade >= hoje
    })
    .sort((a, b) => {
      const va = a.data_validade
      const vb = b.data_validade
      if (va == null && vb == null) {
        return a.numero_lote.localeCompare(b.numero_lote)
      }
      if (va == null) return 1
      if (vb == null) return -1
      if (va !== vb) return va < vb ? -1 : 1
      return a.numero_lote.localeCompare(b.numero_lote)
    })

  let restante = qtd
  const alocacoes: AlocacaoLoteFefo[] = []

  for (const pos of lista) {
    if (restante <= 0) break
    const take = Math.min(pos.saldo, restante)
    if (take <= 0) continue
    alocacoes.push({
      lote_produto_id: pos.lote_produto_id,
      numero_lote: pos.numero_lote,
      data_validade: pos.data_validade,
      quantidade: take,
      saldo_disponivel: pos.saldo,
    })
    restante -= take
  }

  return {
    alocacoes,
    quantidade_alocada: qtd - restante,
    quantidade_faltante: Math.max(0, restante),
  }
}

/** Soma saldo disponível por SKU×local (todos os lotes). */
export async function somarSaldoSkuLocal(
  client: SupabaseClient,
  params: { empresa_id: string; sku_id: string; local_id: string },
): Promise<number> {
  const { data, error } = await client
    .from('est_saldos')
    .select('quantidade')
    .eq('empresa_id', params.empresa_id)
    .eq('sku_id', params.sku_id)
    .eq('local_id', params.local_id)
    .gt('quantidade', 0)
    .limit(500)

  if (error) throw new Error(`Falha ao somar saldo: ${error.message}`)
  return (data || []).reduce((acc: number, r: { quantidade: number }) => acc + (Number(r.quantidade) || 0), 0)
}
