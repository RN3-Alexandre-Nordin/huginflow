'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SKU_UNIDADES, normalizeUnidadeCodigo } from '@/lib/skus/constants'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 pr-10 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30 uppercase'

type Props = {
  name: string
  defaultValue?: string
  required?: boolean
  /** UMs já usadas na empresa (ou no registro) — entram nas sugestões sem cadastro formal. */
  extraOptions?: string[]
  placeholder?: string
  className?: string
}

/**
 * Combobox de UM: abre ao focar/clicar, filtra ao digitar e aceita código livre.
 * Valor novo fica só no SKU/conversão (texto) — sem tabela de cadastro de unidades.
 */
export default function UmCombobox({
  name,
  defaultValue = 'UN',
  required,
  extraOptions = [],
  placeholder = 'Ex.: UN, CX, FARDO…',
  className = '',
}: Props) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(normalizeUnidadeCodigo(defaultValue) || 'UN')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const options = useMemo(() => {
    return Array.from(
      new Set(
        [...extraOptions, ...SKU_UNIDADES, value]
          .map((o) => normalizeUnidadeCodigo(o))
          .filter(Boolean),
      ),
    )
  }, [extraOptions, value])

  const filtered = useMemo(() => {
    const q = value.trim()
    if (!q) return options
    return options.filter((o) => o.includes(q))
  }, [options, value])

  const isNew =
    Boolean(value) &&
    !(SKU_UNIDADES as readonly string[]).includes(value) &&
    !extraOptions.map((o) => normalizeUnidadeCodigo(o)).includes(value)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    setHighlight(0)
  }, [filtered, open])

  function apply(next: string) {
    const norm = normalizeUnidadeCodigo(next)
    setValue(norm)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Enter' && open && filtered[highlight]) {
      e.preventDefault()
      apply(filtered[highlight])
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        name={name}
        required={required}
        value={value}
        placeholder={placeholder}
        maxLength={12}
        autoComplete="off"
        className={inputCls}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setValue(normalizeUnidadeCodigo(e.target.value))
          setOpen(true)
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Abrir sugestões de unidade"
        onClick={() => setOpen((o) => !o)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:text-white"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-[#ffffff15] bg-[#0A0A0A] py-1 shadow-2xl shadow-black/50"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-500">
              {value ? (
                <>
                  Usar <span className="font-mono font-semibold text-[#2BAADF]">{value}</span> (nova
                  UM neste SKU)
                </>
              ) : (
                'Digite um código de UM'
              )}
            </li>
          ) : (
            filtered.map((u, idx) => (
              <li key={u} role="option" aria-selected={idx === highlight}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-mono transition-colors ${
                    idx === highlight
                      ? 'bg-[#2BAADF]/20 text-white'
                      : 'text-gray-300 hover:bg-[#ffffff08] hover:text-white'
                  }`}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    apply(u)
                  }}
                >
                  <span>{u}</span>
                  {u === value && (
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-[#2BAADF]">
                      atual
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
          {value && filtered.length > 0 && !filtered.includes(value) && (
            <li role="option">
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t border-[#ffffff10] px-3 py-2 text-left text-xs text-[#2BAADF] hover:bg-[#2BAADF]/10"
                onMouseDown={(e) => {
                  e.preventDefault()
                  apply(value)
                }}
              >
                Usar <span className="font-mono font-semibold">{value}</span> (nova)
              </button>
            </li>
          )}
          {isNew && filtered.includes(value) && (
            <li className="border-t border-[#ffffff08] px-3 py-1.5 text-[10px] text-gray-500">
              UM customizada — salva no SKU, sem cadastro separado
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
