'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronUp, KeyRound } from 'lucide-react'

interface CockpitUserMenuProps {
  userName: string
  userEmail: string
  userInitials: string
}

export default function CockpitUserMenu({ userName, userEmail, userInitials }: CockpitUserMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-[#ffffff03] border border-[#ffffff05] hover:bg-[#ffffff08] transition-all text-left group"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-orange-500/10 group-hover:scale-105 transition-transform shrink-0">
          {userInitials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate leading-tight group-hover:text-orange-500 transition-colors">
            {userName}
          </p>
          <p className="text-[10px] text-gray-500 truncate font-medium mt-0.5">{userEmail}</p>
        </div>
        <ChevronUp
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 py-1.5 rounded-xl border border-[#ffffff10] bg-[#141414] shadow-xl shadow-black/40 animate-in fade-in slide-in-from-bottom-2 duration-200 z-50"
        >
          <Link
            href="/cockpit/minha-conta/senha"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-[#ffffff08] transition-colors mx-1.5 rounded-lg"
          >
            <KeyRound className="w-4 h-4 text-[#2BAADF]" />
            Alterar senha
          </Link>
        </div>
      )}
    </div>
  )
}
