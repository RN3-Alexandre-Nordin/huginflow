'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'

export type CockpitPageChrome = {
  title: string | null
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | null
  iconClassName: string | null
}

type CockpitPageTitleContextValue = {
  chrome: CockpitPageChrome
  setChrome: (chrome: Partial<CockpitPageChrome> | null) => void
}

const EMPTY: CockpitPageChrome = {
  title: null,
  icon: null,
  iconClassName: null,
}

const CockpitPageTitleContext = createContext<CockpitPageTitleContextValue | null>(null)

export function CockpitPageTitleProvider({ children }: { children: ReactNode }) {
  const [chrome, setChromeState] = useState<CockpitPageChrome>(EMPTY)

  const setChrome = useCallback((next: Partial<CockpitPageChrome> | null) => {
    if (next == null) {
      setChromeState(EMPTY)
      return
    }
    setChromeState({
      title: next.title ?? null,
      icon: next.icon ?? null,
      iconClassName: next.iconClassName ?? null,
    })
  }, [])

  const value = useMemo(() => ({ chrome, setChrome }), [chrome, setChrome])

  return (
    <CockpitPageTitleContext.Provider value={value}>{children}</CockpitPageTitleContext.Provider>
  )
}

/** Define título/ícone/cor da barra superior enquanto o componente estiver montado. */
export function useCockpitPageTitle(
  title: string | null,
  opts?: {
    icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | null
    iconClassName?: string | null
  },
) {
  const ctx = useContext(CockpitPageTitleContext)
  const setChrome = ctx?.setChrome
  const icon = opts?.icon ?? null
  const iconClassName = opts?.iconClassName ?? null

  useEffect(() => {
    if (!setChrome) return
    setChrome({ title, icon, iconClassName })
    return () => setChrome(null)
  }, [setChrome, title, icon, iconClassName])
}

export function useCockpitPageChrome() {
  return useContext(CockpitPageTitleContext)?.chrome ?? EMPTY
}
