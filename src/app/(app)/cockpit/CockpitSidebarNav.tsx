'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CockpitNavPermissions } from '@/utils/cockpit-nav-permissions'
import {
  filterVisibleModules,
  isModuleNavActive,
  type CockpitModule,
} from './cockpit-nav'

export default function CockpitSidebarNav({
  isSuperAdmin,
  isAdminOrSuperAdmin,
  navPermissions = {},
  empresaAddons = null,
  disabled = false,
  onNavigate,
}: {
  isSuperAdmin: boolean
  isAdminOrSuperAdmin: boolean
  navPermissions?: CockpitNavPermissions
  empresaAddons?: Record<string, boolean> | null
  disabled?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const modules = filterVisibleModules(
    isSuperAdmin,
    isAdminOrSuperAdmin,
    navPermissions,
    empresaAddons,
  )

  if (disabled) {
    return (
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="rounded-xl border border-[#2BAADF]/20 bg-[#2BAADF]/5 px-3 py-4 text-xs leading-relaxed text-[#2BAADF]">
          Altere sua senha para liberar o menu e as demais áreas do sistema.
        </div>
      </nav>
    )
  }

  return (
    <nav className="custom-scrollbar-sidebar flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-4 md:px-3">
      {modules.map((mod) => (
        <ModuleNavLink
          key={mod.id}
          module={mod}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

function ModuleNavLink({
  module,
  pathname,
  onNavigate,
}: {
  module: CockpitModule
  pathname: string
  onNavigate?: () => void
}) {
  const active = isModuleNavActive(pathname, module)
  const { nav } = module

  // Espelha Bifrost `.nav-link-active`:
  // fundo accent suave + texto claro + barra vertical inset à esquerda.
  return (
    <Link
      href={nav.href}
      title={nav.name}
      onClick={onNavigate}
      data-testid={nav.testId ?? `nav-${module.id}`}
      className={`rounded-lg px-3 py-2.5 text-sm transition ${
        active
          ? 'bg-[rgba(43,170,223,0.1)] text-[#e8ecf4] shadow-[inset_3px_0_0_#2BAADF]'
          : 'text-[#8b95a8] hover:bg-[#ffffff08] hover:text-[#e8ecf4]'
      }`}
    >
      <span className="flex items-center gap-3">
        <nav.icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
        <span className="truncate font-medium tracking-tight">{nav.name}</span>
      </span>
    </Link>
  )
}
