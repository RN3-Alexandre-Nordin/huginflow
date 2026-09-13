'use client'

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from 'lucide-react'

export type SearchableOption = {
  value: string
  label: string
  /** Texto extra para busca (ex.: código + nome). Default = label. */
  searchText?: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  placeholder?: string
  emptyLabel?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
  /** Máximo de itens renderizados na lista (filtro continua em todos). */
  maxVisible?: number
}

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const DEFAULT_MAX_VISIBLE = 80

/**
 * Combobox com filtro por contém (monta a lista a cada tecla).
 * Portal fixo evita corte por overflow de tabelas.
 * Performance: filtro em memória é barato até milhares de opções;
 * a UI limita quantos itens desenha (maxVisible).
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Buscar…',
  emptyLabel = 'Nenhum resultado',
  disabled,
  className = '',
  inputClassName = 'w-full bg-[#0d1218] border border-[#ffffff10] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-[#2BAADF]/50',
  maxVisible = DEFAULT_MAX_VISIBLE,
}: Props) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const selected = options.find((o) => o.value === value)

  // Pré-normaliza uma vez — digitar só faz includes em string pronta
  const indexed = useMemo(
    () =>
      options.map((o) => ({
        ...o,
        needle: normalize(o.searchText || o.label),
      })),
    [options],
  )

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return indexed
    return indexed.filter((o) => o.needle.includes(q))
  }, [indexed, query])

  const visible = filtered.slice(0, maxVisible)
  const hiddenCount = filtered.length - visible.length

  function updateCoords() {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setCoords({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 260),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updateCoords()
    const onScrollOrResize = () => updateCoords()
    window.addEventListener('resize', onScrollOrResize)
    // capture: tabelas/containers com scroll também reposicionam
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open, query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      const list = document.getElementById(listboxId)
      if (list?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, listboxId])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  function openPanel() {
    if (disabled) return
    setOpen(true)
    setQuery('')
    requestAnimationFrame(() => {
      updateCoords()
      inputRef.current?.focus()
    })
  }

  function pick(next: string) {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  function clear() {
    onChange('')
    setQuery('')
    setOpen(true)
    requestAnimationFrame(() => {
      updateCoords()
      inputRef.current?.focus()
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, Math.max(visible.length - 1, 0)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const opt = visible[highlight]
      if (opt) pick(opt.value)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  const list =
    open && mounted
      ? createPortal(
          <ul
            id={listboxId}
            role="listbox"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              zIndex: 9999,
            }}
            className="max-h-56 overflow-auto rounded-xl border border-[#ffffff15] bg-[#0A0A0A] py-1 shadow-2xl shadow-black/60"
          >
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-500">{emptyLabel}</li>
            ) : (
              <>
                {visible.map((opt, idx) => (
                  <li key={opt.value} role="option" aria-selected={opt.value === value}>
                    <button
                      type="button"
                      className={`flex w-full px-3 py-2 text-left text-xs transition-colors ${
                        idx === highlight
                          ? 'bg-[#2BAADF]/20 text-white'
                          : opt.value === value
                            ? 'bg-[#ffffff08] text-white'
                            : 'text-gray-300 hover:bg-[#ffffff08] hover:text-white'
                      }`}
                      onMouseEnter={() => setHighlight(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pick(opt.value)
                      }}
                    >
                      <span className="truncate">{opt.label}</span>
                    </button>
                  </li>
                ))}
                {hiddenCount > 0 && (
                  <li className="border-t border-[#ffffff08] px-3 py-1.5 text-[10px] text-gray-500">
                    +{hiddenCount} outros — refine a busca
                  </li>
                )}
              </>
            )}
          </ul>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={openPanel}
          className={`relative ${inputClassName} flex items-center gap-1 text-left disabled:opacity-50`}
        >
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-gray-500" />
          <span className={`flex-1 truncate pl-5 pr-5 ${selected ? 'text-white' : 'text-gray-500'}`}>
            {selected?.label || placeholder}
          </span>
          <ChevronDown className="absolute right-2 h-3.5 w-3.5 text-gray-500" />
        </button>
      ) : (
        <>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-autocomplete="list"
            disabled={disabled}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={selected ? selected.label : placeholder}
            className={inputClassName}
            autoComplete="off"
          />
          {(value || query) && (
            <button
              type="button"
              tabIndex={-1}
              onClick={clear}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded p-0.5 text-gray-500 hover:text-white"
              aria-label="Limpar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
      {list}
    </div>
  )
}
