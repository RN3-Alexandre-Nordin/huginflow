type RouterLike = {
  back: () => void
  push: (href: string) => void
}

/** Aceita apenas paths internos relativos (ex.: /cockpit/crm/funis/...). */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  return trimmed
}

export function readReturnToFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return sanitizeReturnTo(new URLSearchParams(window.location.search).get('returnTo'))
}

function canGoBackInApp(): boolean {
  if (typeof window === 'undefined') return false

  const state = window.history.state as { idx?: number } | null
  if (typeof state?.idx === 'number') {
    return state.idx > 0
  }

  return window.history.length > 1
}

export function goBack(router: RouterLike, fallbackHref: string) {
  const returnTo = readReturnToFromLocation()
  if (returnTo) {
    router.push(returnTo)
    return
  }

  if (typeof window === 'undefined') {
    router.push(fallbackHref)
    return
  }

  if (!canGoBackInApp()) {
    router.push(fallbackHref)
    return
  }

  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  router.back()

  window.setTimeout(() => {
    const stillHere =
      `${window.location.pathname}${window.location.search}${window.location.hash}` === currentPath
    if (stillHere) {
      router.push(fallbackHref)
    }
  }, 400)
}
