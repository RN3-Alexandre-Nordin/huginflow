'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Hash,
  Layers,
  Loader2,
  Package,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import {
  criarTransferenciaLoteAction,
  listarSkusComSaldoNoLocalAction,
  previewNumeroTransferenciaAction,
} from '../actions'

interface Local {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

interface SkuComSaldo {
  id: string
  codigo: string
  nome: string
  unidade_estoque: string
  saldo: number
}

interface RowItem {
  id: string
  sku_id: string
  quantidade: string
}

interface Props {
  locais: Local[]
}

export function TransferenciaForm({ locais }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const principal = locais.find((l) => l.eh_principal)?.id || locais[0]?.id || ''
  const [localOrigemId, setLocalOrigemId] = useState(principal)
  const [localDestinoId, setLocalDestinoId] = useState('')
  const [documento, setDocumento] = useState('')
  const [numeroLotePreview, setNumeroLotePreview] = useState<string | null>(null)
  const [skusOrigem, setSkusOrigem] = useState<SkuComSaldo[]>([])
  const [carregandoSkus, setCarregandoSkus] = useState(false)

  const [rows, setRows] = useState<RowItem[]>([
    { id: 'row-1', sku_id: '', quantidade: '1' },
  ])

  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro'
    texto: string
  } | null>(null)

  const locaisIguais =
    !!localOrigemId && !!localDestinoId && localOrigemId === localDestinoId

  const origemLabel = locais.find((l) => l.id === localOrigemId)

  const skuMap = useMemo(
    () => new Map(skusOrigem.map((s) => [s.id, s])),
    [skusOrigem]
  )

  // Prévia do número do lote (TRF-…)
  useEffect(() => {
    let ativo = true
    previewNumeroTransferenciaAction().then((res) => {
      if (ativo) setNumeroLotePreview(res.numero)
    })
    return () => {
      ativo = false
    }
  }, [])

  // SKUs com quantidade no local de origem
  useEffect(() => {
    if (!localOrigemId) {
      setSkusOrigem([])
      return
    }

    let ativo = true
    setCarregandoSkus(true)
    listarSkusComSaldoNoLocalAction(localOrigemId)
      .then((res) => {
        if (!ativo) return
        setSkusOrigem(res.skus)
        // Limpa linhas cujo SKU não tem mais saldo neste local
        const idsOk = new Set(res.skus.map((s) => s.id))
        setRows((prev) =>
          prev.map((r) =>
            r.sku_id && !idsOk.has(r.sku_id) ? { ...r, sku_id: '' } : r
          )
        )
      })
      .finally(() => {
        if (ativo) setCarregandoSkus(false)
      })

    return () => {
      ativo = false
    }
  }, [localOrigemId])

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: `row-${Date.now()}`, sku_id: '', quantidade: '1' },
    ])
  }

  function removeRow(index: number) {
    if (rows.length === 1) return
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function updateRow(index: number, patch: Partial<RowItem>) {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  function optionsParaLinha(index: number) {
    const usados = new Set(
      rows.map((r, i) => (i !== index && r.sku_id ? r.sku_id : null)).filter(Boolean)
    )
    return skusOrigem
      .filter((s) => !usados.has(s.id) || rows[index]?.sku_id === s.id)
      .map((s) => ({
        value: s.id,
        label: `${s.codigo} — ${s.nome} (${s.unidade_estoque}) · disp. ${Number(
          s.saldo
        ).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`,
        searchText: `${s.codigo} ${s.nome}`,
      }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)

    if (!localOrigemId || !localDestinoId) {
      setFeedback({
        tipo: 'erro',
        texto: 'Selecione o local de origem e o de destino.',
      })
      return
    }

    if (locaisIguais) {
      setFeedback({
        tipo: 'erro',
        texto: 'O local de origem e destino devem ser diferentes.',
      })
      return
    }

    if (rows.some((r) => !r.sku_id)) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o SKU em todas as linhas.' })
      return
    }

    const skuSet = new Set(rows.map((r) => r.sku_id))
    if (skuSet.size !== rows.length) {
      setFeedback({
        tipo: 'erro',
        texto: 'SKU duplicado no lote. Use uma linha por SKU.',
      })
      return
    }

    const parsed = rows.map((r) => ({
      ...r,
      qtd: parseFloat(String(r.quantidade).replace(',', '.')),
      saldo: skuMap.get(r.sku_id)?.saldo ?? 0,
    }))

    if (parsed.some((r) => !Number.isFinite(r.qtd) || r.qtd <= 0)) {
      setFeedback({
        tipo: 'erro',
        texto: 'Quantidade deve ser maior que zero em todos os itens.',
      })
      return
    }

    const insuficiente = parsed.find((r) => r.qtd > r.saldo)
    if (insuficiente) {
      const sku = skuMap.get(insuficiente.sku_id)
      setFeedback({
        tipo: 'erro',
        texto: `Saldo insuficiente para ${sku?.codigo || 'SKU'} na origem (disponível: ${insuficiente.saldo}).`,
      })
      return
    }

    startTransition(async () => {
      try {
        const res = await criarTransferenciaLoteAction({
          local_origem_id: localOrigemId,
          local_destino_id: localDestinoId,
          documento: documento.trim() || undefined,
          itens: parsed.map((r, idx) => ({
            linha: idx + 1,
            sku_id: r.sku_id,
            quantidade: r.qtd,
          })),
        })

        if ('error' in res) {
          setFeedback({
            tipo: 'erro',
            texto: res.error || 'Erro ao processar transferência.',
          })
          return
        }

        if (res.sucesso && res.loteId) {
          setFeedback({
            tipo: 'sucesso',
            texto: res.numero
              ? `Lote ${res.numero} gerado. ${res.mensagem}`
              : res.mensagem,
          })
          setTimeout(() => {
            router.push(`/cockpit/estoque/transferencias/${res.loteId}`)
          }, 900)
        } else {
          setFeedback({
            tipo: 'erro',
            texto: res.mensagem || 'Falha ao registrar transferência.',
          })
        }
      } catch (err) {
        setFeedback({
          tipo: 'erro',
          texto:
            err instanceof Error
              ? err.message
              : 'Falha inesperada. Confira Cardex/Saldos antes de tentar de novo.',
        })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-start gap-3 border animate-in fade-in duration-300 ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {feedback.tipo === 'sucesso' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <div>{feedback.texto}</div>
        </div>
      )}

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
          <Hash className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Lote
          </span>
          <span className="font-mono text-sm font-bold text-cyan-300">
            {numeroLotePreview || 'TRF-…'}
          </span>
          <span className="text-[10px] text-gray-500">
            gerado na confirmação
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
              <Building2 className="h-3 w-3 text-cyan-400" />
              Local de origem <span className="text-red-400">*</span>
            </label>
            <select
              value={localOrigemId}
              onChange={(e) => setLocalOrigemId(e.target.value)}
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">Selecione...</option>
              {locais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} — {l.nome}
                  {l.eh_principal ? ' ★' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden md:flex justify-center pb-2">
            <ArrowRight className="h-5 w-5 text-cyan-400" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
              <Building2 className="h-3 w-3 text-emerald-400" />
              Local de destino <span className="text-red-400">*</span>
            </label>
            <select
              value={localDestinoId}
              onChange={(e) => setLocalDestinoId(e.target.value)}
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">Selecione...</option>
              {locais.map((l) => (
                <option key={l.id} value={l.id} disabled={l.id === localOrigemId}>
                  {l.codigo} — {l.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {locaisIguais && (
          <p className="text-[11px] text-amber-400">
            Origem e destino devem ser locais diferentes.
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Documento / O.S.
          </label>
          <input
            type="text"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            placeholder="Opcional — se vazio, usa o número do lote no Cardex"
            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-3 border-b border-[#ffffff08] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Package className="h-4 w-4 text-cyan-400" />
              Itens do lote
            </h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {carregandoSkus
                ? 'Carregando SKUs com saldo na origem…'
                : localOrigemId
                  ? `${skusOrigem.length} SKU(s) com quantidade em ${origemLabel?.codigo || 'origem'}`
                  : 'Selecione o local de origem'}
            </p>
          </div>
          <button
            type="button"
            onClick={addRow}
            disabled={!localOrigemId || skusOrigem.length === 0}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar SKU
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0e1319] text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
              <tr>
                <th className="py-2.5 px-4 w-10">#</th>
                <th className="py-2.5 px-4">SKU</th>
                <th className="py-2.5 px-4 w-40">Quantidade</th>
                <th className="py-2 px-4 w-40">Disponível</th>
                <th className="py-2.5 px-4 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff05]">
              {rows.map((row, index) => {
                const sku = skuMap.get(row.sku_id)
                const qtd = parseFloat(String(row.quantidade).replace(',', '.'))
                const saldo = sku?.saldo ?? null
                const saldoBaixo =
                  saldo !== null && Number.isFinite(qtd) && qtd > saldo

                return (
                  <tr key={row.id} className="align-middle">
                    <td className="py-2 px-4 text-gray-500 font-mono">{index + 1}</td>
                    <td className="py-2 px-4 min-w-[16rem]">
                      <SearchableSelect
                        value={row.sku_id}
                        onChange={(v) => updateRow(index, { sku_id: v })}
                        options={optionsParaLinha(index)}
                        placeholder={
                          carregandoSkus
                            ? 'Carregando…'
                            : skusOrigem.length === 0
                              ? 'Nenhum SKU com saldo neste local'
                              : 'Buscar SKU com saldo…'
                        }
                        disabled={!localOrigemId || carregandoSkus}
                      />
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.quantidade}
                          onChange={(e) =>
                            updateRow(index, { quantidade: e.target.value })
                          }
                          className={`w-full bg-[#0d1218] border rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none ${
                            saldoBaixo
                              ? 'border-red-500/50'
                              : 'border-[#ffffff10] focus:border-cyan-500/50'
                          }`}
                        />
                        <span className="text-[10px] text-gray-500 font-mono shrink-0">
                          {sku?.unidade_estoque || 'UN'}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-4">
                      {!row.sku_id || !localOrigemId ? (
                        <span className="text-gray-600 text-[11px]">—</span>
                      ) : (
                        <span
                          className={`font-mono text-[12px] font-semibold tabular-nums ${
                            saldoBaixo ? 'text-red-400' : 'text-cyan-300'
                          }`}
                          title={
                            origemLabel
                              ? `Disponível em ${origemLabel.codigo}`
                              : 'Disponível na origem'
                          }
                        >
                          {Number(saldo ?? 0).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })}{' '}
                          <span className="text-gray-500 font-normal">
                            {sku?.unidade_estoque || 'UN'}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        disabled={rows.length === 1}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Remover linha"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/cockpit/estoque/transferencias')}
          className="px-4 py-2.5 text-xs font-medium text-gray-300 hover:text-white rounded-xl border border-[#ffffff10] bg-[#ffffff05]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending || locaisIguais || skusOrigem.length === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-950/40 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Layers className="h-4 w-4" />
          )}
          {isPending ? 'Processando lote...' : 'Confirmar transferência'}
        </button>
      </div>
    </form>
  )
}
