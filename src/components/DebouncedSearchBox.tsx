'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'

type Props = {
  initialQuery?: string
  placeholder?: string
  /** Defaults só se a chave ainda não existir na URL. */
  preserveParams?: Record<string, string | undefined>
  className?: string
  inputClassName?: string
}

/**
 * Busca com debounce na URL (?q=).
 * Parte dos searchParams atuais — não apaga visao/filtros ao digitar.
 */
export default function DebouncedSearchBox({
  initialQuery = '',
  placeholder = 'Buscar...',
  preserveParams,
  className = 'relative flex-1 max-w-md',
  inputClassName = 'w-full rounded-lg border border-[#ffffff10] bg-[#0A0A0A] py-2 pl-10 pr-4 text-sm text-white transition-colors focus:border-[#2BAADF] focus:outline-none',
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const paramsKey = searchParams.toString()
  const preserveRef = useRef(preserveParams)
  preserveRef.current = preserveParams

  const [query, setQuery] = useState(initialQuery)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim()
      const current = (new URLSearchParams(paramsKey).get('q') || '').trim()
      if (next === current) return

      const params = new URLSearchParams(paramsKey)
      for (const [key, value] of Object.entries(preserveRef.current ?? {})) {
        if (value && !params.has(key)) params.set(key, value)
      }
      if (next) params.set('q', next)
      else params.delete('q')
      params.delete('page')

      const href = params.toString() ? `${pathname}?${params.toString()}` : pathname
      startTransition(() => {
        router.replace(href)
      })
    }, 350)

    return () => clearTimeout(timer)
  }, [query, pathname, router, paramsKey])

  return (
    <div className={className}>
      {isPending ? (
        <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#2BAADF]" />
      ) : (
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
    </div>
  )
}
