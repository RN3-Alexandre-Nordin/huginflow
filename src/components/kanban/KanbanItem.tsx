'use client'

import React, { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { User, MessageCircle, ChevronDown, ChevronUp, CalendarDays, Clock, CheckCircle2, Edit3 } from 'lucide-react'
import { toggleCardFinalizado } from '@/app/(app)/cockpit/crm/actions'
import { buildOmniChatUrl, navigateToOmniChat } from '@/lib/omni/chat-deep-link'

interface CardData {
  id: string
  titulo: string
  cliente_nome: string | null
  valor: number
  descricao: string | null
  observacao?: string | null
  stage_id: string
  lead_id?: string | null
  conversa_id?: string | null
  data_prazo?: string | null
  stage_entered_at?: string | null
  responsavel_id?: string | null
  responsavel?: { nome_completo: string } | null
  finalizado?: boolean
}

function getPrazoStatus(data_prazo: string | null | undefined): { label: string; cls: string } | null {
  if (!data_prazo) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const prazo = new Date(data_prazo + 'T00:00:00')
  const diffDays = Math.ceil((prazo.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { label: `Atrasado ${Math.abs(diffDays)}d`, cls: 'text-red-400 bg-red-500/10 border-red-500/20' }
  if (diffDays === 0) return { label: 'Vence hoje!', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }
  
  // No futuro (verde)
  return { 
    label: `No prazo (${new Date(data_prazo + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`, 
    cls: 'text-green-500 bg-green-500/10 border-green-500/20' 
  }
}

function getStageTime(stage_entered_at: string | null | undefined): string | null {
  if (!stage_entered_at) return null
  const entered = new Date(stage_entered_at)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - entered.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return '1 dia neste estágio'
  return `${diffDays}d neste estágio`
}

export default function KanbanItem({ 
  card, 
  isOverlay, 
  stageColor = '#2BAADF', 
  onEditClick,
  onChatClick,
  canMove = true,
  canEdit = true,
  canViewAttachments = true,
  canAddAttachments = true,
  canDeleteAttachments = true
}: { 
  card: CardData; 
  isOverlay?: boolean; 
  stageColor?: string; 
  onEditClick?: () => void;
  onChatClick?: () => void;
  canMove?: boolean;
  canEdit?: boolean;
  canViewAttachments?: boolean;
  canAddAttachments?: boolean;
  canDeleteAttachments?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !canMove,
    data: { type: "Card", card },
  })

  const style = { transition, transform: CSS.Transform.toString(transform) }
  const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(card.valor || 0)
  const prazoStatus = getPrazoStatus(card.data_prazo)
  const stageTime = getStageTime(card.stage_entered_at)
  const responsavelNome = card.responsavel?.nome_completo
  const responsavelInitials = responsavelNome?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

  if (isDragging && !isOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, borderColor: stageColor }}
        className="w-full bg-[#111111] opacity-50 border-2 border-dashed rounded-xl h-[60px]"
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canMove ? attributes : {})}
      {...(canMove ? listeners : {})}
      suppressHydrationWarning
      className={`relative w-full p-4 bg-[#111111] border border-[#ffffff0a] rounded-xl transition-all group ${isOverlay ? 'shadow-2xl scale-[1.02]' : 'shadow-md shadow-black/20'} ${canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      onContextMenu={(e) => { e.preventDefault(); setIsExpanded(!isExpanded) }}
    >
      <div className="absolute top-0 right-0 w-16 h-16 opacity-[0.02] rotate-12 group-hover:scale-150 transition-transform pointer-events-none" style={{ backgroundColor: stageColor }} />

      {/* Top Bar: Title & Toggle */}
      <div className="flex items-start justify-between pointer-events-none">
        <h4
          className="text-sm font-bold text-white transition-colors pr-2"
          style={isExpanded ? { color: stageColor } : {}}
        >
          {card.titulo}
        </h4>
        <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
          {canEdit && (
            <>
              <button
                type="button"
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={async (e) => { 
                  e.stopPropagation(); 
                  e.preventDefault(); 
                  await toggleCardFinalizado(card.id, card.stage_id, !card.finalizado)
                }}
                className={`p-1.5 rounded-md transition-colors cursor-pointer border ${
                  card.finalizado 
                    ? 'bg-green-500/20 border-green-500/30 text-green-500' 
                    : 'bg-[#ffffff05] hover:bg-[#ffffff10] border-[#ffffff0a] text-gray-400'
                }`}
                title={card.finalizado ? "Reabrir Card" : "Finalizar Card"}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEditClick?.() }}
                className="p-1.5 rounded-md bg-[#ffffff05] hover:bg-[#2BAADF]/10 transition-colors cursor-pointer border border-[#ffffff0a] hover:border-[#2BAADF]/30"
                title="Gestão do Card"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#2BAADF]" />
              </button>
            </>
          )}
          <button
            type="button"
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsExpanded(prev => !prev) }}
            className="p-1.5 rounded-md bg-[#ffffff05] hover:bg-[#ffffff10] transition-colors cursor-pointer border border-[#ffffff0a]"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-300" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-300" />}
          </button>
        </div>
      </div>

      {/* Inline badges: prazo + responsável + stage time (always visible) */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pointer-events-none">
        {prazoStatus && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${prazoStatus.cls}`}>
            <CalendarDays className="w-2.5 h-2.5" />
            {prazoStatus.label}
          </span>
        )}
        {responsavelNome && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border text-[#2BAADF] bg-[#2BAADF]/10 border-[#2BAADF]/20 max-w-[150px]">
            <span className="w-3 h-3 rounded-full bg-[#2BAADF]/20 flex items-center justify-center text-[7px] font-black shrink-0">{responsavelInitials}</span>
            <span className="truncate">{responsavelNome}</span>
          </span>
        )}
        {stageTime && !isExpanded && (
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 px-1 py-0.5">
            <Clock className="w-2.5 h-2.5" />
            {stageTime}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="mt-4 animate-fade-in-up space-y-4 cursor-default pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <User className="w-3 h-3" /> Responsável:
              </p>
              <p className="text-[13px] text-[#2BAADF] font-bold">{responsavelNome || 'Não definido'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Cliente:</p>
              <p className="text-[13px] text-gray-200 truncate">{card.cliente_nome || 'Não informado'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {card.lead_id && (
              <a href={`/cockpit/crm/leads/${card.lead_id}/editar`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ color: stageColor, backgroundColor: `${stageColor}1A` }}>
                <User className="w-3.5 h-3.5" />Perfil Lead
              </a>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChatClick?.() }}
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:text-white bg-orange-500/10 hover:bg-orange-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />Chat Interno
            </button>
            {card.conversa_id && (
              <a
                href={buildOmniChatUrl(card.conversa_id, card.id)}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  navigateToOmniChat(card.conversa_id!, card.id)
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-green-500 hover:text-white bg-green-500/10 hover:bg-green-500/20 px-2.5 py-1.5 rounded-lg transition-colors">
                <MessageCircle className="w-3.5 h-3.5" />WhatsApp
              </a>
            )}
          </div>

          <div className="pt-3 border-t border-[#ffffff0a] space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Valor Estimado</p>
              <span className="text-sm font-bold bg-[#ffffff05] px-2 py-1 rounded" style={{ color: stageColor }}>{formattedValue}</span>
            </div>

            {/* Stage Time Detail */}
            {stageTime && (
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                <Clock className="w-3 h-3" />
                <span>{stageTime}</span>
              </div>
            )}

            {card.observacao && (
              <div className="mt-3 bg-[#ffffff02] border gap-2 border-[#ffffff0a] p-3 rounded-xl shadow-inner">
                <p className="text-[10px] text-gray-500 font-bold mb-1 uppercase tracking-wider flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stageColor }}></span> Anotações
                </p>
                <p className="text-[11px] text-gray-300 leading-relaxed max-h-[80px] overflow-y-auto kanban-scroll pr-1">{card.observacao}</p>
              </div>
            )}

            {card.descricao && !card.observacao && (
              <div className="mt-3 bg-[#ffffff02] border gap-2 border-[#ffffff0a] p-3 rounded-xl shadow-inner">
                <p className="text-[10px] text-gray-500 font-bold mb-1 uppercase tracking-wider flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stageColor }}></span> Descrição
                </p>
                <p className="text-[11px] text-gray-300 leading-relaxed max-h-[80px] overflow-y-auto kanban-scroll pr-1">{card.descricao}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
