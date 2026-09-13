'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowDownToLine,
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  HelpCircle,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import {
  criarEntradaLoteTelaAction,
  validarEntradaPreviewAction,
} from '../actions'
import type { ItemEntradaInput, ItemEntradaValidado } from '@/lib/estoque/tipos'

interface SkuOption {
  id: string
  codigo: string
  nome: string
  unidade_estoque: string
  unidade_compra?: string | null
}

interface FornecedorOption {
  id: string
  nome: string
  documento?: string | null
}

interface LocalOption {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

interface Props {
  fornecedores: FornecedorOption[]
  locais: LocalOption[]
  skus: SkuOption[]
  defaultLocalId?: string
}

interface FormRowItem {
  id: string
  sku_id: string
  codigo_parceiro: string
  unidade_origem: string
  quantidade_origem: string
  justificativa: string
  validacao?: ItemEntradaValidado
}

export default function EntradaManualForm({
  fornecedores,
  locais,
  skus,
  defaultLocalId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Cabeçalho
  const [pessoaId, setPessoaId] = useState('')
  const [localId, setLocalId] = useState(defaultLocalId || (locais[0]?.id ?? ''))
  const [documento, setDocumento] = useState('')
  const [movimentoEm, setMovimentoEm] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [observacao, setObservacao] = useState('')

  // Itens
  const [rows, setRows] = useState<FormRowItem[]>([
    {
      id: 'row-1',
      sku_id: '',
      codigo_parceiro: '',
      unidade_origem: 'UN',
      quantidade_origem: '1',
      justificativa: '',
    },
  ])

  // Feedback geral
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro' | 'alerta'
    texto: string
  } | null>(null)

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        sku_id: '',
        codigo_parceiro: '',
        unidade_origem: 'UN',
        quantidade_origem: '1',
        justificativa: '',
      },
    ])
  }

  function removeRow(index: number) {
    if (rows.length === 1) return
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function updateRow(index: number, patch: Partial<FormRowItem>) {
    setRows((prev) => {
      const next = [...prev]
      const current = next[index]
      if (!current) return prev

      // Se mudou o SKU, ajusta unidade_origem padrão
      if (patch.sku_id && patch.sku_id !== current.sku_id) {
        const selectedSku = skus.find((s) => s.id === patch.sku_id)
        if (selectedSku) {
          patch.unidade_origem =
            selectedSku.unidade_compra || selectedSku.unidade_estoque || 'UN'
        }
      }

      next[index] = { ...current, ...patch, validacao: undefined }
      return next
    })
  }

  function formatItensPayload(): ItemEntradaInput[] {
    return rows.map((r, idx) => ({
      linha: idx + 1,
      sku_id: r.sku_id || null,
      codigo_parceiro: r.codigo_parceiro?.trim() || null,
      unidade_origem: r.unidade_origem?.trim().toUpperCase() || 'UN',
      quantidade_origem: parseFloat(r.quantidade_origem.replace(',', '.')) || 0,
      justificativa: r.justificativa?.trim() || null,
    }))
  }

  async function handleValidar() {
    if (!pessoaId) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o Fornecedor no cabeçalho.' })
      return
    }
    if (!localId) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o Local de destino no cabeçalho.' })
      return
    }

    setFeedback(null)
    const itensPayload = formatItensPayload()

    const res = await validarEntradaPreviewAction({
      pessoa_id: pessoaId,
      local_id: localId,
      origem: 'lote_tela',
      documento,
      observacao,
      itens: itensPayload,
    })

    if ('error' in res && res.error) {
      setFeedback({ tipo: 'erro', texto: res.error })
      return
    }

    if (res.validacao) {
      const { itens, erroResumo, statusSugerido, itensValidos, totalItens } = res.validacao
      setRows((prev) =>
        prev.map((r, idx) => ({
          ...r,
          validacao: itens[idx],
        }))
      )

      if (statusSugerido === 'concluido') {
        setFeedback({
          tipo: 'sucesso',
          texto: `Todos os ${totalItens} itens estão válidos e prontos para entrada!`,
        })
      } else if (statusSugerido === 'parcial') {
        setFeedback({
          tipo: 'alerta',
          texto: `${itensValidos} de ${totalItens} itens válidos. Corrija os itens destacados abaixo antes de efetivar.`,
        })
      } else {
        setFeedback({
          tipo: 'erro',
          texto: erroResumo || 'Corrija os erros destacados nas linhas dos itens.',
        })
      }
    }
  }

  function handleEfetivar() {
    if (!pessoaId) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o Fornecedor no cabeçalho.' })
      return
    }
    if (!localId) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o Local de destino no cabeçalho.' })
      return
    }

    const vazios = rows.some((r) => !r.sku_id)
    if (vazios) {
      setFeedback({
        tipo: 'erro',
        texto: 'Selecione o SKU em todas as linhas. O código do fornecedor é opcional.',
      })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const itensPayload = formatItensPayload()

      const res = await criarEntradaLoteTelaAction({
        pessoa_id: pessoaId,
        local_id: localId,
        documento,
        observacao,
        movimento_em: movimentoEm ? new Date(movimentoEm).toISOString() : undefined,
        itens: itensPayload,
      })

      if ('error' in res) {
        setFeedback({ tipo: 'erro', texto: res.error || 'Erro desconhecido.' })
        return
      }

      if (res.sucesso && res.loteId) {
        router.push(`/cockpit/estoque/entradas/${res.loteId}`)
      } else {
        setFeedback({
          tipo: 'erro',
          texto: res.mensagem || 'Falha ao efetivar lote de entrada.',
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 border animate-in fade-in duration-300 ${
            feedback.tipo === 'sucesso'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : feedback.tipo === 'alerta'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {feedback.tipo === 'sucesso' && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
          {feedback.tipo === 'alerta' && <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          {feedback.tipo === 'erro' && <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <div>{feedback.texto}</div>
        </div>
      )}

      {/* Bloco 1: Cabeçalho do Lote */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 space-y-4 shadow-xl">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-[#ffffff08] pb-3">
          <FileText className="h-4 w-4 text-emerald-400" />
          Cabeçalho da Entrada
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Fornecedor */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
              <Building2 className="h-3 w-3 text-gray-400" />
              Fornecedor <span className="text-red-400">*</span>
            </label>
            <SearchableSelect
              value={pessoaId}
              onChange={setPessoaId}
              placeholder="Buscar fornecedor…"
              emptyLabel="Nenhum fornecedor encontrado"
              options={fornecedores.map((f) => ({
                value: f.id,
                label: f.documento ? `${f.nome} (${f.documento})` : f.nome,
                searchText: `${f.nome} ${f.documento || ''}`,
              }))}
              inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-8 pr-8 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              {fornecedores.length === 0
                ? 'Nenhum fornecedor encontrado. Cadastre em Cadastros → Pessoas com o papel Fornecedor.'
                : 'Somente pessoas com papel Fornecedor.'}
            </p>
          </div>

          {/* Local de Destino */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-gray-400" />
              Local de Estoque <span className="text-red-400">*</span>
            </label>
            <select
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
            >
              {locais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} - {l.nome} {l.eh_principal ? '★ (Principal)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              Local onde a mercadoria será estocada.
            </p>
          </div>

          {/* Documento e Data */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Nº Documento / NF
              </label>
              <input
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Ex: NF 1024"
                className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-gray-400" />
                Data
              </label>
              <input
                type="date"
                value={movimentoEm}
                onChange={(e) => setMovimentoEm(e.target.value)}
                className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        </div>

        {/* Observação Geral */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Observação Geral do Lote (opcional)
          </label>
          <input
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: Recebimento emergencial balcão"
            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Bloco 2: Tabela de Itens */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#ffffff08] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-emerald-400" />
              Itens do Lote
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Informe o SKU Hugin e a UM de origem; a conversão para UM de estoque e o Cardex são
              automáticos. Código do fornecedor e justificativa são opcionais.
            </p>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar Item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300 min-w-[750px]">
            <thead className="bg-[#0e1319] text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
              <tr>
                <th className="py-2.5 px-3 w-10">#</th>
                <th className="py-2.5 px-3 w-64">SKU / Produto *</th>
                <th className="py-2.5 px-3 w-32">Cód. Fornecedor</th>
                <th className="py-2.5 px-3 w-20">UM Origem</th>
                <th className="py-2.5 px-3 w-24">Qtd Origem *</th>
                <th className="py-2.5 px-3">Justificativa</th>
                <th className="py-2.5 px-3 w-36 text-center">Status / Qtd Estoque</th>
                <th className="py-2.5 px-3 w-10 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff05]">
              {rows.map((row, idx) => {
                const val = row.validacao
                const hasError = val?.status === 'erro'
                const isOk = val?.status === 'ok'

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      hasError ? 'bg-red-500/5' : isOk ? 'bg-emerald-500/5' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-mono text-gray-500">{idx + 1}</td>

                    {/* SKU Selection */}
                    <td className="py-3 px-3">
                      <SearchableSelect
                        value={row.sku_id}
                        onChange={(sku_id) => updateRow(idx, { sku_id })}
                        placeholder="Buscar SKU (código ou nome)…"
                        emptyLabel="Nenhum SKU com este termo"
                        options={skus.map((s) => ({
                          value: s.id,
                          label: `${s.codigo} - ${s.nome} (${s.unidade_estoque})`,
                          searchText: `${s.codigo} ${s.nome}`,
                        }))}
                        inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                      />
                    </td>

                    {/* Código Parceiro */}
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={row.codigo_parceiro}
                        onChange={(e) => updateRow(idx, { codigo_parceiro: e.target.value })}
                        placeholder="Opcional"
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500/50"
                      />
                    </td>

                    {/* UM Origem */}
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={row.unidade_origem}
                        onChange={(e) =>
                          updateRow(idx, { unidade_origem: e.target.value.toUpperCase() })
                        }
                        placeholder="UN"
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono uppercase text-center focus:outline-none focus:border-emerald-500/50"
                      />
                    </td>

                    {/* Quantidade Origem */}
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={row.quantidade_origem}
                        onChange={(e) => updateRow(idx, { quantidade_origem: e.target.value })}
                        placeholder="1"
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-emerald-500/50"
                      />
                    </td>

                    {/* Justificativa */}
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={row.justificativa}
                        onChange={(e) => updateRow(idx, { justificativa: e.target.value })}
                        placeholder="Motivo da entrada..."
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                      />
                      {hasError && val?.erro_mensagem && (
                        <div className="text-[10px] text-red-400 mt-1 flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          <span>{val.erro_mensagem}</span>
                        </div>
                      )}
                    </td>

                    {/* Status e Quantidade Estoque */}
                    <td className="py-3 px-3 text-center">
                      {isOk && val?.quantidade_estoque != null ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" />
                            +{val.quantidade_estoque} {val.unidade_estoque}
                          </span>
                          {val.fator_conversao && val.fator_conversao !== 1 && (
                            <span className="text-[9px] text-gray-500 font-mono mt-0.5">
                              (fator: {val.fator_conversao})
                            </span>
                          )}
                        </div>
                      ) : hasError ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                          <XCircle className="h-3 w-3" />
                          Erro
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500">—</span>
                      )}
                    </td>

                    {/* Remover linha */}
                    <td className="py-3 px-3 text-right">
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Remover linha"
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

      {/* Ações Inferiores */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <Link
          href="/cockpit/estoque/entradas"
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          ← Cancelar e Voltar para Lista
        </Link>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleValidar}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-200 bg-[#ffffff08] hover:bg-[#ffffff12] border border-[#ffffff15] rounded-xl transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
            Validar Linhas (Prévia)
          </button>

          <button
            type="button"
            onClick={handleEfetivar}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all"
          >
            {isPending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Efetivando no Estoque...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Confirmar e Efetivar Entrada
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
