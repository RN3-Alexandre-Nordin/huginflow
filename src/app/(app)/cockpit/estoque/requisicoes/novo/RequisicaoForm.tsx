'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ClipboardList,
  User,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Send,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import { criarRequisicaoAction } from '../actions'

interface SkuOption {
  id: string
  codigo: string
  nome: string
  unidade_estoque: string
}

interface PessoaOption {
  id: string
  nome: string
  documento?: string | null
  papeis?: string[] | null
}

interface LocalOption {
  id: string
  codigo: string
  nome: string
}

interface Props {
  pessoas: PessoaOption[]
  skus: SkuOption[]
  locais: LocalOption[]
  aprovacaoAtiva?: boolean
  valorMinimo?: number
}

interface RowItem {
  id: string
  sku_id: string
  quantidade_pedida: string
  local_id: string
}

export default function RequisicaoForm({
  pessoas,
  skus,
  locais,
  aprovacaoAtiva = false,
  valorMinimo = 0,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [requisitanteId, setRequisitanteId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [rows, setRows] = useState<RowItem[]>([
    { id: 'row-1', sku_id: '', quantidade_pedida: '1', local_id: '' },
  ])

  const [feedback, setFeedback] = useState<{
    tipo: 'erro' | 'sucesso'
    texto: string
  } | null>(null)

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: `row-${Date.now()}`, sku_id: '', quantidade_pedida: '1', local_id: '' },
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

  function handleSubmit(enviarImediatamente: boolean) {
    if (!requisitanteId) {
      setFeedback({ tipo: 'erro', texto: 'Selecione a pessoa requisitante.' })
      return
    }

    const vazios = rows.some((r) => !r.sku_id)
    if (vazios) {
      setFeedback({ tipo: 'erro', texto: 'Selecione o SKU em todas as linhas.' })
      return
    }

    const invalidQtd = rows.some((r) => {
      const val = parseFloat(r.quantidade_pedida.replace(',', '.'))
      return isNaN(val) || val <= 0
    })
    if (invalidQtd) {
      setFeedback({
        tipo: 'erro',
        texto: 'A quantidade pedida deve ser maior que zero em todos os itens.',
      })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const itensPayload = rows.map((r, idx) => ({
        linha: idx + 1,
        sku_id: r.sku_id,
        quantidade_pedida: parseFloat(r.quantidade_pedida.replace(',', '.')),
        local_id: r.local_id || null,
      }))

      const res = await criarRequisicaoAction({
        requisitante_pessoa_id: requisitanteId,
        observacao,
        enviar_imediatamente: enviarImediatamente,
        itens: itensPayload,
      })

      if ('error' in res) {
        setFeedback({ tipo: 'erro', texto: res.error || 'Erro desconhecido.' })
        return
      }

      if (res.sucesso && res.requisicaoId) {
        if (res.mensagem) {
          setFeedback({ tipo: 'sucesso', texto: res.mensagem })
        }
        router.push(`/cockpit/estoque/requisicoes/${res.requisicaoId}`)
      } else {
        setFeedback({ tipo: 'erro', texto: res.mensagem || 'Falha ao salvar requisição.' })
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

      {/* Cabeçalho */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 space-y-4 shadow-xl">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-[#ffffff08] pb-3">
          <User className="h-4 w-4 text-purple-400" />
          Dados da Solicitação
        </h2>

        {aprovacaoAtiva && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-200/90 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              A aprovação interna está ativa nesta empresa.
              {valorMinimo > 0 ? (
                <>
                  {' '}
                  Requisições com valor estimado (Σ qtd × preço de custo) a partir de{' '}
                  <strong className="text-amber-100">
                    {valorMinimo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>{' '}
                  vão para a fila de aprovação; abaixo disso são liberadas automaticamente.
                </>
              ) : (
                <> Todo envio vai para a fila de aprovação.</>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
              <User className="h-3 w-3 text-gray-400" />
              Requisitante (Pessoa) <span className="text-red-400">*</span>
            </label>
            <select
              value={requisitanteId}
              onChange={(e) => setRequisitanteId(e.target.value)}
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
            >
              <option value="">Selecione o Requisitante...</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.documento ? ` (${p.documento})` : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              Somente pessoas com papel <span className="text-gray-400">Funcionário</span> em
              Cadastros → Pessoas.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Observação / Finalidade do Pedido
            </label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Manutenção preventiva na linha de montagem 02"
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
            />
          </div>
        </div>
      </div>

      {/* Tabela de Itens */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#ffffff08] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-purple-400" />
              Itens Requisitados
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Selecione os SKUs e a quantidade necessária.
            </p>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-xl transition-all"
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
                <th className="py-2.5 px-3">SKU / Produto *</th>
                <th className="py-2.5 px-3 w-32">Qtd Solicitada *</th>
                <th className="py-2.5 px-3 w-44">Local Sugerido</th>
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
                        inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={row.quantidade_pedida}
                          onChange={(e) =>
                            updateRow(idx, { quantidade_pedida: e.target.value })
                          }
                          placeholder="1"
                          className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-purple-500/50"
                        />
                        <span className="text-[11px] text-gray-400 font-mono w-8">
                          {skuSelected?.unidade_estoque || 'UN'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={row.local_id}
                        onChange={(e) => updateRow(idx, { local_id: e.target.value })}
                        className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                      >
                        <option value="">Local Padrão</option>
                        {locais.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.codigo} - {l.nome}
                          </option>
                        ))}
                      </select>
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

      {/* Ações Inferiores */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <Link
          href="/cockpit/estoque/requisicoes"
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          ← Cancelar e Voltar para Lista
        </Link>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-300 bg-[#ffffff08] hover:bg-[#ffffff12] border border-[#ffffff15] rounded-xl transition-all"
          >
            Salvar como Rascunho
          </button>

          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all"
          >
            {isPending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Criando Requisição...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Criar e Enviar para Aprovação
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
