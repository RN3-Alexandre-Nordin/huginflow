'use client'

import { Navigation, X } from 'lucide-react'
import CardRedirectPanel from '@/components/kanban/CardRedirectPanel'

type Stage = { id: string; nome: string; ordem?: number | null }

type Props = {
  open: boolean
  onClose: () => void
  onDone: () => void
  card: {
    id: string
    titulo: string
    cliente_nome?: string | null
    valor?: number | null
    descricao?: string | null
    observacao?: string | null
    responsavel_id?: string | null
    data_prazo?: string | null
    stage_id: string
    lead_id?: string | null
  }
  pipelineId: string
  pipelineName: string
  stages: Stage[]
  leadName?: string | null
}

export default function ChatCardRedirectModal({
  open,
  onClose,
  onDone,
  card,
  pipelineId,
  pipelineName,
  stages,
  leadName,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="bg-[#0F0F0F] border border-[#ffffff10] rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-labelledby="chat-redirect-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-[#ffffff08] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0">
              <Navigation className="w-4 h-4 text-orange-400" />
            </div>
            <div className="min-w-0">
              <h3 id="chat-redirect-title" className="text-sm font-black text-white truncate">
                Encaminhar card
              </h3>
              <p className="text-[10px] text-gray-500 truncate">
                {card.titulo || leadName || 'Card da conversa'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-[#ffffff08]"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          <CardRedirectPanel
            card={card}
            currentPipelineId={pipelineId}
            currentPipelineName={pipelineName}
            currentStages={stages}
            onDone={onDone}
            onCancel={onClose}
          />
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ffffff10;
          border-radius: 10px;
        }
      `}</style>
    </div>
  )
}
