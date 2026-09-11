'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeftRight, Link2, Package } from 'lucide-react'

const TABS = [
  { href: '/cockpit/cadastros/skus', label: 'Catálogo', icon: Package, match: (p: string) => p.startsWith('/cockpit/cadastros/skus') },
  {
    href: '/cockpit/cadastros/conversoes-um',
    label: 'Conversões UM',
    icon: ArrowLeftRight,
    match: (p: string) => p.startsWith('/cockpit/cadastros/conversoes-um'),
  },
  {
    href: '/cockpit/cadastros/sku-depara',
    label: 'De-para',
    icon: Link2,
    match: (p: string) => p.startsWith('/cockpit/cadastros/sku-depara'),
  },
] as const

export default function SkuAreaNav() {
  const pathname = usePathname()

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-[#ffffff0a] bg-[#0A0A0A]/80 p-1">
      {TABS.map((tab) => {
        const active = tab.match(pathname)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${
              active
                ? 'bg-[#2BAADF]/15 text-[#2BAADF] border border-[#2BAADF]/30'
                : 'text-gray-500 border border-transparent hover:text-gray-300 hover:bg-[#ffffff06]'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
