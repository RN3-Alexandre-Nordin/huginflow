'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowDownLeft,
  Building2,
  CheckCircle2,
  FileText,
  MapPin,
  RefreshCw,
  Truck,
  XCircle,
} from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import { registrarRetornosRemessaAction } from '../../actions'
import {
  MOTIVOS_BAIXA_REMESSA,
  MOTIVOS_REMESSA,
} from '@/lib/estoque/operacoes-avancadas'

interface LocalOption {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

interface SkuOption {
  id: string
  codigo: string
  nome: string
  unidade_estoque: string
}

interface ItemEmPoder {
  id: string
  sku_id: string
  local_origem_id: string | null
  quantidade_enviada: number
  quantidade_retornada: number
  quantidade_baixada: number
  quantidade_em_poder: number
  cad_skus: {
    codigo: string
    nome: string
    unidade_estoque: string
  } | null
  local_origem: { id: string; codigo: string; nome: string } | null
}

interface RemessaHeader {
  id: string
  numero: string
  status: string
  motivo_codigo: string
  motivo_texto: string | null
  documento: string | null
  destinatario_nome: string
  destinatario_doc: string | null
}

interface Props {
  remessa: RemessaHeader
  itens: ItemEmPoder[]
  locais: LocalOption[]
  skus: SkuOption[]
  defaultLocalId: string
}

interface RowState {
  item_id: string
  quantidade_retorno: string
  sku_retorno_id: string
  quantidade_fecha_poder: string
  local_destino_id: string
  quantidade_baixa: string
  motivo_baixa_codigo: string
  motivo_baixa_texto: string
}

export default function RetornoForm({
  remessa,
  itens,
  locais,
  skus,
  defaultLocalId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [observacao, setObservacao] = useState('')
  const [rows, setRows] = useState<RowState[]>(() =>
    itens.map((it) => ({
      item_id: it.id,
      quantidade_retorno: String(it.quantidade_em_poder),
      sku_retorno_id: it.sku_id,
      quantidade_fecha_poder: String(it.quantidade_em_poder),
      local_destino_id: it.local_origem_id || defaultLocalId || locais[0]?.id || '',
      quantidade_baixa: '0',
      motivo_baixa_codigo: 'vendido_consignacao',
      motivo_baixa_texto: '',
    }))
  )
  const [feedback, setFeedback] = useState<{
    tipo: 'erro' | 'sucesso'
    texto: string
  } | null>(null)

  const motivoInfo = MOTIVOS_REMESSA.find((m) => m.codigo === remessa.motivo_codigo)
  const motivoLabel =
    remessa.motivo_codigo === 'outro'
      ? `Outro: ${remessa.motivo_texto || ''}`
      : motivoInfo?.label || remessa.motivo_codigo

  function updateRow(itemId: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.item_id !== itemId) return r
        const next = { ...r, ...patch }
        // Mesmo SKU: fecha poder acompanha qtd retorno
        if (
          ('quantidade_retorno' in patch || 'sku_retorno_id' in patch) &&
          next.sku_retorno_id === itens.find((i) => i.id === itemId)?.sku_id
        ) {
          next.quantidade_fecha_poder = next.quantidade_retorno
        }
        return next
      })
    )
  }

  function handleSubmit() {
    const payload: Array<{
      item_id: string
      quantidade_retorno: number
      sku_retorno_id: string
      local_destino_id?: string
      quantidade_fecha_poder?: number
      quantidade_baixa: number
      motivo_baixa_codigo?: string
      motivo_baixa_texto?: string
    }> = []

    for (const row of rows) {
      const item = itens.find((i) => i.id === row.item_id)
      if (!item) continue

      const qtdRet = parseFloat(String(row.quantidade_retorno).replace(',', '.')) || 0
      const qtdBai = parseFloat(String(row.quantidade_baixa).replace(',', '.')) || 0
      const qtdFecha =
        parseFloat(String(row.quantidade_fecha_poder).replace(',', '.')) || 0

      if (qtdRet <= 0 && qtdBai <= 0) continue

      if (qtdRet < 0 || qtdBai < 0 || (qtdRet > 0 && qtdFecha <= 0)) {
        setFeedback({
          tipo: 'erro',
          texto: `Quantidades inválidas para ${item.cad_skus?.codigo || 'SKU'}.`,
        })
        return
      }

      const mesmoSku = row.sku_retorno_id === item.sku_id
      const fechaPoder = qtdRet > 0 ? (mesmoSku ? qtdRet : qtdFecha) : 0
      if (fechaPoder + qtdBai > item.quantidade_em_poder + 1e-9) {
        setFeedback({
          tipo: 'erro',
          texto: `${item.cad_skus?.codigo}: retorno+baixa (${fechaPoder + qtdBai}) > em poder (${item.quantidade_em_poder}).`,
        })
        return
      }

      if (qtdRet > 0 && !row.local_destino_id) {
        setFeedback({
          tipo: 'erro',
          texto: `Selecione o local de destino para ${item.cad_skus?.codigo}.`,
        })
        return
      }

      if (qtdBai > 0 && row.motivo_baixa_codigo === 'outro' && row.motivo_baixa_texto.trim().length < 3) {
        setFeedback({
          tipo: 'erro',
          texto: `Descreva o motivo da baixa para ${item.cad_skus?.codigo}.`,
        })
        return
      }

      payload.push({
        item_id: row.item_id,
        quantidade_retorno: qtdRet,
        sku_retorno_id: row.sku_retorno_id,
        local_destino_id: qtdRet > 0 ? row.local_destino_id : undefined,
        quantidade_fecha_poder: qtdRet > 0 ? fechaPoder : undefined,
        quantidade_baixa: qtdBai,
        motivo_baixa_codigo: qtdBai > 0 ? row.motivo_baixa_codigo : undefined,
        motivo_baixa_texto:
          qtdBai > 0 && row.motivo_baixa_codigo === 'outro'
            ? row.motivo_baixa_texto.trim()
            : undefined,
      })
    }

    if (payload.length === 0) {
      setFeedback({
        tipo: 'erro',
        texto: 'Informe retorno e/ou baixa em ao menos um item (use 0 para ignorar).',
      })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const res = await registrarRetornosRemessaAction({
        remessa_id: remessa.id,
        observacao: observacao.trim() || undefined,
        itens: payload,
      })

      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }

      if (!res.sucesso) {
        setFeedback({
          tipo: 'erro',
          texto: res.mensagem || 'Falha ao registrar liquidação.',
        })
        return
      }

      setFeedback({ tipo: 'sucesso', texto: res.mensagem })
      setTimeout(() => {
        router.push(`/cockpit/estoque/remessas/${remessa.id}`)
        router.refresh()
      }, res.parcial ? 1400 : 700)
    })
  }

  if (itens.length === 0) {
    return (
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-10 text-center space-y-3">
        <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
        <h2 className="text-sm font-semibold text-white">Nada em poder do terceiro</h2>
        <p className="text-xs text-gray-400 max-w-md mx-auto">
          Todos os itens desta remessa já foram liquidados (retornados e/ou baixados).
        </p>
        <Link
          href={`/cockpit/estoque/remessas/${remessa.id}`}
          className="inline-flex text-xs text-purple-300 hover:text-white transition-colors"
        >
          ← Voltar ao detalhe
        </Link>
      </div>
    )
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

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-semibold">
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Liquidação (retorno + baixa)
          </span>
          <span className="font-mono text-sm font-bold text-purple-300 flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-purple-400" />
            {remessa.numero}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-gray-500 block mb-1">Destinatário</span>
            <div className="flex items-center gap-1.5 text-white font-medium">
              <Building2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span className="truncate">{remessa.destinatario_nome}</span>
            </div>
            {remessa.destinatario_doc && (
              <span className="text-[10px] text-gray-500 font-mono block mt-0.5">
                {remessa.destinatario_doc}
              </span>
            )}
          </div>
          <div>
            <span className="text-gray-500 block mb-1">Finalidade</span>
            <span className="text-white font-medium block">{motivoLabel}</span>
          </div>
          <div>
            <span className="text-gray-500 block mb-1">Status do lote</span>
            <span className="text-purple-300 font-medium capitalize">{remessa.status}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
            <FileText className="h-3 w-3 text-gray-400" />
            Observação da liquidação (opcional)
          </label>
          <input
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: Retorno parcial + venda do restante em consignação"
            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-3 border-b border-[#ffffff08]">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
            Itens em poder
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Retorno: volta ao estoque (SKU pode ser outro). Baixa: sai do poder sem entrar no local.
            O item/lote fecha quando retorno (fecha poder) + baixa cobrirem o enviado.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0e1319] text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
              <tr>
                <th className="py-2.5 px-3">SKU enviado</th>
                <th className="py-2.5 px-3 text-center">Em poder</th>
                <th className="py-2.5 px-3 w-28">Qtd retorno</th>
                <th className="py-2.5 px-3 min-w-[11rem]">SKU que volta</th>
                <th className="py-2.5 px-3 w-28">Fecha poder</th>
                <th className="py-2.5 px-3 min-w-[10rem]">Local destino</th>
                <th className="py-2.5 px-3 w-28">Qtd baixa</th>
                <th className="py-2.5 px-3 min-w-[10rem]">Motivo baixa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff05]">
              {itens.map((it) => {
                const row = rows.find((r) => r.item_id === it.id)
                if (!row) return null
                const um = it.cad_skus?.unidade_estoque || 'UN'
                const mesmoSku = row.sku_retorno_id === it.sku_id
                const qtdBai = parseFloat(row.quantidade_baixa.replace(',', '.')) || 0

                return (
                  <tr key={it.id} className="hover:bg-[#ffffff03] align-top">
                    <td className="py-3 px-3">
                      <span className="font-mono font-bold text-white block">
                        {it.cad_skus?.codigo || '—'}
                      </span>
                      <span className="text-[11px] text-gray-400 block truncate max-w-[10rem]">
                        {it.cad_skus?.nome}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-purple-300">
                      {it.quantidade_em_poder} {um}
                    </td>
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={row.quantidade_retorno}
                        onChange={(e) =>
                          updateRow(it.id, { quantidade_retorno: e.target.value })
                        }
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-emerald-500/50"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <SearchableSelect
                        value={row.sku_retorno_id}
                        onChange={(sku_retorno_id) =>
                          updateRow(it.id, { sku_retorno_id })
                        }
                        placeholder="SKU que volta…"
                        emptyLabel="Nenhum SKU"
                        options={skus.map((s) => ({
                          value: s.id,
                          label: `${s.codigo} — ${s.nome}`,
                          searchText: `${s.codigo} ${s.nome}`,
                        }))}
                        inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={row.quantidade_fecha_poder}
                        disabled={mesmoSku}
                        onChange={(e) =>
                          updateRow(it.id, { quantidade_fecha_poder: e.target.value })
                        }
                        title={
                          mesmoSku
                            ? 'Mesmo SKU: fecha poder = qtd retorno'
                            : 'Qtd do enviado que sai do poder'
                        }
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-gray-500 shrink-0" />
                        <select
                          value={row.local_destino_id}
                          onChange={(e) =>
                            updateRow(it.id, { local_destino_id: e.target.value })
                          }
                          className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                        >
                          {locais.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.codigo}
                              {l.eh_principal ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={row.quantidade_baixa}
                        onChange={(e) =>
                          updateRow(it.id, { quantidade_baixa: e.target.value })
                        }
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-amber-500/50"
                      />
                    </td>
                    <td className="py-3 px-3 space-y-1">
                      <select
                        value={row.motivo_baixa_codigo}
                        disabled={qtdBai <= 0}
                        onChange={(e) =>
                          updateRow(it.id, { motivo_baixa_codigo: e.target.value })
                        }
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-40"
                      >
                        {MOTIVOS_BAIXA_REMESSA.map((m) => (
                          <option key={m.codigo} value={m.codigo}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      {qtdBai > 0 && row.motivo_baixa_codigo === 'outro' && (
                        <input
                          type="text"
                          value={row.motivo_baixa_texto}
                          onChange={(e) =>
                            updateRow(it.id, { motivo_baixa_texto: e.target.value })
                          }
                          placeholder="Descreva…"
                          className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500/50"
                        />
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
          href={`/cockpit/estoque/remessas/${remessa.id}`}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          ← Cancelar e voltar ao detalhe
        </Link>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all"
        >
          {isPending ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Confirmar Liquidação
            </>
          )}
        </button>
      </div>
    </div>
  )
}
