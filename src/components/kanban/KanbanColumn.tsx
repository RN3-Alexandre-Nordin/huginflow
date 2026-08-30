'use client'

import React, { useMemo } from 'react'
import { SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import KanbanItem from './KanbanItem'

interface ColumnData {
  id: string
  nome: string
  cor: string
}

interface CardData {
  id: string
  titulo: string
  cliente_nome: string | null
  valor: number
  descricao: string | null
  stage_id: string
}

interface KanbanColumnProps {
  column: ColumnData
  cards: CardData[]
  onCardEditClick?: (card: any) => void
  onCardChatClick?: (card: any) => void
  canMove?: boolean
  canEdit?: boolean
  canViewAttachments?: boolean
  canAddAttachments?: boolean
  canDeleteAttachments?: boolean
}

export default function KanbanColumn({ 
  column, 
  cards, 
  onCardEditClick,
  onCardChatClick,
  canMove = true,
  canEdit = true,
  canViewAttachments = true,
  canAddAttachments = true,
  canDeleteAttachments = true
}: KanbanColumnProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    disabled: !canEdit, // Only if can edit the pipeline
    data: {
      type: "Column",
      column,
    },
  })

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  }

  // We extract ids directly to pass to SortableContext
  const cardIds = useMemo(() => cards.map(c => c.id), [cards])

  if (isDragging) {
    return (
      <div 
        ref={setNodeRef} 
        style={style} 
        className="flex-shrink-0 w-80 h-[500px] bg-[#111111] opacity-50 border-2 border-[#2BAADF] border-dashed rounded-2xl flex flex-col gap-4 overflow-hidden" 
      />
    )
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="flex-shrink-0 w-80 flex flex-col h-full overflow-hidden bg-[#0A0A0A] border border-[#ffffff0a] rounded-2xl relative"
    >
      {/* Column Header */}
      <div 
        {...attributes} 
        {...listeners} 
        className="flex items-center justify-between p-4 cursor-grab active:cursor-grabbing border-b border-[#ffffff05] bg-[#ffffff02]"
      >
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.cor || '#2BAADF' }} />
          <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">{column.nome}</h3>
        </div>
        <div className="text-xs font-bold text-gray-500 bg-[#ffffff0a] px-2 py-0.5 rounded-full">
          {cards.length}
        </div>
      </div>

      {/* Column Cards Container */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-[150px] relative kanban-scroll">
        <SortableContext items={cardIds}>
          {cards.map(card => (
            <div key={card.id}>
              <KanbanItem 
                card={card} 
                stageColor={column.cor || '#2BAADF'} 
                onEditClick={() => onCardEditClick?.(card)}
                onChatClick={() => onCardChatClick?.(card)}
                canMove={canMove}
                canEdit={canEdit}
                canViewAttachments={canViewAttachments}
                canAddAttachments={canAddAttachments}
                canDeleteAttachments={canDeleteAttachments}
              />
            </div>
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
