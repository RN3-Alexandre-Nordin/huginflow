'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Package, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import {
  alocarLotesFefo,
  type AlocacaoLoteFefo,
} from '@/lib/estoque/alocar-lotes-fefo'

export type { AlocacaoLoteFefo }

export interface LotePickerProps {
  empresaId: string
  skuId: string
  localId: string
  quantidade: number
  value: AlocacaoLoteFefo[]
  onChange: (alocacoes: AlocacaoLoteFefo[]) => void
  bloquearVencidos?: boolean
  disabled?: boolean
  /** Classes extras no container (ex.: cor de acento do formulário). */
  className?: string
}

type LoteDisponivel = {
  lote_produto_id: string
  numero_lote: string
  data_validade: string | null
  saldo: number
}

function formatValidade(iso: string | null): string {
  if (!iso) return 's/ validade'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function somaAlocada(alocs: AlocacaoLoteFefo[]): number {
  return alocs.reduce((s, a) => s + (Number(a.quantidade) || 0), 0)
}

async function listarSaldosLote(
  empresaId: string,
  skuId: string,
  localId: string,
  bloquearVencidos: boolean
): Promise<LoteDisponivel[]> {
  const client = createClient()
  const hoje = new Date()
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

  const { data, error } = await client
    .from('est_saldos')
    .select(
      'quantidade, lote_produto_id, est_lotes_produto!inner(id, numero_lote, data_validade)'
    )
    .eq('empresa_id', empresaId)
    .eq('sku_id', skuId)
    .eq('local_id', localId)
    .not('lote_produto_id', 'is', null)
    .gt('quantidade', 0)
    .limit(200)

  if (error) throw new Error(error.message)

  type Row = {
    quantidade: number
    lote_produto_id: string
    est_lotes_produto:
      | { id: string; numero_lote: string; data_validade: string | null }
      | { id: string; numero_lote: string; data_validade: string | null }[]
      | null
  }

  return ((data || []) as Row[])
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
    .filter((x): x is LoteDisponivel => !!x && x.saldo > 0)
    .filter((x) => {
      if (!bloquearVencidos) return true
      if (!x.data_validade) return true
      return x.data_validade >= hojeIso
    })
    .sort((a, b) => {
      const va = a.data_validade
      const vb = b.data_validade
      if (va == null && vb == null) return a.numero_lote.localeCompare(b.numero_lote)
      if (va == null) return 1
      if (vb == null) return -1
      if (va !== vb) return va < vb ? -1 : 1
      return a.numero_lote.localeCompare(b.numero_lote)
    })
}

/**
 * Seletor FEFO de lotes produto: sugere alocação e permite override manual.
 * Distinto de "lote documento" (RET-/AJU-/TRF-…).
 */
export default function LotePicker({
  empresaId,
  skuId,
  localId,
  quantidade,
  value,
  onChange,
  bloquearVencidos = false,
  disabled = false,
  className = '',
}: LotePickerProps) {
  const baseId = useId()
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [disponiveis, setDisponiveis] = useState<LoteDisponivel[]>([])
  const [faltanteFefo, setFaltanteFefo] = useState(0)
  const [addLoteId, setAddLoteId] = useState('')
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const seedKey = `${empresaId}|${skuId}|${localId}|${quantidade}|${bloquearVencidos ? 1 : 0}`

  useEffect(() => {
    if (!empresaId || !skuId || !localId || !(quantidade > 0)) {
      setDisponiveis([])
      setFaltanteFefo(0)
      setErro(null)
      onChangeRef.current([])
      return
    }

    let cancelled = false
    setLoading(true)
    setErro(null)

    ;(async () => {
      try {
        const client = createClient()
        const [fefo, lots] = await Promise.all([
          alocarLotesFefo(client, {
            empresa_id: empresaId,
            sku_id: skuId,
            local_id: localId,
            quantidade,
            bloquear_vencidos: bloquearVencidos,
          }),
          listarSaldosLote(empresaId, skuId, localId, bloquearVencidos),
        ])
        if (cancelled) return
        setDisponiveis(lots)
        setFaltanteFefo(fefo.quantidade_faltante)
        onChangeRef.current(fefo.alocacoes)
      } catch (e: unknown) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Falha ao sugerir lotes FEFO.'
        setErro(msg)
        setDisponiveis([])
        onChangeRef.current([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só ao seed (sku/local/qtd)
  }, [seedKey])

  const usados = useMemo(
    () => new Set(value.map((a) => a.lote_produto_id)),
    [value]
  )

  const opcoesAdd = useMemo(
    () => disponiveis.filter((d) => !usados.has(d.lote_produto_id)),
    [disponiveis, usados]
  )

  const totalAlocado = somaAlocada(value)
  const divergencia =
    Number.isFinite(quantidade) && quantidade > 0
      ? Math.abs(totalAlocado - quantidade) > 1e-9
      : false

  function updateQty(loteId: string, raw: string) {
    const n = parseFloat(String(raw).replace(',', '.'))
    onChange(
      value.map((a) =>
        a.lote_produto_id === loteId
          ? { ...a, quantidade: Number.isFinite(n) && n > 0 ? n : 0 }
          : a
      )
    )
  }

  function removeLote(loteId: string) {
    onChange(value.filter((a) => a.lote_produto_id !== loteId))
  }

  function addLote() {
    if (!addLoteId) return
    const lot = disponiveis.find((d) => d.lote_produto_id === addLoteId)
    if (!lot) return
    const restante = Math.max(0, quantidade - totalAlocado)
    const take = Math.min(lot.saldo, restante > 0 ? restante : lot.saldo)
    onChange([
      ...value,
      {
        lote_produto_id: lot.lote_produto_id,
        numero_lote: lot.numero_lote,
        data_validade: lot.data_validade,
        quantidade: take,
        saldo_disponivel: lot.saldo,
      },
    ])
    setAddLoteId('')
  }

  if (!skuId || !localId) return null

  return (
    <div
      className={`rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/90 flex items-center gap-1.5">
          <Package className="h-3 w-3" />
          Lotes (FEFO sugerido)
        </p>
        {loading && (
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Calculando…
          </span>
        )}
      </div>

      {erro && (
        <p className="text-[11px] text-red-400 flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          {erro}
        </p>
      )}

      {!loading && !erro && value.length === 0 && quantidade > 0 && (
        <p className="text-[11px] text-amber-300/90 flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          Sem saldo por lote neste local
          {faltanteFefo > 0 ? ` (faltam ${faltanteFefo}).` : '.'}
        </p>
      )}

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((a, idx) => {
            const saldo =
              a.saldo_disponivel ??
              disponiveis.find((d) => d.lote_produto_id === a.lote_produto_id)?.saldo
            const over = saldo != null && a.quantidade > saldo + 1e-9
            return (
              <li
                key={a.lote_produto_id}
                className="grid grid-cols-[1fr_5.5rem_auto] gap-2 items-center"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-semibold text-white truncate">
                    {a.numero_lote || a.lote_produto_id.slice(0, 8)}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Val. {formatValidade(a.data_validade)}
                    {saldo != null
                      ? ` · disp. ${Number(saldo).toLocaleString('pt-BR', {
                          maximumFractionDigits: 4,
                        })}`
                      : ''}
                  </p>
                </div>
                <input
                  id={`${baseId}-qtd-${idx}`}
                  type="text"
                  inputMode="decimal"
                  disabled={disabled || loading}
                  value={String(a.quantidade)}
                  onChange={(e) => updateQty(a.lote_produto_id, e.target.value)}
                  className={`w-full bg-[#0d1218] border rounded-lg px-2 py-1 text-xs text-white font-mono text-right focus:outline-none disabled:opacity-50 ${
                    over
                      ? 'border-red-500/50'
                      : 'border-[#ffffff10] focus:border-amber-500/40'
                  }`}
                />
                <button
                  type="button"
                  disabled={disabled || loading}
                  onClick={() => removeLote(a.lote_produto_id)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                  title="Remover lote"
                  aria-label="Remover lote"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {opcoesAdd.length > 0 && !disabled && (
        <div className="flex items-center gap-1.5 pt-1">
          <select
            value={addLoteId}
            onChange={(e) => setAddLoteId(e.target.value)}
            disabled={loading}
            className="flex-1 min-w-0 bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-amber-500/40"
          >
            <option value="">Outro lote disponível…</option>
            {opcoesAdd.map((d) => (
              <option key={d.lote_produto_id} value={d.lote_produto_id}>
                {d.numero_lote} · val. {formatValidade(d.data_validade)} ·{' '}
                {Number(d.saldo).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addLote}
            disabled={!addLoteId || loading}
            className="inline-flex items-center gap-1 shrink-0 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/15 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      )}

      {(divergencia || faltanteFefo > 0) && value.length > 0 && (
        <p className="text-[10px] text-amber-300/80">
          Alocado {totalAlocado.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} de{' '}
          {quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
          {faltanteFefo > 0 && totalAlocado < quantidade - 1e-9
            ? ` · FEFO não cobriu ${faltanteFefo}`
            : divergencia
              ? ' · ajuste as quantidades para bater com a linha'
              : ''}
        </p>
      )}
    </div>
  )
}

/** Expande linhas de UI com alocações multi-lote em N inputs de operação. */
export function expandirItensPorAlocacaoLote<
  T extends { quantidade: number; lote_produto_id?: string | null },
>(
  rows: Array<{
    controla_lote?: boolean
    alocacoes?: AlocacaoLoteFefo[]
    base: Omit<T, 'linha' | 'quantidade' | 'lote_produto_id'> & {
      quantidade: number
      lote_produto_id?: string | null
    }
  }>
): Array<T & { linha: number }> {
  const out: Array<T & { linha: number }> = []
  let linha = 1
  for (const row of rows) {
    if (row.controla_lote && row.alocacoes && row.alocacoes.length > 0) {
      for (const a of row.alocacoes) {
        const q = Number(a.quantidade)
        if (!Number.isFinite(q) || q <= 0) continue
        out.push({
          ...(row.base as T),
          linha,
          quantidade: q,
          lote_produto_id: a.lote_produto_id,
        })
        linha += 1
      }
    } else {
      out.push({
        ...(row.base as T),
        linha,
        quantidade: row.base.quantidade,
        lote_produto_id: row.base.lote_produto_id ?? null,
      })
      linha += 1
    }
  }
  return out
}
