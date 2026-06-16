"use client"

import { useState, useRef, useEffect, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Building2, Check, ChevronsUpDown, Search, X } from "lucide-react"

const ALL_VALUE = "__all__"

interface EmpresaOption {
  id: string
  nome: string
}

interface Props {
  empresas: EmpresaOption[]
  value?: string
  /** Nome do campo hidden para uso em formulários GET */
  name?: string
  /** Atualiza ?empresa= na URL ao selecionar (padrão quando não há name/onChange) */
  syncToUrl?: boolean
  onChange?: (empresaId: string) => void
  placeholder?: string
  className?: string
}

export default function EmpresaSearchSelect({
  empresas,
  value = "",
  name,
  syncToUrl,
  onChange,
  placeholder = "Todas as empresas",
  className = "",
}: Props) {
  const shouldSyncToUrl = syncToUrl ?? (!name && !onChange)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selected, setSelected] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelected(value)
  }, [value])

  const options: EmpresaOption[] = [
    { id: ALL_VALUE, nome: "Todas as empresas" },
    ...empresas,
  ]

  const selectedOption = options.find((opt) => opt.id === (selected || ALL_VALUE))

  const filteredOptions = options.filter((opt) =>
    opt.nome.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const applySelection = (rawId: string) => {
    const empresaId = rawId === ALL_VALUE ? "" : rawId
    setSelected(empresaId)
    setIsOpen(false)
    setSearchQuery("")

    if (onChange) {
      onChange(empresaId)
      return
    }

    if (shouldSyncToUrl) {
      const params = new URLSearchParams(searchParams.toString())
      if (empresaId) {
        params.set("empresa", empresaId)
      } else {
        params.delete("empresa")
      }
      startTransition(() => {
        const qs = params.toString()
        router.push(qs ? `${pathname}?${qs}` : pathname)
      })
    }
  }

  return (
    <div className={`relative w-full ${isPending ? "opacity-70 pointer-events-none" : ""} ${className}`} ref={containerRef}>
      {name && <input type="hidden" name={name} value={selected} />}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#E8A317] rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between transition-all outline-none focus:ring-1 focus:ring-[#E8A317]/30 group cursor-pointer"
      >
        <div className="flex items-center gap-3 overflow-hidden min-w-0">
          <Building2 className="w-4 h-4 text-gray-500 shrink-0" />
          <span className={`truncate ${selected ? "text-white" : "text-gray-500"}`}>
            {selectedOption?.nome ?? placeholder}
          </span>
        </div>
        <ChevronsUpDown className="w-4 h-4 text-gray-500 shrink-0 group-hover:text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[#111111] border border-[#ffffff12] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
          <div className="p-2 border-b border-[#ffffff08] flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Digite para buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none placeholder-gray-600 py-1"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="p-1 hover:bg-[#ffffff0a] rounded text-gray-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = (selected || ALL_VALUE) === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => applySelection(opt.id)}
                    className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between gap-2 hover:bg-[#E8A317]/10 transition-colors ${
                      isSelected ? "bg-[#E8A317]/5 text-[#E8A317]" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <span className="truncate">{opt.nome}</span>
                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                )
              })
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-gray-500">Nenhuma empresa encontrada.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
