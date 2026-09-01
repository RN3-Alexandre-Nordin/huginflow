import { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

export type KanbanCard = {
  id: string
  titulo: string
  cliente_nome: string | null
  valor: number
  descricao: string | null
  stage_id: string
  ordem: number
  data_prazo?: string | null
  stage_entered_at?: string | null
  created_at?: string | null
  responsavel_id?: string | null
  finalizado?: boolean
  responsavel?: { nome_completo: string } | null
}

type DbCardRow = Record<string, unknown> & {
  id: string
  pipeline_id?: string
  stage_id?: string
}

function mapRowToCard(row: DbCardRow, existing?: KanbanCard): KanbanCard {
  return {
    id: row.id,
    titulo: (row.titulo as string) ?? existing?.titulo ?? '',
    cliente_nome: (row.cliente_nome as string | null) ?? existing?.cliente_nome ?? null,
    valor: Number(row.valor ?? existing?.valor ?? 0),
    descricao: (row.descricao as string | null) ?? existing?.descricao ?? null,
    stage_id: (row.stage_id as string) ?? existing?.stage_id ?? '',
    ordem: Number(row.ordem ?? existing?.ordem ?? 0),
    data_prazo: (row.data_prazo as string | null | undefined) ?? existing?.data_prazo ?? null,
    stage_entered_at:
      (row.stage_entered_at as string | null | undefined) ?? existing?.stage_entered_at ?? null,
    created_at: (row.created_at as string | null | undefined) ?? existing?.created_at ?? null,
    responsavel_id:
      (row.responsavel_id as string | null | undefined) ?? existing?.responsavel_id ?? null,
    finalizado: Boolean(row.finalizado ?? existing?.finalizado ?? false),
    responsavel: existing?.responsavel ?? null,
  }
}

function shouldIncludeCard(
  row: DbCardRow,
  opts: {
    showFinalizados: boolean
    meusCardsOnly: boolean
    currentUserId?: string
  },
): boolean {
  if (row.pipeline_id == null) return true

  const finalizado = Boolean(row.finalizado)
  if (!opts.showFinalizados && finalizado) return false

  if (opts.meusCardsOnly && opts.currentUserId) {
    return row.responsavel_id === opts.currentUserId
  }

  return true
}

export function useKanbanRealtime(
  pipelineId: string,
  setCards: React.Dispatch<React.SetStateAction<KanbanCard[]>>,
  opts: {
    showFinalizados?: boolean
    meusCardsOnly?: boolean
    currentUserId?: string
    draggingCardId?: string | null
  } = {},
) {
  const { showFinalizados = false, meusCardsOnly = false, currentUserId, draggingCardId } = opts

  useEffect(() => {
    if (!pipelineId) return

    const supabase = createClient()

    const applyChange = (eventType: 'INSERT' | 'UPDATE' | 'DELETE', row: DbCardRow | null) => {
      if (!row?.id) return
      if (row.pipeline_id && row.pipeline_id !== pipelineId) return
      if (draggingCardId && draggingCardId === row.id) return

      if (eventType === 'DELETE') {
        setCards((prev) => prev.filter((c) => c.id !== row.id))
        return
      }

      if (!shouldIncludeCard(row, { showFinalizados, meusCardsOnly, currentUserId })) {
        setCards((prev) => prev.filter((c) => c.id !== row.id))
        return
      }

      setCards((prev) => {
        const idx = prev.findIndex((c) => c.id === row.id)
        if (idx === -1) {
          return [...prev, mapRowToCard(row)]
        }
        const next = [...prev]
        next[idx] = mapRowToCard(row, prev[idx])
        return next
      })
    }

    const channel = supabase
      .channel(`kanban-${pipelineId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crm_cards',
          filter: `pipeline_id=eq.${pipelineId}`,
        },
        (payload) => applyChange('INSERT', payload.new as DbCardRow),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crm_cards',
          filter: `pipeline_id=eq.${pipelineId}`,
        },
        (payload) => applyChange('UPDATE', payload.new as DbCardRow),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'crm_cards',
          filter: `pipeline_id=eq.${pipelineId}`,
        },
        (payload) => applyChange('DELETE', payload.old as DbCardRow),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [
    pipelineId,
    setCards,
    showFinalizados,
    meusCardsOnly,
    currentUserId,
    draggingCardId,
  ])
}
