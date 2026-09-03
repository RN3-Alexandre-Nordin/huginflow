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
  Settings2,
  FolderOpen,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react'

export type CockpitNavItem = {
  name: string
  href: string
  icon: LucideIcon
  rn3Only?: boolean
  adminOnly?: boolean
  /** Se definido, o item só aparece quando `navPermissions[permissionModule]` for true. */
  permissionModule?: string
}

export type CockpitNavSection = {
  id: string
  label: string
  icon: LucideIcon
  items: CockpitNavItem[]
}

export const cockpitTopLevelNav: CockpitNavItem[] = [
  { name: 'Cockpit', href: '/cockpit', icon: LayoutDashboard },
  { name: 'Base de Leads', href: '/cockpit/crm/leads', icon: Inbox, permissionModule: 'leads' },
  {
    name: 'Chat Omnichannel',
    href: '/cockpit/crm/chat',
    icon: MessageSquare,
    permissionModule: 'omni_chat',
  },
]

export const cockpitNavSections: CockpitNavSection[] = [
  {
    id: 'administracao',
    label: 'Administração',
    icon: Settings2,
    items: [
      { name: 'Empresas', href: '/cockpit/empresas', icon: Building2, permissionModule: 'empresas' },
      { name: 'Financeiro', href: '/cockpit/financeiro', icon: Wallet, rn3Only: true },
      { name: 'Contratos', href: '/cockpit/financeiro/contratos', icon: FileText, rn3Only: true },
      { name: 'Módulo de Testes', href: '/cockpit/testes', icon: FlaskConical, rn3Only: true },
      { name: 'Simulador de Chat', href: '/cockpit/crm/simulador', icon: MessageSquare, adminOnly: true },
    ],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: FolderOpen,
    items: [
      {
        name: 'Base de Conhecimento',
        href: '/cockpit/crm/conhecimento',
        icon: BookOpen,
        permissionModule: 'conhecimento',
      },
      { name: 'Departamentos', href: '/cockpit/departamentos', icon: Target, permissionModule: 'departamentos' },
      { name: 'Funis', href: '/cockpit/crm/funis', icon: Columns, permissionModule: 'funis' },
      { name: 'Usuários', href: '/cockpit/usuarios', icon: Users, permissionModule: 'admin_usuarios' },
      { name: 'Grupos de Acesso', href: '/cockpit/grupos', icon: ShieldCheck, permissionModule: 'admin_grupos' },
      {
        name: 'Canais Inbound',
        href: '/cockpit/configuracoes/canais',
        icon: Share2,
        permissionModule: 'canais',
      },
    ],
  },
]

/** Todos os itens do menu (top-level + seções), para resolver título/ícone pelo pathname. */
export function getAllCockpitNavItems(): CockpitNavItem[] {
  return [...cockpitTopLevelNav, ...cockpitNavSections.flatMap((s) => s.items)]
}

export function isActiveCockpitPath(pathname: string, href: string, siblingHrefs: string[] = []) {
  if (href === '/cockpit') return pathname === '/cockpit'
  const matches = pathname === href || pathname.startsWith(href + '/')
  if (!matches) return false
  const hasMoreSpecificMatch = siblingHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(href + '/') &&
      (pathname === other || pathname.startsWith(other + '/'))
  )
  return !hasMoreSpecificMatch
}

export type ResolvedCockpitNav = {
  item: CockpitNavItem
  /** Pathname é exatamente o href do item do menu (tela de entrada). */
  isExact: boolean
}

/**
 * Resolve o item de menu mais específico para o pathname atual.
 * Usado no header do shell para título/ícone e na sidebar para estado ativo.
 */
export function resolveCockpitNav(pathname: string): ResolvedCockpitNav {
  const items = getAllCockpitNavItems()
  const allHrefs = items.map((i) => i.href)

  let best: CockpitNavItem | null = null
  for (const item of items) {
    if (!isActiveCockpitPath(pathname, item.href, allHrefs)) continue
    if (!best || item.href.length > best.href.length) {
      best = item
    }
  }

  if (!best) {
    return {
      item: cockpitTopLevelNav[0],
      isExact: pathname === '/cockpit',
    }
  }

  return {
    item: best,
    isExact: pathname === best.href,
  }
}
