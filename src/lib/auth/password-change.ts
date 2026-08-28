export const PASSWORD_CHANGE_PATH = '/cockpit/minha-conta/senha'

export function isPasswordChangePath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  const normalized =
    segments.length > 0 && segments[0].length === 2
      ? '/' + segments.slice(1).join('/')
      : pathname

  return normalized === PASSWORD_CHANGE_PATH || normalized.startsWith(`${PASSWORD_CHANGE_PATH}/`)
}
