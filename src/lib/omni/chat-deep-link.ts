export const OMNI_SESSAO_STORAGE_KEY = 'huginflow_omni_sessao'

export function buildOmniChatUrl(sessaoId: string, cardId?: string): string {
  const params = new URLSearchParams({ sessao: sessaoId })
  if (cardId) params.set('card', cardId)
  return `/cockpit/crm/chat?${params.toString()}`
}

export function stashOmniSessao(sessaoId: string): void {
  try {
    sessionStorage.setItem(OMNI_SESSAO_STORAGE_KEY, sessaoId)
  } catch {
    // ignore
  }
}

/** Navegação completa garante remount da página e leitura correta do ?sessao=. */
export function navigateToOmniChat(sessaoId: string, cardId?: string): void {
  stashOmniSessao(sessaoId)
  window.location.assign(buildOmniChatUrl(sessaoId, cardId))
}
