/**
 * Marca da plataforma (user-facing).
 * Domínio/URLs de produção NÃO são alterados aqui — cutover em fase separada.
 */
export const PLATFORM_NAME = 'HuginFlow'

export const PLATFORM_TAGLINE = 'Workflows inteligentes para o seu negócio'

export const PLATFORM_META_TITLE = `${PLATFORM_NAME} — Workflows Inteligentes`

export const PLATFORM_META_DESCRIPTION =
  'Plataforma HuginFlow de workflows, CRM e automação com IA. Acesse sua conta.'

/** Sufixo padrão para metadata de páginas do cockpit */
export function pageTitle(section: string, opts?: { crm?: boolean }): string {
  if (opts?.crm) return `${section} | ${PLATFORM_NAME} CRM`
  return `${section} | ${PLATFORM_NAME}`
}
