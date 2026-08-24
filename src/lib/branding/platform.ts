/**
 * Marca da plataforma (user-facing).
 * Domínio/URLs de produção NÃO são alterados aqui — cutover em fase separada.
 */
export const PLATFORM_NAME = 'Hugin Flow'

/** Compacto (logo wordmark / URLs de produto quando necessário) */
export const PLATFORM_NAME_COMPACT = 'HuginFlow'

export const PLATFORM_TAGLINE = 'Workflows inteligentes, pessoas no comando'

export const PLATFORM_META_TITLE = `${PLATFORM_NAME} — ${PLATFORM_TAGLINE}`

export const PLATFORM_META_DESCRIPTION =
  'Orquestre vendas, atendimento, logística e processos internos com workflows inteligentes. A Hugin Flow conecta pessoas, regras e sistemas — com aprovação humana quando importa.'

/** Sufixo padrão para metadata de páginas do cockpit */
export function pageTitle(section: string, opts?: { crm?: boolean }): string {
  if (opts?.crm) return `${section} | ${PLATFORM_NAME} CRM`
  return `${section} | ${PLATFORM_NAME}`
}
