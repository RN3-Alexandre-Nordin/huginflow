'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Lock,
  MapPin,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react'
import {
  atenderRequisicaoAction,
  transicionarStatusRequisicaoAction,
} from '../actions'

interface Props {
  requisicaoId: string
  status: string
  canApprove: boolean
  canAtender: boolean
  locais: Array<{ id: string; codigo: string; nome: string; eh_principal: boolean }>
  modoSaldo: string
}

export default function AtendimentoPanel({
  requisicaoId,
  status,
  canApprove,
  canAtender,
  locais,
  modoSaldo,
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

  function handleTransition(novoStatus: 'enviada' | 'aprovada' | 'cancelada') {
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
    startTransition(async () => {
      const res = await atenderRequisicaoAction(requisicaoId, localBaixaId)
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

      {/* Barra de Ações de Transição */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs text-gray-400 block font-medium">Ações da Requisição</span>
          <span className="text-[11px] text-gray-500">
            Política de saldo ativa: <strong className="text-gray-300">{modoLabel}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {status === 'rascunho' && (
            <button
              type="button"
              onClick={() => handleTransition('enviada')}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar para Aprovação
            </button>
          )}

          {status === 'enviada' && canApprove && (
            <button
              type="button"
              onClick={() => handleTransition('aprovada')}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aprovar Requisição
            </button>
          )}

          {(status === 'aprovada' || status === 'parcialmente_atendida') && canAtender && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-[#0d1218] border border-[#ffffff10] rounded-xl px-2.5 py-1 text-xs text-white">
                <MapPin className="h-3 w-3 text-emerald-400" />
                <select
                  value={localBaixaId}
                  onChange={(e) => setLocalBaixaId(e.target.value)}
                  className="bg-transparent text-xs text-white focus:outline-none"
                >
                  {locais.map((l) => (
                    <option key={l.id} value={l.id} className="bg-[#0d1218] text-white">
                      Baixar de: {l.codigo} {l.eh_principal ? '★' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleAtender}
                disabled={isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Baixando Estoque...
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    Atender e Baixar Estoque
                  </>
                )}
              </button>
            </div>
          )}

          {['rascunho', 'enviada', 'aprovada'].includes(status) && (
            <button
              type="button"
              onClick={() => handleTransition('cancelada')}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
