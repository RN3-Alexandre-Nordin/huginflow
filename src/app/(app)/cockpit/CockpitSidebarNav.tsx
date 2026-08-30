"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  LayoutDashboard,
  Inbox,
  MessageSquare,
  Building2,
  Wallet,
  FileText,
  BookOpen,
  Target,
  Columns,
  Users,
  ShieldCheck,
  Share2,
  ChevronDown,
  Settings2,
  FolderOpen,
  type LucideIcon,
} from "lucide-react"

type NavItem = { name: string; href: string; icon: LucideIcon; rn3Only?: boolean; adminOnly?: boolean }

type NavSection = {
  id: string
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const topLevel: NavItem[] = [
  { name: "Cockpit", href: "/cockpit", icon: LayoutDashboard },
  { name: "Base de Leads", href: "/cockpit/crm/leads", icon: Inbox },
  { name: "Chat Omnichannel", href: "/cockpit/crm/chat", icon: MessageSquare },
]

const sections: NavSection[] = [
  {
    id: "administracao",
    label: "Administração",
    icon: Settings2,
    items: [
      { name: "Empresas", href: "/cockpit/empresas", icon: Building2 },
      { name: "Financeiro", href: "/cockpit/financeiro", icon: Wallet, rn3Only: true },
      { name: "Contratos", href: "/cockpit/financeiro/contratos", icon: FileText, rn3Only: true },
      { name: "Simulador de Chat", href: "/cockpit/crm/simulador", icon: MessageSquare, adminOnly: true },
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    icon: FolderOpen,
    items: [
      { name: "Base de Conhecimento", href: "/cockpit/crm/conhecimento", icon: BookOpen },
      { name: "Departamentos", href: "/cockpit/departamentos", icon: Target },
      { name: "Funis", href: "/cockpit/crm/funis", icon: Columns },
      { name: "Usuários", href: "/cockpit/usuarios", icon: Users },
      { name: "Grupos de Acesso", href: "/cockpit/grupos", icon: ShieldCheck },
      { name: "Canais Inbound", href: "/cockpit/configuracoes/canais", icon: Share2 },
    ],
  },
]

function isActivePath(pathname: string, href: string, siblingHrefs: string[] = []) {
  if (href === "/cockpit") return pathname === "/cockpit"
  const matches = pathname === href || pathname.startsWith(href + "/")
  if (!matches) return false
  const hasMoreSpecificMatch = siblingHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(href + "/") &&
      (pathname === other || pathname.startsWith(other + "/"))
  )
  return !hasMoreSpecificMatch
}

function sectionHasActive(pathname: string, items: NavItem[]) {
  return items.some((item) => isActivePath(pathname, item.href))
}

function NavLink({
  item,
  pathname,
  nested,
  siblingHrefs,
}: {
  item: NavItem
  pathname: string
  nested?: boolean
  siblingHrefs?: string[]
}) {
  const active = isActivePath(pathname, item.href, siblingHrefs)
  return (
    <Link
      href={item.href}
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

function filterNavItems(items: NavItem[], isSuperAdmin: boolean, isAdminOrSuperAdmin: boolean) {
  return items.filter((item) => {
    if (item.rn3Only && !isSuperAdmin) return false
    if (item.adminOnly && !isAdminOrSuperAdmin) return false
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
}: {
  section: NavSection
  pathname: string
  open: boolean
  onToggle: () => void
  isSuperAdmin: boolean
  isAdminOrSuperAdmin: boolean
}) {
  const visibleItems = filterNavItems(section.items, isSuperAdmin, isAdminOrSuperAdmin)
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
  disabled = false,
}: {
  isSuperAdmin: boolean
  isAdminOrSuperAdmin: boolean
  disabled?: boolean
}) {
  const pathname = usePathname()
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    administracao: true,
    cadastros: true,
  })

  useEffect(() => {
    setOpenSections((prev) => ({
      ...prev,
      administracao:
        prev.administracao ||
        sectionHasActive(pathname, filterNavItems(sections[0].items, isSuperAdmin, isAdminOrSuperAdmin)),
      cadastros:
        prev.cadastros ||
        sectionHasActive(pathname, filterNavItems(sections[1].items, isSuperAdmin, isAdminOrSuperAdmin)),
    }))
  }, [pathname, isSuperAdmin, isAdminOrSuperAdmin])

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
      <div className="space-y-0.5 pb-2 border-b border-[#ffffff06] mb-2">
        {topLevel.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>

      {sections.map((section) => (
        <NavSectionBlock
          key={section.id}
          section={section}
          pathname={pathname}
          open={!!openSections[section.id]}
          onToggle={() => toggle(section.id)}
          isSuperAdmin={isSuperAdmin}
          isAdminOrSuperAdmin={isAdminOrSuperAdmin}
        />
      ))}
    </nav>
  )
}
