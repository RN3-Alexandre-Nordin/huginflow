'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Warehouse,
  Settings2,
  ArrowDownToLine,
  ArrowUpRight,
  ArrowLeftRight,
  SlidersHorizontal,
  Truck,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'

const TABS: Array<{
  href: string
  label: string
  icon: LucideIcon
  match: (p: string) => boolean
  activeIconClass?: string
}> = [
  {
    href: '/cockpit/estoque/locais',
    label: 'Locais',
    icon: Warehouse,
    match: (p) => p.startsWith('/cockpit/estoque/locais'),
  },
  {
    href: '/cockpit/estoque/configuracao',
    label: 'Configuração',
    icon: Settings2,
    match: (p) => p.startsWith('/cockpit/estoque/configuracao'),
  },
  {
    href: '/cockpit/estoque/entradas',
    label: 'Entradas',
    icon: ArrowDownToLine,
    match: (p) => p.startsWith('/cockpit/estoque/entradas'),
    activeIconClass: 'text-emerald-400',
  },
  {
    href: '/cockpit/estoque/retiradas',
    label: 'Retiradas',
    icon: ArrowUpRight,
    match: (p) => p.startsWith('/cockpit/estoque/retiradas'),
    activeIconClass: 'text-red-400',
  },
  {
    href: '/cockpit/estoque/transferencias',
    label: 'Transferências',
    icon: ArrowLeftRight,
    match: (p) => p.startsWith('/cockpit/estoque/transferencias'),
  },
  {
    href: '/cockpit/estoque/ajustes',
    label: 'Ajustes',
    icon: SlidersHorizontal,
    match: (p) => p.startsWith('/cockpit/estoque/ajustes'),
  },
  {
    href: '/cockpit/estoque/remessas',
    label: 'Remessas',
    icon: Truck,
    match: (p) => p.startsWith('/cockpit/estoque/remessas'),
    activeIconClass: 'text-purple-400',
  },
  {
    href: '/cockpit/estoque/requisicoes',
    label: 'Requisições',
    icon: ClipboardList,
    match: (p) => p.startsWith('/cockpit/estoque/requisicoes'),
  },
]

export default function EstoqueAreaNav() {
  const pathname = usePathname()

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-[#ffffff0a] bg-[#0A0A0A]/80 p-1">
      {TABS.map((tab) => {
        const isCurrent = tab.match(pathname)
        const Icon = tab.icon

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${
              isCurrent
                ? 'bg-[#2BAADF]/15 text-[#2BAADF] border border-[#2BAADF]/30'
                : 'text-gray-400 border border-transparent hover:text-gray-200 hover:bg-[#ffffff06]'
            }`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${
                isCurrent && tab.activeIconClass ? tab.activeIconClass : ''
              }`}
            />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
