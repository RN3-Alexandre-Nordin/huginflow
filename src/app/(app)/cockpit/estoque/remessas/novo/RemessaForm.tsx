'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Truck,
  Building2,
  Calendar,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MapPin,
  FileText,
  Hash,
} from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import { criarRemessaAction, previewNumeroRemessaAction } from '../actions'
import { MOTIVOS_REMESSA } from '@/lib/estoque/operacoes-avancadas'

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
  papeis?: string[]
}

interface LocalOption {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

interface SaldoKey {
  sku_id: string
  local_id: string
  quantidade: number
}

interface Props {
  pessoas: PessoaOption[]
  skus: SkuOption[]
  locais: LocalOption[]
  saldos: SaldoKey[]
  defaultLocalId?: string
}

interface RowItem {
  id: string
  sku_id: string
  local_origem_id: string
  quantidade_enviada: string
}

function saldoKey(skuId: string, localId: string) {
  return `${skuId}|${localId}`
}

export default function RemessaForm({
  pessoas,
  skus,
  locais,
  saldos,
  defaultLocalId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const defaultLocal = defaultLocalId || (locais[0]?.id ?? '')

  const [destinatarioId, setDestinatarioId] = useState('')
  const [motivoCodigo, setMotivoCodigo] = useState('remessa_conserto')
  const [motivoTexto, setMotivoTexto] = useState('')
  const [documento, setDocumento] = useState('')
  const [previsaoRetorno, setPrevisaoRetorno] = useState('')
  const [observacao, setObservacao] = useState('')
  const [numeroLotePreview, setNumeroLotePreview] = useState<string | null>(null)

  const [rows, setRows] = useState<RowItem[]>([
    {
      id: 'row-1',
      sku_id: '',
      local_origem_id: defaultLocal,
      quantidade_enviada: '1',
    },
  ])

  const [feedback, setFeedback] = useState<{
    tipo: 'erro' | 'sucesso'
    texto: string
  } | null>(null)

  const saldoMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of saldos) {
      m.set(saldoKey(s.sku_id, s.local_id), Number(s.quantidade) || 0)
    }
    return m
  }, [saldos])

  const skuMap = useMemo(() => new Map(skus.map((s) => [s.id, s])), [skus])

  useEffect(() => {
    let ativo = true
    previewNumeroRemessaAction().then((res) => {
      if (ativo) setNumeroLotePreview(res.numero)
    })
    return () => {
      ativo = false
    }
  }, [])

  function getSaldo(skuId: string, localId: string) {
    if (!skuId || !localId) return null
    return saldoMap.get(saldoKey(skuId, localId)) ?? 0
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        sku_id: '',
        local_origem_id: defaultLocal,
        quantidade_enviada: '1',
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
    if (!destinatarioId) {
      setFeedback({
        tipo: 'erro',
        texto: 'Selecione o destinatário no cadastro de pessoas (qualquer papel).',
      })
      return
    }

    if (motivoCodigo === 'outro' && (!motivoTexto || motivoTexto.trim().length < 3)) {
      setFeedback({
        tipo: 'erro',
        texto: 'Para o motivo "Outro", descreva detalhadamente a justificativa.',
      })
      return
    }

    const vazios = rows.some((r) => !r.sku_id || !r.local_origem_id)
    if (vazios) {
      setFeedback({
        tipo: 'erro',
        texto: 'Selecione o SKU e o local de saída em todas as linhas.',
      })
      return
    }

    const parsed = rows.map((r, idx) => ({
      linha: idx + 1,
      sku_id: r.sku_id,
      local_origem_id: r.local_origem_id,
      qtd: parseFloat(r.quantidade_enviada.replace(',', '.')),
    }))

    if (parsed.some((r) => !Number.isFinite(r.qtd) || r.qtd <= 0)) {
      setFeedback({
        tipo: 'erro',
        texto: 'A quantidade enviada deve ser maior que zero em todos os itens.',
      })
      return
    }

    // Demanda agregada por SKU×local (mesma regra do backend)
    const demanda = new Map<string, { sku_id: string; local_id: string; qtd: number; linha: number }>()
    for (const r of parsed) {
      const key = saldoKey(r.sku_id, r.local_origem_id)
      const prev = demanda.get(key)
      if (prev) {
        prev.qtd += r.qtd
      } else {
        demanda.set(key, {
          sku_id: r.sku_id,
          local_id: r.local_origem_id,
          qtd: r.qtd,
          linha: r.linha,
        })
      }
    }

    for (const d of demanda.values()) {
      const disponivel = saldoMap.get(saldoKey(d.sku_id, d.local_id)) ?? 0
      if (d.qtd > disponivel) {
        const sku = skuMap.get(d.sku_id)
        const local = locais.find((l) => l.id === d.local_id)
        setFeedback({
          tipo: 'erro',
          texto: `Saldo insuficiente em ${local?.codigo || 'local'} para ${sku?.codigo || 'SKU'} (linhas). Disponível: ${disponivel} — Solicitado: ${d.qtd}.`,
        })
        return
      }
    }

    setFeedback(null)
    startTransition(async () => {
      const res = await criarRemessaAction({
        destinatario_pessoa_id: destinatarioId,
        motivo_codigo: motivoCodigo,
        motivo_texto: motivoTexto.trim() || undefined,
        observacao: observacao.trim() || undefined,
        documento,
        previsao_retorno_em: previsaoRetorno || undefined,
        itens: parsed.map((r) => ({
          linha: r.linha,
          sku_id: r.sku_id,
          local_origem_id: r.local_origem_id,
          quantidade_enviada: r.qtd,
        })),
      })

      if ('error' in res) {
        setFeedback({ tipo: 'erro', texto: res.error || 'Erro desconhecido.' })
        return
      }

      if (res.sucesso && res.remessaId) {
        router.push(`/cockpit/estoque/remessas/${res.remessaId}`)
      } else {
        setFeedback({ tipo: 'erro', texto: res.mensagem || 'Falha ao registrar remessa.' })
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
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2">
          <Hash className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Lote
          </span>
          <span className="font-mono text-sm font-bold text-purple-300">
            {numeroLotePreview || 'REM-…'}
          </span>
          <span className="text-[10px] text-gray-500">gerado na confirmação</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
              <Building2 className="h-3 w-3 text-purple-400" />
              Destinatário (Pessoa) <span className="text-red-400">*</span>
            </label>
            <SearchableSelect
              value={destinatarioId}
              onChange={setDestinatarioId}
              placeholder="Buscar pessoa do cadastro…"
              emptyLabel="Nenhuma pessoa encontrada"
              options={pessoas.map((p) => {
                const papeis =
                  p.papeis && p.papeis.length > 0 ? ` · ${p.papeis.join(', ')}` : ''
                const doc = p.documento ? ` (${p.documento})` : ''
                return {
                  value: p.id,
                  label: `${p.nome}${doc}${papeis}`,
                  searchText: `${p.nome} ${p.documento || ''} ${(p.papeis || []).join(' ')}`,
                }
              })}
              inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-8 pr-8 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
            />
            <p className="mt-1 text-[10px] text-gray-500">
              Qualquer pessoa ativa: cliente, fornecedor ou outro papel.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Finalidade / Motivo <span className="text-red-400">*</span>
            </label>
            <select
              value={motivoCodigo}
              onChange={(e) => setMotivoCodigo(e.target.value)}
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
            >
              {MOTIVOS_REMESSA.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {motivoCodigo === 'outro' && (
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Descreva o Motivo <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={motivoTexto}
              onChange={(e) => setMotivoTexto(e.target.value)}
              placeholder="Descreva a finalidade do envio..."
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Nº Documento / OS / Contrato
            </label>
            <input
              type="text"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Ex: OS-2024-889"
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3 text-gray-400" />
              Previsão de Retorno (opcional)
            </label>
            <input
              type="date"
              value={previsaoRetorno}
              onChange={(e) => setPrevisaoRetorno(e.target.value)}
              className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
            <FileText className="h-3 w-3 text-gray-400" />
            Observação do lote
          </label>
          <input
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: Envio para comodato, retorna o que não vender"
            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
          />
          <p className="mt-1 text-[10px] text-gray-500">
            Uma observação para o lote inteiro (não por linha).
          </p>
        </div>
      </div>

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#ffffff08] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Truck className="h-4 w-4 text-purple-400" />
              Itens a Enviar
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Cada linha pode sair de um local diferente. O saldo exibido é do local selecionado.
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
                <th className="py-2.5 px-3 min-w-[14rem]">SKU / Produto *</th>
                <th className="py-2.5 px-3 w-44">Local de Saída *</th>
                <th className="py-2.5 px-3 w-36">Qtd Enviada *</th>
                <th className="py-2.5 px-3 w-28">Disp. no local</th>
                <th className="py-2.5 px-3 w-10 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff05]">
              {rows.map((row, idx) => {
                const skuSelected = skuMap.get(row.sku_id)
                const disponivel = getSaldo(row.sku_id, row.local_origem_id)
                const qtd = parseFloat(row.quantidade_enviada.replace(',', '.'))
                const saldoBaixo =
                  disponivel !== null &&
                  Number.isFinite(qtd) &&
                  qtd > disponivel

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
                        <MapPin className="h-3 w-3 text-gray-500 shrink-0" />
                        <select
                          value={row.local_origem_id}
                          onChange={(e) =>
                            updateRow(idx, { local_origem_id: e.target.value })
                          }
                          className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                        >
                          {locais.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.codigo} — {l.nome}
                              {l.eh_principal ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={row.quantidade_enviada}
                          onChange={(e) =>
                            updateRow(idx, { quantidade_enviada: e.target.value })
                          }
                          placeholder="1"
                          className={`w-full bg-[#0d1218] border rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-right focus:outline-none ${
                            saldoBaixo
                              ? 'border-red-500/50 focus:border-red-500/70'
                              : 'border-[#ffffff10] focus:border-purple-500/50'
                          }`}
                        />
                        <span className="text-[11px] text-gray-400 font-mono w-8">
                          {skuSelected?.unidade_estoque || 'UN'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {row.sku_id && row.local_origem_id ? (
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            saldoBaixo ? 'text-red-400' : 'text-purple-300'
                          }`}
                        >
                          {Number(disponivel ?? 0).toLocaleString('pt-BR', {
                            maximumFractionDigits: 4,
                          })}{' '}
                          {skuSelected?.unidade_estoque || 'UN'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-600">—</span>
                      )}
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
          href="/cockpit/estoque/remessas"
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          ← Cancelar e Voltar para Lista
        </Link>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all"
        >
          {isPending ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Enviando Remessa...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Confirmar Envio da Remessa
            </>
          )}
        </button>
      </div>
    </div>
  )
}
