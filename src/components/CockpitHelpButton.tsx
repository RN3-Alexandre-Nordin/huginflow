'use client'

import Link from 'next/link'
import { HelpCircle } from 'lucide-react'

export default function CockpitHelpButton() {
  return (
    <Link
      href="/cockpit/ajuda"
      title="Manual do usuário"
      className="p-2 rounded-xl text-gray-400 hover:text-[#2BAADF] hover:bg-[#2BAADF]/10 border border-transparent hover:border-[#2BAADF]/20 transition-all"
      aria-label="Abrir manual do usuário"
    >
      <HelpCircle className="w-5 h-5" />
    </Link>
  )
}
