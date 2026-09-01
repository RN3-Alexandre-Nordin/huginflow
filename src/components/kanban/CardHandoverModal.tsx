'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { Loader2, Send, X, ClipboardList } from 'lucide-react'
import {
  HANDOVER_URGENCIA_LABELS,
  HANDOVER_URGENCIA_LEVELS,
  type HandoverUrgencia,
} from '@/lib/crm/cardHandoverSummary'

const OVERLAY_BG = 'rgba(0, 0, 0, 0.9)'
const PANEL_BG = '#0d0d0d'
const INPUT_BG = '#080808'

const URGENCIA_SELECTED_STYLE: Record<
  HandoverUrgencia,
  { backgroundColor: string; borderColor: string; color: string; dotColor: string }
> = {
  baixa: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderColor: 'rgba(52, 211, 153, 0.65)',
    color: '#6ee7b7',
    dotColor: '#34d399',
  },
  normal: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: 'rgba(251, 191, 36, 0.65)',
    color: '#fcd34d',
    dotColor: '#fbbf24',
  },
  alta: {
    backgroundColor: 'rgba(239, 68, 68, 0.22)',
    borderColor: 'rgba(248, 113, 113, 0.65)',
    color: '#fca5a5',
    dotColor: '#ef4444',
  },
}

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
  isGenerating: boolean
  error: string | null
  notice: string | null
  observacao: string
  onObservacaoChange: (value: string) => void
  urgencia: HandoverUrgencia
  onUrgenciaChange: (value: HandoverUrgencia) => void
  dePipelineNome: string
  paraPipelineNome: string
  dataPrazo: string
}

export default function CardHandoverModal({
  open,
  onClose,
  onConfirm,
  isPending,
  isGenerating,
  error,
  notice,
  observacao,
  onObservacaoChange,
  urgencia,
  onUrgenciaChange,
  dePipelineNome,
  paraPipelineNome,
  dataPrazo,
}: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !mounted) return null

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ backgroundColor: OVERLAY_BG }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose()
      }}
    >
      <div
        className="border border-[#ffffff20] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.9)] overflow-hidden"
        style={{ backgroundColor: PANEL_BG }}
        role="dialog"
        aria-labelledby="handover-modal-title"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between p-4 border-b border-[#ffffff14] shrink-0"
          style={{ backgroundColor: PANEL_BG }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4 text-orange-400" />
            </div>
            <div className="min-w-0">
              <h3 id="handover-modal-title" className="text-sm font-black text-white truncate">
                Resumo para encaminhamento
              </h3>
              <p className="text-[10px] text-gray-500 truncate">
                {dePipelineNome} → {paraPipelineNome}
                {dataPrazo ? ` · prazo ${new Date(dataPrazo + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-[#ffffff12] disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto p-5 space-y-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#ffffff20] [&::-webkit-scrollbar-thumb]:rounded-full"
          style={{ backgroundColor: PANEL_BG }}
        >
          <p className="text-[11px] text-gray-500 leading-relaxed">
            A IA gerou um resumo da conversa para o próximo operador. Revise, edite se necessário e confirme o
            encaminhamento.
          </p>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              Urgência
            </label>
            <div
              className="flex flex-row items-stretch gap-1.5 p-1 rounded-xl bg-[#050505] border border-[#ffffff10]"
              role="radiogroup"
              aria-label="Nível de urgência"
            >
              {HANDOVER_URGENCIA_LEVELS.map((level) => {
                const selected = urgencia === level
                const tone = URGENCIA_SELECTED_STYLE[level]
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={isPending || isGenerating}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onUrgenciaChange(level)
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-bold border-2 transition-colors cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${
                      selected
                        ? ''
                        : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#ffffff05]'
                    }`}
                    style={
                      selected
                        ? {
                            backgroundColor: tone.backgroundColor,
                            borderColor: tone.borderColor,
                            color: tone.color,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: tone.dotColor,
                        opacity: selected ? 1 : 0.45,
                      }}
                      aria-hidden
                    />
                    {HANDOVER_URGENCIA_LABELS[level]}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-gray-600">
              Sugerida pela IA com base no tom da conversa — ajuste se necessário.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              Resumo
            </label>

            {isGenerating ? (
              <div
                className="flex items-center justify-center gap-2 py-16 rounded-xl border border-[#ffffff14] text-gray-500"
                style={{ backgroundColor: INPUT_BG }}
              >
                <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                <span className="text-sm">Gerando resumo da conversa…</span>
              </div>
            ) : (
              <textarea
                rows={14}
                value={observacao}
                onChange={(e) => onObservacaoChange(e.target.value)}
                disabled={isPending}
                placeholder={
                  'Motivo do encaminhamento:\n...\n\nO que já foi feito:\n...\n\nO que falta fazer:\n...'
                }
                className="w-full border border-[#ffffff18] focus:border-orange-500/60 rounded-xl p-3 text-[13px] text-gray-100 outline-none resize-y min-h-[240px] leading-7 whitespace-pre-wrap disabled:opacity-60 font-sans"
                style={{ backgroundColor: INPUT_BG, whiteSpace: 'pre-wrap' }}
              />
            )}
          </div>

          {notice && !error && (
            <p className="text-[11px] text-amber-400/90 font-medium">{notice}</p>
          )}
          {error && <p className="text-[11px] text-red-400 font-medium">{error}</p>}
        </div>

        <div
          className="flex gap-2 p-4 border-t border-[#ffffff14] shrink-0"
          style={{ backgroundColor: PANEL_BG }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onConfirm()
            }}
            disabled={isPending || isGenerating || !observacao.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isPending ? 'Encaminhando…' : 'Salvar e encaminhar'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            disabled={isPending}
            className="px-5 py-3 rounded-xl text-sm font-bold bg-[#ffffff12] text-gray-400 hover:text-white disabled:opacity-50"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
