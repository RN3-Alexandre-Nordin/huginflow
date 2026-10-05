'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { transicionarStatusRequisicaoAction } from '../actions'

export type PendenteRow = {
  id: string
  numero: string
  observacao: string | null
  valor_estimado: number
  created_at: string
  requisitante_nome: string
  solicitante_nome: string | null
}

export default function AprovacaoList({ itens }: { itens: PendenteRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    tipo: 'ok' | 'erro'
    texto: string
  } | null>(null)

  function decidir(id: string, resultado: 'aprovada' | 'rejeitada') {
    const verbo = resultado === 'aprovada' ? 'aprovar' : 'rejeitar'
    if (!window.confirm(`Confirma ${verbo} esta requisição?`)) return

    setFeedback(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await transicionarStatusRequisicaoAction(id, resultado)
      setBusyId(null)
      if ('error' in res && res.error) {
        setFeedback({ tipo: 'erro', texto: res.error })
        return
      }
      setFeedback({
        tipo: 'ok',
        texto:
          resultado === 'aprovada'
            ? 'Requisição aprovada e liberada para atendimento.'
            : 'Requisição rejeitada.',
      })
      router.refresh()
    })
  }

  if (itens.length === 0) {
    return (
      <div className="rounded-2xl border border-[#ffffff0a] bg-[#121820] p-12 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400/40" />
        <p className="text-sm font-semibold text-white">Nenhuma requisição pendente</p>
        <p className="mt-1 text-xs text-gray-500">
          Quando houver envios que exijam aprovação, eles aparecerão aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ${
            feedback.tipo === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {feedback.tipo === 'ok' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {feedback.texto}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#121820] shadow-xl">
        <table className="w-full text-left text-xs text-gray-300">
          <thead className="border-b border-[#ffffff08] bg-[#0e1319] text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Requisitante</th>
              <th className="px-4 py-3">Solicitante</th>
              <th className="px-4 py-3 text-right">Valor (custo)</th>
              <th className="px-4 py-3">Criada em</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ffffff05]">
            {itens.map((row) => {
              const busy = isPending && busyId === row.id
              return (
                <tr key={row.id} className="hover:bg-[#ffffff03]">
                  <td className="px-4 py-3">
                    <a
                      href={`/cockpit/estoque/requisicoes/${row.id}`}
                      className="font-mono font-semibold text-purple-300 hover:underline"
                    >
                      {row.numero}
                    </a>
                    {row.observacao && (
                      <span className="mt-0.5 block max-w-xs truncate text-[10px] text-gray-500">
                        {row.observacao}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white">{row.requisitante_nome}</td>
                  <td className="px-4 py-3 text-gray-400">{row.solicitante_nome || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-300">
                    {Number(row.valor_estimado || 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-400">
                    {new Date(row.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy || isPending}
                        onClick={() => decidir(row.id, 'aprovada')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {busy ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={busy || isPending}
                        onClick={() => decidir(row.id, 'rejeitada')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 px-3 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <XCircle className="h-3 w-3" />
                        Rejeitar
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
