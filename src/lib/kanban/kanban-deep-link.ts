import { sanitizeReturnTo } from '@/lib/navigation/goBack'

export function buildCardConsultaUrl(cardId: string, returnTo?: string | null): string {
  const params = new URLSearchParams()
  const safe = sanitizeReturnTo(returnTo ?? null)
  if (safe) params.set('returnTo', safe)
  const query = params.toString()
  return `/cockpit/crm/cards/${cardId}/consulta${query ? `?${query}` : ''}`
}

export function buildKanbanCardUrl(pipelineId: string, cardId: string): string {
  const params = new URLSearchParams({ cardId })
  return `/cockpit/crm/funis/${pipelineId}?${params.toString()}`
}

export function buildNewLeadForCardUrl(pipelineId: string, cardId: string): string {
  const params = new URLSearchParams({ cardId, pipelineId })
  return `/cockpit/crm/leads/novo?${params.toString()}`
}

export function buildLeadEditUrl(
  leadId: string,
  options?: { pipelineId?: string; cardId?: string; returnTo?: string }
): string {
  const params = new URLSearchParams()
  const returnTo =
    options?.returnTo ??
    (options?.pipelineId && options?.cardId
      ? buildKanbanCardUrl(options.pipelineId, options.cardId)
      : null)

  if (returnTo) {
    params.set('returnTo', returnTo)
  }

  const query = params.toString()
  return `/cockpit/crm/leads/${leadId}/editar${query ? `?${query}` : ''}`
}
