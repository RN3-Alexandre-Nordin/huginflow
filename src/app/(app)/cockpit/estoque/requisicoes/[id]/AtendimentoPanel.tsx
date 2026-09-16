'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  MapPin,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react'
import {
  atenderRequisicaoAction,
  transicionarStatusRequisicaoAction,
} from '../actions'

export type ItemAtendimentoUi = {
  id: string
  sku_id: string
  sku_codigo: string
  sku_nome: string
  unidade: string
  quantidade_pedida: number
  quantidade_atendida: number
  quantidade_pendente: number
  status_item: string
  local_id: string | null
}

type SaldoRow = { sku_id: string; local_id: string; quantidade: number }

interface Props {
  requisicaoId: string
  status: string
  canApprove: boolean
  canAtender: boolean
  locais: Array<{ id: string; codigo: string; nome: string; eh_principal: boolean }>
  modoSaldo: string
  itens: ItemAtendimentoUi[]
  saldos: SaldoRow[]
}

export default function AtendimentoPanel({
  requisicaoId,
  status,
  canApprove,
  canAtender,
  locais,
  modoSaldo,
  itens,
  saldos,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [localBaixaId, setLocalBaixaId] = useState(
    locais.find((l) => l.eh_principal)?.id || locais[0]?.id || ''
  )
  const [feedback, setFeedback] = useState<{
    tipo: 'erro' | 'sucesso' | 'alerta'
    texto: string
  } | null>(null)

  const pendentes = useMemo(
    () => itens.filter((i) => Number(i.quantidade_pendente) > 0 && i.status_item !== 'pulado'),
    [itens]
  )

  const saldoNoLocal = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of saldos) {
      if (s.local_id === localBaixaId) {
        map[s.sku_id] = Number(s.quantidade)
      }
    }
    return map
  }, [saldos, localBaixaId])

  const [qtds, setQtds] = useState<Record<string, string>>({})

  const qtdsSeedKey = useMemo(
    () =>
      `${localBaixaId}|${itens
        .map((i) => `${i.id}:${i.quantidade_pendente}:${i.status_item}`)
        .join('|')}|${Object.entries(saldoNoLocal)
        .map(([k, v]) => `${k}=${v}`)
        .join('|')}`,
    [localBaixaId, itens, saldoNoLocal]
  )

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const it of itens) {
      if (Number(it.quantidade_pendente) <= 0 || it.status_item === 'pulado') continue
      const saldo = saldoNoLocal[it.sku_id] || 0
      const max = Math.min(Number(it.quantidade_pendente), Math.max(0, saldo))
      next[it.id] = String(max)
    }
    setQtds(next)
  }, [qtdsSeedKey, itens, saldoNoLocal])

  function handleTransition(
    novoStatus: 'pendente_aprovacao' | 'aprovada' | 'rejeitada' | 'cancelada'
  ) {
    setFeedback(null)
    startTransition(async () => {
      const res = await transicionarStatusRequisicaoAction(requisicaoId, novoStatus)
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
      } else {
        setFeedback({ tipo: 'sucesso', texto: `Status atualizado para "${novoStatus}".` })
        router.refresh()
      }
    })
  }

  function handleAtender() {
    setFeedback(null)
    const itensAtender = pendentes
      .map((it) => ({
        item_id: it.id,
        quantidade: parseFloat((qtds[it.id] || '0').replace(',', '.')),
      }))
      .filter((i) => Number.isFinite(i.quantidade) && i.quantidade > 0)

    if (itensAtender.length === 0) {
      setFeedback({
        tipo: 'erro',
        texto:
          'Informe a quantidade a atender em pelo menos um item (maior que zero e dentro do saldo do local).',
      })
      return
    }

    startTransition(async () => {
      const res = await atenderRequisicaoAction(requisicaoId, localBaixaId, itensAtender)
      if ('error' in res) {
        setFeedback({ tipo: 'erro', texto: res.error || 'Erro desconhecido.' })
        return
      }

      if (res.sucesso) {
        setFeedback({ tipo: 'sucesso', texto: res.mensagem })
        router.refresh()
      } else {
        setFeedback({ tipo: 'erro', texto: res.mensagem || 'Falha ao atender requisição.' })
      }
    })
  }

  const modoLabel =
    modoSaldo === 'nao_atende_requisicao'
      ? 'Bloquear atendimento inteiro se qualquer item faltar saldo'
      : modoSaldo === 'pula_item'
        ? 'Pular itens sem saldo e atender os demais'
        : 'Atender parcial com saldo disponível e manter pendente'

  const podeAtenderAgora =
    (status === 'aprovada' || status === 'atendida_parcial') && canAtender && pendentes.length > 0

  const localAtual = locais.find((l) => l.id === localBaixaId)

  return (
    <div className="space-y-4">
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

      {/* Toolbar de ações */}
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#121820] shadow-xl">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">
              Ações da requisição
            </p>
            <p className="text-sm font-medium text-white">Operações disponíveis</p>
            <p className="text-[11px] leading-snug text-gray-500">
              Política de saldo:{' '}
              <span className="text-gray-300">{modoLabel}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {podeAtenderAgora && (
              <div className="w-full sm:w-56">
                <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  <MapPin className="h-3 w-3 text-emerald-400" />
                  Local de baixa
                </label>
                <select
                  value={localBaixaId}
                  onChange={(e) => setLocalBaixaId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3 text-xs text-white focus:border-emerald-500/40 focus:outline-none"
                >
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} — {l.nome}
                      {l.eh_principal ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {status === 'rascunho' && (
                <button
                  type="button"
                  onClick={() => handleTransition('pendente_aprovacao')}
                  disabled={isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-purple-600 px-4 text-xs font-semibold text-white shadow-lg shadow-purple-500/20 transition hover:bg-purple-500 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar para aprovação
                </button>
              )}

              {status === 'pendente_aprovacao' && canApprove && (
                <>
                  <Link
                    href="/cockpit/estoque/requisicoes/aprovacao"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15"
                  >
                    Abrir fila
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleTransition('aprovada')}
                    disabled={isPending}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Confirma a rejeição desta requisição?')) {
                        handleTransition('rejeitada')
                      }
                    }}
                    disabled={isPending}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-xs font-semibold text-white transition hover:bg-orange-500 disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Rejeitar
                  </button>
                </>
              )}

              {podeAtenderAgora && (
                <button
                  type="button"
                  onClick={handleAtender}
                  disabled={isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Baixando…
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      Atender seleção
                    </>
                  )}
                </button>
              )}

              {['rascunho', 'pendente_aprovacao', 'aprovada'].includes(status) && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Cancelar esta requisição?')) handleTransition('cancelada')
                  }}
                  disabled={isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 text-xs font-semibold text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Linhas de atendimento parcial — grid alinhado */}
        {podeAtenderAgora && (
          <div className="border-t border-[#ffffff08]">
            <div className="flex flex-col gap-1 border-b border-[#ffffff08] bg-[#0A0A0A]/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Atendimento deste ciclo</p>
                <p className="text-[11px] text-gray-500">
                  Ajuste as quantidades. O que não atender agora permanece pendente.
                </p>
              </div>
              {localAtual && (
                <p className="text-[10px] font-mono text-emerald-400/90">
                  Saldo exibido · {localAtual.codigo}
                </p>
              )}
            </div>

            {/* Cabeçalho desktop */}
            <div className="hidden grid-cols-[minmax(0,1.6fr)_7rem_7rem_10rem] gap-3 border-b border-[#ffffff08] bg-[#0e1319] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 md:grid">
              <span>SKU / produto</span>
              <span className="text-right">Pendente</span>
              <span className="text-right">Saldo local</span>
              <span className="text-right">Qtd a atender</span>
            </div>

            <ul className="divide-y divide-[#ffffff06]">
              {pendentes.map((it) => {
                const saldo = saldoNoLocal[it.sku_id] || 0
                const max = Math.min(Number(it.quantidade_pendente), Math.max(0, saldo))
                const semSaldo = saldo <= 0
                const parcialSaldo = !semSaldo && saldo < Number(it.quantidade_pendente)

                return (
                  <li
                    key={it.id}
                    className="grid grid-cols-1 gap-3 px-5 py-3.5 md:grid-cols-[minmax(0,1.6fr)_7rem_7rem_10rem] md:items-center md:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-semibold text-white">
                        {it.sku_codigo}
                      </p>
                      <p className="truncate text-[11px] text-gray-500">{it.sku_nome}</p>
                    </div>

                    <div className="flex items-center justify-between md:block md:text-right">
                      <span className="text-[10px] uppercase text-gray-600 md:hidden">
                        Pendente
                      </span>
                      <p className="font-mono text-sm tabular-nums text-amber-400">
                        {it.quantidade_pendente}
                        <span className="ml-1 text-[10px] text-gray-600">{it.unidade}</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between md:block md:text-right">
                      <span className="text-[10px] uppercase text-gray-600 md:hidden">
                        Saldo local
                      </span>
                      <p
                        className={`font-mono text-sm tabular-nums ${
                          semSaldo
                            ? 'text-red-400'
                            : parcialSaldo
                              ? 'text-amber-300'
                              : 'text-gray-300'
                        }`}
                      >
                        {saldo}
                        <span className="ml-1 text-[10px] text-gray-600">{it.unidade}</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 md:justify-end">
                      <span className="text-[10px] uppercase text-gray-600 md:hidden">
                        Qtd a atender
                      </span>
                      <div className="flex w-full max-w-[10rem] items-center overflow-hidden rounded-xl border border-[#ffffff15] bg-[#0A0A0A] focus-within:border-emerald-500/40 md:w-auto">
                        <input
                          type="number"
                          min={0}
                          max={max}
                          step="any"
                          value={qtds[it.id] ?? '0'}
                          onChange={(e) =>
                            setQtds((prev) => ({ ...prev, [it.id]: e.target.value }))
                          }
                          disabled={semSaldo || isPending}
                          className="h-10 w-full min-w-0 bg-transparent px-3 text-right font-mono text-sm tabular-nums text-white outline-none disabled:opacity-40"
                        />
                        <span className="shrink-0 border-l border-[#ffffff10] px-2.5 text-[10px] font-medium text-gray-500">
                          {it.unidade}
                        </span>
                      </div>
                    </div>

                    {semSaldo && (
                      <p className="col-span-full flex items-center gap-1.5 text-[10px] text-red-400/90 md:col-span-1 md:col-start-4 md:justify-end">
                        <AlertTriangle className="h-3 w-3" />
                        Sem saldo neste local
                      </p>
                    )}
                    {!semSaldo && max < Number(it.quantidade_pendente) && (
                      <p className="col-span-full text-[10px] text-gray-600 md:col-span-1 md:col-start-4 md:text-right">
                        Máx. neste ciclo: {max} {it.unidade}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
