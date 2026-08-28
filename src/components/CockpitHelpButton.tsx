'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BookOpen, GraduationCap, HelpCircle } from 'lucide-react'

const HELP_ITEMS = [
  {
    href: '/cockpit/ajuda',
    label: 'Manual completo',
    description: 'Referência de todas as funções do Cockpit',
    icon: BookOpen,
  },
  {
    href: '/cockpit/ajuda/treinamento',
    label: 'Treinamento do Operador',
    description: 'Guia online para operadores — WhatsApp, cards e chat interno',
    icon: GraduationCap,
  },
] as const

export default function CockpitHelpButton() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Central de ajuda"
        className={`p-2 rounded-xl border transition-all ${
          open
            ? 'text-[#2BAADF] bg-[#2BAADF]/10 border-[#2BAADF]/20'
            : 'text-gray-400 hover:text-[#2BAADF] hover:bg-[#2BAADF]/10 border-transparent hover:border-[#2BAADF]/20'
        }`}
        aria-label="Abrir menu de ajuda"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,320px)] py-2 rounded-xl border border-[#ffffff10] bg-[#141414] shadow-xl shadow-black/50 animate-in fade-in slide-in-from-top-2 duration-200 z-50"
        >
          <p className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-[#ffffff08] mb-1">
            Ajuda
          </p>
          {HELP_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-3 py-3 mx-1.5 rounded-lg text-left hover:bg-[#ffffff08] transition-colors group"
              >
                <div className="p-2 rounded-lg bg-[#2BAADF]/10 border border-[#2BAADF]/20 text-[#2BAADF] shrink-0 group-hover:scale-105 transition-transform">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-bold text-white group-hover:text-[#2BAADF] transition-colors">
                    {item.label}
                  </p>
                  <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{item.description}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
