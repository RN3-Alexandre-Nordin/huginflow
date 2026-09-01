import type { SupabaseClient } from '@supabase/supabase-js'

export type CardMatchResult = {
  cardId: string
  matchReason: string
}

function readCardCategoria(metadados: unknown): string | null {
  if (!metadados || typeof metadados !== 'object') return null
  const m = metadados as Record<string, unknown>
  if (typeof m.categoria === 'string' && m.categoria) return m.categoria
  const triage = m.triage as { categoria?: string } | undefined
  return triage?.categoria ?? null
}

/**
 * Match estrito: card aberto do lead com a mesma categoria classificada.
 * Prioriza card da conversa atual quando a categoria também bate.
 */
export class CardDocumentMatcher {
  static async findMatchingCard(
    supabase: SupabaseClient,
    input: {
      empresaId: string
      leadId: string
      sessaoId: string
      categoria: string
    },
  ): Promise<CardMatchResult | null> {
    const { empresaId, leadId, sessaoId, categoria } = input

    const { data: cards, error } = await supabase
      .from('crm_cards')
      .select('id, conversa_id, metadados, titulo')
      .eq('empresa_id', empresaId)
      .eq('lead_id', leadId)
      .eq('finalizado', false)
      .order('updated_at', { ascending: false })

    if (error || !cards?.length) return null

    const matching = cards.filter((c) => readCardCategoria(c.metadados) === categoria)
    if (matching.length === 0) return null

    const sameSession = matching.find((c) => c.conversa_id === sessaoId)
    if (sameSession) {
      return {
        cardId: sameSession.id,
        matchReason: `Card da sessão com categoria ${categoria}`,
      }
    }

    return {
      cardId: matching[0].id,
      matchReason: `Card aberto com categoria ${categoria}`,
    }
  }
}
