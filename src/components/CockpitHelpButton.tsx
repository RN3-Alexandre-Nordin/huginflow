'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { BookOpen, ChevronDown, GraduationCap, HelpCircle } from 'lucide-react'

const HELP_ITEMS = [
  {
    href: '/cockpit/ajuda',
    label: 'Manual do sistema',
    description: 'Referência completa de todas as funções do Cockpit',
    icon: BookOpen,
  },
  {
    href: '/cockpit/ajuda/treinamento',
    label: 'Treinamento do operador',
    description: 'Guia prático — WhatsApp, cards e chat interno',
    icon: GraduationCap,
  },
] as const

type MenuCoords = { top: number; right: number }

export default function CockpitHelpButton() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<MenuCoords>({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const updateCoords = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setCoords({
      top: rect.bottom + 8,
      right: Math.max(16, window.innerWidth - rect.right),
    })
  }, [])

  const openMenu = useCallback(() => {
    updateCoords()
    setOpen(true)
  }, [updateCoords])

  const closeMenu = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeMenu()
    }

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }

    const onReposition = () => updateCoords()

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, closeMenu, updateCoords])

  const menu =
    open && mounted ? (
      <div
        ref={menuRef}
        role="menu"
        style={{ top: coords.top, right: coords.right }}
        className="fixed w-[min(100vw-2rem,320px)] py-2 rounded-xl border border-[#ffffff10] bg-[#141414] shadow-xl shadow-black/50 z-[200]"
      >
        <p className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-[#ffffff08] mb-1">
          Escolha o manual
        </p>
        {HELP_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={closeMenu}
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
    ) : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        title="Central de ajuda"
        className={`inline-flex items-center gap-1 p-2 rounded-xl border transition-all ${
          open
            ? 'text-[#2BAADF] bg-[#2BAADF]/10 border-[#2BAADF]/20'
            : 'text-gray-400 hover:text-[#2BAADF] hover:bg-[#2BAADF]/10 border-transparent hover:border-[#2BAADF]/20'
        }`}
        aria-label="Abrir menu de ajuda"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <HelpCircle className="w-5 h-5" />
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {mounted && menu ? createPortal(menu, document.body) : null}
    </>
  )
}
