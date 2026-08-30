'use client'

import React, { useState, useMemo, useTransition } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'

import KanbanColumn from './KanbanColumn'
import KanbanItem from './KanbanItem'
import { updateCardStage } from '@/app/(app)/cockpit/crm/actions'
import CardDetailsModal from './CardDetailsModal'
import KanbanNewCardModal from './KanbanNewCardModal'

interface Stage {
  id: string
  nome: string
  ordem: number
  cor: string
}

interface Card {
  id: string
  titulo: string
  cliente_nome: string | null
  valor: number
  descricao: string | null
  stage_id: string
  ordem: number
  data_prazo?: string | null
  stage_entered_at?: string | null
  responsavel_id?: string | null
  responsavel?: { nome_completo: string } | null
}

interface Usuario {
  id: string
  nome_completo: string
}

interface KanbanBoardProps {
  pipelineId: string
  initialStages: Stage[]
  initialCards: Card[]
  usuarios: Usuario[]
  canEdit?: boolean
  canDelete?: boolean
  canMove?: boolean
  canViewAttachments?: boolean
  canAddAttachments?: boolean
  canDeleteAttachments?: boolean
}

export default function KanbanBoard({ 
  pipelineId, 
  initialStages, 
  initialCards, 
  usuarios,
  canEdit = true,
  canDelete = true,
  canMove = true,
  canViewAttachments = true,
  canAddAttachments = true,
  canDeleteAttachments = true
}: KanbanBoardProps) {
  const [stages, setStages] = useState<Stage[]>(initialStages)
  const [cards, setCards] = useState<Card[]>(initialCards)

  React.useEffect(() => {
    setStages(initialStages)
    setCards(initialCards)
  }, [initialStages, initialCards])

  // Deep Linking from URL (?cardId=...)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const cardIdParam = params.get('cardId')
    
    if (cardIdParam && cards.length > 0) {
      const card = cards.find(c => c.id === cardIdParam)
      if (card) {
        setInspectedCard(card)
      }
    }
  }, [cards])

  // Deep Linking from Custom Events
  React.useEffect(() => {
    const handleOpenCard = (e: any) => {
      const { cardId, tab } = e.detail
      const card = cards.find(c => c.id === cardId)
      if (card) {
        setInitialModalTab(tab || 'resumo')
        setInspectedCard(card)
      }
    }

    window.addEventListener('open-card-modal', handleOpenCard)
    return () => window.removeEventListener('open-card-modal', handleOpenCard)
  }, [cards])

  const [activeColumn, setActiveColumn] = useState<Stage | null>(null)
  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [inspectedCard, setInspectedCard] = useState<Card | null>(null)
  const [initialModalTab, setInitialModalTab] = useState<'resumo' | 'chat'>('resumo')
  const [showNewCardModal, setShowNewCardModal] = useState(false)
  const [isPending, startTransition] = useTransition()

  function openCardModal(card: Card, opts?: { tab?: 'resumo' | 'chat' }) {
    setInitialModalTab(opts?.tab ?? 'resumo')
    setInspectedCard(card)
  }

  function closeCardModal() {
    setInspectedCard(null)
    setInitialModalTab('resumo')
  }

  const columnsId = useMemo(() => stages.map((col) => col.id), [stages])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function onDragStart(event: DragStartEvent) {
    const activeData = event.active.data.current
    if (!activeData) return

    const isColumn = activeData.type === "Column"
    const isCard = activeData.type === "Card"

    // Colunas: apenas se pode editar o Funil (canEdit do pipeline/funis)
    if (isColumn && !canEdit) return
    
    // Cards: apenas se tem permissão de mover
    if (isCard && !canMove) return

    if (isColumn) {
      setActiveColumn(activeData.column)
      return
    }
    if (isCard) {
      setActiveCard(activeData.card)
      return
    }
  }

  function onDragOver(event: DragOverEvent) {
    const activeData = event.active.data.current
    const { active, over } = event
    if (!over || !activeData) return

    const isCard = activeData.type === "Card"
    if (isCard && !canMove) return
    if (!isCard && !canEdit) return

    const activeId = active.id
    const overId = over.id

    if (activeId === overId) return

    const isActiveACard = active.data.current?.type === "Card"
    const isOverACard = over.data.current?.type === "Card"
    const isOverAColumn = over.data.current?.type === "Column"

    if (!isActiveACard) return

    if (isActiveACard && isOverACard) {
      setCards((cardsState) => {
        const activeIndex = cardsState.findIndex((c) => c.id === activeId)
        const overIndex = cardsState.findIndex((c) => c.id === overId)
        const activeCardObj = cardsState[activeIndex]
        const overCardObj = cardsState[overIndex]
        if (activeCardObj.stage_id !== overCardObj.stage_id) {
          activeCardObj.stage_id = overCardObj.stage_id
          return arrayMove(cardsState, activeIndex, overIndex)
        }
        return arrayMove(cardsState, activeIndex, overIndex)
      })
    }

    if (isActiveACard && isOverAColumn) {
      setCards((cardsState) => {
        const activeIndex = cardsState.findIndex((c) => c.id === activeId)
        cardsState[activeIndex].stage_id = overId.toString()
        return arrayMove(cardsState, activeIndex, activeIndex)
      })
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null)
    setActiveCard(null)

    const isColumn = event.active.data.current?.type === "Column"
    const isCard = event.active.data.current?.type === "Card"

    if (isColumn && !canEdit) return
    if (isCard && !canMove) return

    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    if (isColumn) {
      setStages((stagesState) => {
        const activeColumnIndex = stagesState.findIndex((col) => col.id === activeId)
        const overColumnIndex = stagesState.findIndex((col) => col.id === overId)
        return arrayMove(stagesState, activeColumnIndex, overColumnIndex)
      })
      return
    }

    if (isCard) {
      const activeCardTarget = cards.find(c => c.id === activeId)
      if (activeCardTarget) {
        startTransition(() => {
          updateCardStage(activeId.toString(), pipelineId, activeCardTarget.stage_id)
        })
      }
    }
  }

  return (
    <>
      <div className="flex h-full w-full overflow-x-auto min-w-full pb-8 kanban-scroll relative">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4 px-2 items-start h-full min-w-max">
            <SortableContext items={columnsId}>
              {stages.map((col, idx) => (
                <div key={col.id} className="flex gap-4 items-center">
                  <KanbanColumn
                    column={col}
                    cards={cards.filter((c) => c.stage_id === col.id)}
                    onCardEditClick={(card: any) => openCardModal(card)}
                    onCardChatClick={(card: any) => openCardModal(card, { tab: 'chat' })}
                    canMove={canMove}
                    canEdit={canEdit}
                    canViewAttachments={canViewAttachments}
                    canAddAttachments={canAddAttachments}
                    canDeleteAttachments={canDeleteAttachments}
                  />
                  {idx < stages.length - 1 && (
                    <div className="text-gray-600 font-bold opacity-30 select-none">❯</div>
                  )}
                </div>
              ))}
            </SortableContext>
          </div>

          <DragOverlay>
            {activeColumn && (
              <KanbanColumn
                column={activeColumn}
                cards={cards.filter((c) => c.stage_id === activeColumn.id)}
                canMove={canMove}
                canEdit={canEdit}
                canViewAttachments={canViewAttachments}
                canAddAttachments={canAddAttachments}
                canDeleteAttachments={canDeleteAttachments}
              />
            )}
            {activeCard && (
              <KanbanItem 
                card={activeCard} 
                isOverlay 
                canMove={canMove}
                canEdit={canEdit}
                canViewAttachments={canViewAttachments}
                canAddAttachments={canAddAttachments}
                canDeleteAttachments={canDeleteAttachments}
              />
            )}
          </DragOverlay>
        </DndContext>

        {inspectedCard && (
          <CardDetailsModal
            card={inspectedCard as any}
            currentPipelineId={pipelineId}
            usuarios={usuarios}
            onClose={closeCardModal}
            initialTab={initialModalTab}
            canEdit={canEdit}
            canDelete={canDelete}
            canViewAttachments={canViewAttachments}
            canAddAttachments={canAddAttachments}
            canDeleteAttachments={canDeleteAttachments}
          />
        )}
      </div>

      {showNewCardModal && (
        <KanbanNewCardModal
          pipelineId={pipelineId}
          stages={stages}
          usuarios={usuarios}
          onClose={() => setShowNewCardModal(false)}
        />
      )}

      {/* Floating button to trigger new card — the page header button dispatches this event */}
      <button
        id="kanban-new-card-trigger"
        className="hidden"
        onClick={() => setShowNewCardModal(true)}
        aria-label="Novo Card"
      />
    </>
  )
}
