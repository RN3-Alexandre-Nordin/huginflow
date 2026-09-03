'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, FileText } from 'lucide-react'
import { getCardConsultaContext } from '@/app/(app)/cockpit/crm/card-consulta-actions'
import type { CardConsultaContext } from '@/app/(app)/cockpit/crm/card-consulta-actions'
import CardConsultaContent from '@/components/crm/CardConsultaContent'

type Props = {
  cardId: string
  onClose: () => void
}

export default function CardConsultaDrawer({ cardId, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CardConsultaContext | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    void (async () => {
      const res = await getCardConsultaContext(cardId)
      if (cancelled) return
      setLoading(false)
      if ('error' in res) {
        if (res.error === 'FORBIDDEN') {
          setError('Sem permissão para visualizar este card.')
        } else if (res.error === 'NOT_FOUND') {
          setError('Card não encontrado.')
        } else {
          setError(('message' in res && res.message) ? res.message : 'Erro ao carregar card.')
        }
        return
      }
      setData(res.data)
    })()

    return () => {
      cancelled = true
    }
  }, [cardId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-30 flex justify-end animate-in fade-in duration-200">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Fechar consulta do card"
        onClick={onClose}
      />
      <aside
        className="relative w-full max-w-md h-full bg-[#0D0D0D] border-l border-[#ffffff0a] shadow-2xl flex flex-col min-h-0 animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-consulta-title"
      >
        <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-[#ffffff0a] bg-[#111111]">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-[#2BAADF] shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                Consulta do card
              </p>
              <h2 id="card-consulta-title" className="text-sm font-bold text-white truncate">
                {data?.card.titulo || 'Carregando…'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#ffffff08] transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 pt-4 min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin text-[#2BAADF]" />
              <span className="text-sm">Carregando card…</span>
            </div>
          )}
          {!loading && error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300 text-sm">
              {error}
            </div>
          )}
          {!loading && data && <CardConsultaContent data={data} compact />}
        </div>
      </aside>
    </div>
  )
}
