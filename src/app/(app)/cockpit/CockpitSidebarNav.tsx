"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import type { CockpitNavPermissions } from "@/utils/cockpit-nav-permissions"
import {
  cockpitNavSections,
  cockpitTopLevelNav,
  isActiveCockpitPath,
  type CockpitNavItem,
  type CockpitNavSection,
} from "./cockpit-nav"

function sectionHasActive(pathname: string, items: CockpitNavItem[]) {
  return items.some((item) => isActiveCockpitPath(pathname, item.href))
}

function NavLink({
  item,
  pathname,
  nested,
  siblingHrefs,
  onNavigate,
}: {
  item: CockpitNavItem
  pathname: string
  nested?: boolean
  siblingHrefs?: string[]
  onNavigate?: () => void
}) {
  const active = isActiveCockpitPath(pathname, item.href, siblingHrefs)
  const testId =
    item.href === "/cockpit"
      ? "nav-cockpit"
      : item.href === "/cockpit/crm/chat"
        ? "nav-omni"
        : item.href === "/cockpit/crm/funis"
          ? "nav-funis"
          : undefined
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-testid={testId}
      className={`flex items-center gap-3 rounded-lg text-sm font-semibold tracking-tight transition-all ${
        nested ? "px-3 py-2.5 ml-2" : "px-3 py-3"
      } ${
        active
          ? "bg-gradient-to-r from-[#2BAADF]/20 to-[#2BAADF]/5 text-[#2BAADF] border border-[#2BAADF]/25"
          : "text-gray-400 hover:text-white hover:bg-[#ffffff0a] hover:translate-x-0.5"
      }`}
    >
      <item.icon className={`flex-shrink-0 ${nested ? "w-4 h-4" : "w-5 h-5"}`} />
      <span className="truncate">{item.name}</span>
    </Link>
  )
}

function filterNavItems(
  items: CockpitNavItem[],
  isSuperAdmin: boolean,
  isAdminOrSuperAdmin: boolean,
  navPermissions: CockpitNavPermissions
) {
  return items.filter((item) => {
    if (item.rn3Only && !isSuperAdmin) return false
    if (item.adminOnly && !isAdminOrSuperAdmin) return false
    if (item.permissionModule && !navPermissions[item.permissionModule]) return false
    return true
  })
}

function NavSectionBlock({
  section,
  pathname,
  open,
  onToggle,
  isSuperAdmin,
  isAdminOrSuperAdmin,
  navPermissions,
  onNavigate,
}: {
  section: CockpitNavSection
  pathname: string
  open: boolean
  onToggle: () => void
  isSuperAdmin: boolean
  isAdminOrSuperAdmin: boolean
  navPermissions: CockpitNavPermissions
  onNavigate?: () => void
}) {
  const visibleItems = filterNavItems(section.items, isSuperAdmin, isAdminOrSuperAdmin, navPermissions)
  const hasActive = sectionHasActive(pathname, visibleItems)

  if (visibleItems.length === 0) return null

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all ${
          hasActive ? "text-white" : "text-gray-500 hover:text-gray-300 hover:bg-[#ffffff05]"
        }`}
      >
        <section.icon className="w-4 h-4 flex-shrink-0 text-[#2BAADF]/80" />
        <span className="flex-1 text-[11px] font-black uppercase tracking-widest truncate">
          {section.label}
        </span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 border-l border-[#ffffff08] ml-4 pl-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              nested
              siblingHrefs={visibleItems.map((i) => i.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function CockpitSidebarNav({
  isSuperAdmin,
  isAdminOrSuperAdmin,
  navPermissions = {},
  disabled = false,
  onNavigate,
}: {
  isSuperAdmin: boolean
  isAdminOrSuperAdmin: boolean
  navPermissions?: CockpitNavPermissions
  disabled?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    administracao: true,
    cadastros: true,
  })

  const visibleTopLevel = filterNavItems(cockpitTopLevelNav, isSuperAdmin, isAdminOrSuperAdmin, navPermissions)

  useEffect(() => {
    setOpenSections((prev) => ({
      ...prev,
      administracao:
        prev.administracao ||
        sectionHasActive(
          pathname,
          filterNavItems(cockpitNavSections[0].items, isSuperAdmin, isAdminOrSuperAdmin, navPermissions)
        ),
      cadastros:
        prev.cadastros ||
        sectionHasActive(
          pathname,
          filterNavItems(cockpitNavSections[1].items, isSuperAdmin, isAdminOrSuperAdmin, navPermissions)
        ),
    }))
  }, [pathname, isSuperAdmin, isAdminOrSuperAdmin, navPermissions])

  const toggle = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (disabled) {
    return (
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="rounded-xl border border-[#2BAADF]/20 bg-[#2BAADF]/5 px-3 py-4 text-xs text-[#2BAADF] leading-relaxed">
          Altere sua senha para liberar o menu e as demais áreas do sistema.
        </div>
      </nav>
    )
  }

  return (
    <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5 custom-scrollbar-sidebar">
      {visibleTopLevel.length > 0 && (
        <div className="space-y-0.5 pb-2 border-b border-[#ffffff06] mb-2">
          {visibleTopLevel.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              siblingHrefs={visibleTopLevel.map((i) => i.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      {cockpitNavSections.map((section) => (
        <NavSectionBlock
          key={section.id}
          section={section}
          pathname={pathname}
          open={!!openSections[section.id]}
          onToggle={() => toggle(section.id)}
          isSuperAdmin={isSuperAdmin}
          isAdminOrSuperAdmin={isAdminOrSuperAdmin}
          navPermissions={navPermissions}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}
