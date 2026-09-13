'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import { criarAjusteAction } from '../actions'
import { MOTIVOS_AJUSTE } from '@/lib/estoque/operacoes-avancadas'

interface SkuOption {
  id: string
  codigo: string
  nome: string
  unidade_estoque: string
}

interface LocalOption {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

interface Props {
  skus: SkuOption[]
  locais: LocalOption[]
  defaultLocalId?: string
}

interface RowItem {
  id: string
  sku_id: string
  local_id: string
  sinal: '+' | '-'
  quantidade: string
  motivo_codigo: string
  justificativa: string
}

export default function AjusteForm({ skus, locais, defaultLocalId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [observacao, setObservacao] = useState('')
  const [movimentoEm, setMovimentoEm] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [rows, setRows] = useState<RowItem[]>([
    {
      id: 'row-1',
      sku_id: '',
      local_id: defaultLocalId || (locais[0]?.id ?? ''),
      sinal: '+',
      quantidade: '1',
      motivo_codigo: 'inventario',
      justificativa: '',
    },
  ])

  const [feedback, setFeedback] = useState<{
    tipo: 'erro' | 'sucesso'
    texto: string
  } | null>(null)

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        sku_id: '',
        local_id: defaultLocalId || (locais[0]?.id ?? ''),
        sinal: '+',
        quantidade: '1',
        motivo_codigo: 'inventario',
        justificativa: '',
      },
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

  function handleSubmit() {
    const vazios = rows.some((r) => !r.sku_id || !r.local_id)
    if (vazios) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o SKU e o Local em todas as linhas.' })
      return
    }

    const semJust = rows.some((r) => !r.justificativa.trim())
    if (semJust) {
      setFeedback({
        tipo: 'erro',
        texto: 'A justificativa é obrigatória para todo ajuste de estoque.',
      })
      return
    }

    const invalidQtd = rows.some((r) => {
      const val = parseFloat(r.quantidade.replace(',', '.'))
      return isNaN(val) || val <= 0
    })
    if (invalidQtd) {
      setFeedback({ tipo: 'erro', texto: 'A quantidade deve ser maior que zero em todos os itens.' })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const itensPayload = rows.map((r, idx) => ({
        linha: idx + 1,
        sku_id: r.sku_id,
        local_id: r.local_id,
        sinal: r.sinal,
        quantidade: parseFloat(r.quantidade.replace(',', '.')),
        motivo_codigo: r.motivo_codigo,
        justificativa: r.justificativa.trim(),
      }))

      const res = await criarAjusteAction({
        observacao,
        movimento_em: movimentoEm ? new Date(movimentoEm).toISOString() : undefined,
        itens: itensPayload,
      })

      if ('error' in res) {
        setFeedback({ tipo: 'erro', texto: res.error || 'Erro desconhecido.' })
        return
      }

      if (res.sucesso && res.loteId) {
        router.push(`/cockpit/estoque/ajustes/${res.loteId}`)
      } else if (res.sucesso) {
        router.push('/cockpit/estoque/ajustes')
      } else {
        setFeedback({ tipo: 'erro', texto: res.mensagem || 'Falha ao registrar ajuste.' })
      }
    })
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 border animate-in fade-in duration-300 ${
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Observação Geral do Lote
            </label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Inventário cíclico do almoxarifado central"
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Data do Movimento
            </label>
            <input
              type="date"
              value={movimentoEm}
              onChange={(e) => setMovimentoEm(e.target.value)}
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
      </div>

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#ffffff08] pb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-blue-400" />
            Itens
          </h2>

          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar Item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0e1319] text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
              <tr>
                <th className="py-2.5 px-3 w-10">#</th>
                <th className="py-2.5 px-3 w-56">SKU / Produto *</th>
                <th className="py-2.5 px-3 w-36">Local *</th>
                <th className="py-2.5 px-3 w-28">Sinal *</th>
                <th className="py-2.5 px-3 w-28">Qtd *</th>
                <th className="py-2.5 px-3 w-44">Motivo *</th>
                <th className="py-2.5 px-3">Justificativa *</th>
                <th className="py-2.5 px-3 w-10 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff05]">
              {rows.map((row, idx) => {
                const skuSelected = skus.find((s) => s.id === row.sku_id)

                return (
                  <tr key={row.id} className="hover:bg-[#ffffff03] transition-colors">
                    <td className="py-3 px-3 font-mono text-gray-500">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <SearchableSelect
                        value={row.sku_id}
                        onChange={(sku_id) => updateRow(idx, { sku_id })}
                        placeholder="Buscar SKU…"
                        emptyLabel="Nenhum SKU com este termo"
                        options={skus.map((s) => ({
                          value: s.id,
                          label: `${s.codigo} - ${s.nome} (${s.unidade_estoque})`,
                          searchText: `${s.codigo} ${s.nome}`,
                        }))}
                        inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={row.local_id}
                        onChange={(e) => updateRow(idx, { local_id: e.target.value })}
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
                      >
                        {locais.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.codigo} {l.eh_principal ? '★' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateRow(idx, { sinal: '+' })}
                          className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                            row.sinal === '+'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'text-gray-500 hover:text-white bg-[#ffffff05]'
                          }`}
                        >
                          + Entrada
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRow(idx, { sinal: '-' })}
                          className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                            row.sinal === '-'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'text-gray-500 hover:text-white bg-[#ffffff05]'
                          }`}
                        >
                          - Saída
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={row.quantidade}
                          onChange={(e) => updateRow(idx, { quantidade: e.target.value })}
                          placeholder="1"
                          className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-blue-500/50"
                        />
                        <span className="text-[10px] text-gray-400 font-mono">
                          {skuSelected?.unidade_estoque || 'UN'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={row.motivo_codigo}
                        onChange={(e) => updateRow(idx, { motivo_codigo: e.target.value })}
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
                      >
                        {MOTIVOS_AJUSTE.map((m) => (
                          <option key={m.codigo} value={m.codigo}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={row.justificativa}
                        onChange={(e) => updateRow(idx, { justificativa: e.target.value })}
                        placeholder="Descreva o motivo do ajuste..."
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
                      />
                    </td>
                    <td className="py-3 px-3 text-right">
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <Link
          href="/cockpit/estoque/ajustes"
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          ← Cancelar e Voltar para Lista
        </Link>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all"
        >
          {isPending ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Processando Ajuste...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Confirmar Ajuste no Estoque
            </>
          )}
        </button>
      </div>
    </div>
  )
}
