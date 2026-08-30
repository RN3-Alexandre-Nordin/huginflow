type RouterLike = {
  back: () => void
  push: (href: string) => void
}

export function goBack(router: RouterLike, fallbackHref: string) {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
  } else {
    router.push(fallbackHref)
  }
}
