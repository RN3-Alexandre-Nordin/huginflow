'use client'

import { useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

type Option = { value: string; label: string }

type Props = {
  name: string
  value?: string
  options: Option[]
  emptyLabel?: string
  /** @deprecated Mantido por compat; a URL atual é a base. */
  preserveParams?: Record<string, string | undefined>
  className?: string
}

/** Select que atualiza a query string sem apagar outros filtros (visao, q, etc.). */
export default function UrlFilterSelect({
  name,
  value = '',
  options,
  emptyLabel,
  preserveParams,
  className = 'bg-[#0d1218] border border-[#ffffff10] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#2BAADF]/50',
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value
        const params = new URLSearchParams(searchParams.toString())
        for (const [key, val] of Object.entries(preserveParams ?? {})) {
          if (val && !params.has(key)) params.set(key, val)
        }
        if (next) params.set(name, next)
        else params.delete(name)
        params.delete('page')
        const href = params.toString() ? `${pathname}?${params.toString()}` : pathname
        startTransition(() => {
          router.replace(href)
        })
      }}
      className={className}
    >
      {emptyLabel != null && <option value="">{emptyLabel}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
