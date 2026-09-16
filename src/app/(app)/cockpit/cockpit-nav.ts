/**
 * Navegação estilo Bifrost: sidebar = módulos (pastas); cada módulo = hub com cards.
 * Telas profundas não entram no menu; resolvem título via deep links.
 *
 * Gate: entitlement (`addon` / `addonsAny`) + RBAC (`permissionModule` / `permissionAny`).
 * Isolamento de dados: sempre `empresa_id` nas queries.
 */
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
  FlaskConical,
  BarChart3,
  Boxes,
  Workflow,
  Landmark,
  Headset,
  FolderOpen,
  Package,
  ArrowLeftRight,
  Link2,
  Warehouse,
  ClipboardList,
  Truck,
  SlidersHorizontal,
  ArrowDownToLine,
  ArrowUpRight,
  Tags,
  type LucideIcon,
} from 'lucide-react'

export type CockpitNavItem = {
  name: string
  href: string
  icon: LucideIcon
  rn3Only?: boolean
  adminOnly?: boolean
  permissionModule?: string
  permissionAny?: string[]
  addon?: string
  addonsAny?: string[]
  description?: string
  /** data-testid do link/card (ex.: nav-workflow, hub-card-funis). */
  testId?: string
}

export type CockpitModule = {
  id: string
  /** Entrada única na sidebar. */
  nav: CockpitNavItem
  /** Cards do hub (Bifrost Admin). */
  cards: CockpitNavItem[]
  /** Rotas extras do módulo (subnav / forms) — título no shell, não no menu. */
  deepLinks?: CockpitNavItem[]
  /** Subtítulo do hub. */
  hubDescription?: string
}

export const workflowHubCards: CockpitNavItem[] = [
  {
    name: 'Funis',
    href: '/cockpit/crm/funis',
    icon: Columns,
    permissionModule: 'funis',
    addon: 'workflow',
    description: 'Kanban, estágios e cards do processo',
    testId: 'hub-card-funis',
  },
  {
    name: 'Relatórios',
    href: '/cockpit/relatorios',
    icon: BarChart3,
    permissionModule: 'relatorios',
    description: 'Indicadores e análises do workflow',
    testId: 'hub-card-relatorios',
  },
]

export const omniHubCards: CockpitNavItem[] = [
  {
    name: 'Chat Omnichannel',
    href: '/cockpit/crm/chat',
    icon: MessageSquare,
    permissionModule: 'omni_chat',
    addon: 'omni',
    description: 'Conversas inbound e atendimento',
    testId: 'hub-card-omni-chat',
  },
  {
    name: 'Base de Conhecimento',
    href: '/cockpit/crm/conhecimento',
    icon: BookOpen,
    permissionModule: 'conhecimento',
    addon: 'omni',
    description: 'RAG e conteúdos para a IA',
    testId: 'hub-card-conhecimento',
  },
  {
    name: 'Canais Inbound',
    href: '/cockpit/configuracoes/canais',
    icon: Share2,
    permissionModule: 'canais',
    addon: 'omni',
    description: 'WhatsApp e demais canais conectados',
    testId: 'hub-card-canais',
  },
]

export const cadastrosHubCards: CockpitNavItem[] = [
  {
    name: 'Pessoas',
    href: '/cockpit/crm/leads',
    icon: Inbox,
    permissionModule: 'leads',
    addonsAny: ['workflow', 'omni'],
    description: 'Clientes, fornecedores, leads e demais papéis',
    testId: 'hub-card-pessoas',
  },
  {
    name: 'SKUs',
    href: '/cockpit/cadastros/skus',
    icon: Package,
    permissionModule: 'skus',
    addonsAny: ['cadastros', 'estoque', 'crm'],
    description: 'Catálogo de produtos e serviços',
    testId: 'hub-card-skus',
  },
  {
    name: 'Famílias de SKU',
    href: '/cockpit/cadastros/sku-familias',
    icon: Tags,
    permissionModule: 'skus',
    addonsAny: ['cadastros', 'estoque', 'crm'],
    description: 'Agrupamento (Cervejas, Destilados, etc.) para filtros e relatórios',
    testId: 'hub-card-sku-familias',
  },
  {
    name: 'Conversões UM',
    href: '/cockpit/cadastros/conversoes-um',
    icon: ArrowLeftRight,
    permissionModule: 'skus',
    addonsAny: ['cadastros', 'estoque', 'crm'],
    description: 'Fatores genéricos ou por SKU (ex.: ML → L)',
    testId: 'hub-card-conversoes-um',
  },
  {
    name: 'De-para SKU',
    href: '/cockpit/cadastros/sku-depara',
    icon: Link2,
    permissionModule: 'skus',
    addonsAny: ['cadastros', 'estoque', 'crm'],
    description: 'Código do parceiro (fornecedor/cliente) ↔ SKU Hugin',
    testId: 'hub-card-sku-depara',
  },
  {
    name: 'Ativos',
    href: '/cockpit/cadastros/ativos',
    icon: Warehouse,
    permissionModule: 'ativos',
    addonsAny: ['cadastros', 'estoque', 'finops'],
    description: 'Patrimônio, centro de custo e vínculo a depreciação',
    testId: 'hub-card-ativos',
  },
]

export const estoqueHubCards: CockpitNavItem[] = [
  {
    name: 'Locais de Estoque',
    href: '/cockpit/estoque/locais',
    icon: Warehouse,
    permissionModule: 'estoque_locais',
    addon: 'estoque',
    description: 'Locais de armazenagem físicos e local BRANCO',
    testId: 'hub-card-locais',
  },
  {
    name: 'Configuração',
    href: '/cockpit/estoque/configuracao',
    icon: Settings2,
    permissionModule: 'estoque_config',
    addon: 'estoque',
    description: 'Parâmetros NFe, saldo de requisição e reconciliação',
    testId: 'hub-card-estoque-config',
  },
  {
    name: 'Entradas',
    href: '/cockpit/estoque/entradas',
    icon: ArrowDownToLine,
    permissionModule: 'estoque_entradas',
    addon: 'estoque',
    description: 'Lotes manuais, planilha e importação NFe XML',
    testId: 'hub-card-entradas',
  },
  {
    name: 'Retiradas',
    href: '/cockpit/estoque/retiradas',
    icon: ArrowUpRight,
    permissionModule: 'estoque_retiradas',
    addon: 'estoque',
    description: 'Baixas manuais diretas com justificativa',
    testId: 'hub-card-retiradas',
  },
  {
    name: 'Transferências',
    href: '/cockpit/estoque/transferencias',
    icon: ArrowLeftRight,
    permissionAny: ['estoque', 'estoque_transferencias'],
    addon: 'estoque',
    description: 'Movimentação direta entre locais de estoque',
    testId: 'hub-card-transferencias',
  },
  {
    name: 'Ajustes',
    href: '/cockpit/estoque/ajustes',
    icon: SlidersHorizontal,
    permissionModule: 'estoque_ajustes',
    addon: 'estoque',
    description: 'Ajustes manuais de inventário positivos e negativos',
    testId: 'hub-card-ajustes',
  },
  {
    name: 'Remessas (Terceiros)',
    href: '/cockpit/estoque/remessas',
    icon: Truck,
    permissionModule: 'estoque_remessas',
    addon: 'estoque',
    description: 'Controle de estoque próprio em poder de terceiros',
    testId: 'hub-card-remessas',
  },
  {
    name: 'Requisições',
    href: '/cockpit/estoque/requisicoes',
    icon: ClipboardList,
    permissionModule: 'estoque_requisicoes',
    addon: 'estoque',
    description: 'Requisições internas de consumo por pessoa',
    testId: 'hub-card-requisicoes',
  },
  {
    name: 'Saldos Consolidados',
    href: '/cockpit/estoque/saldos',
    icon: Boxes,
    permissionAny: ['estoque', 'estoque_saldos'],
    addon: 'estoque',
    description: 'Estoque físico por local e materiais em poder de terceiros',
    testId: 'hub-card-saldos',
  },
  {
    name: 'Cardex / Movimentos',
    href: '/cockpit/estoque/cardex',
    icon: BookOpen,
    permissionAny: ['estoque', 'estoque_cardex', 'estoque_relatorios'],
    addon: 'estoque',
    description: 'Livro razão com rastreabilidade completa e histórico de saldos',
    testId: 'hub-card-cardex',
  },
  {
    name: 'Relatórios',
    href: '/cockpit/estoque/relatorios',
    icon: BarChart3,
    permissionModule: 'estoque_relatorios',
    addon: 'estoque',
    description: 'KPIs: valor, fill rate, DOH, giro, críticos, remessas e mais',
    testId: 'hub-card-estoque-relatorios',
  },
]

export const administracaoHubCards: CockpitNavItem[] = [
  {
    name: 'Empresas',
    href: '/cockpit/empresas',
    icon: Building2,
    permissionModule: 'empresas',
    description: 'Tenants e dados cadastrais',
    testId: 'hub-card-empresas',
  },
  {
    name: 'Usuários',
    href: '/cockpit/usuarios',
    icon: Users,
    permissionModule: 'admin_usuarios',
    description: 'Contas e acesso por empresa',
    testId: 'hub-card-usuarios',
  },
  {
    name: 'Grupos de Acesso',
    href: '/cockpit/grupos',
    icon: ShieldCheck,
    permissionModule: 'admin_grupos',
    description: 'Matriz RBAC (ver, criar, editar, excluir)',
    testId: 'hub-card-grupos',
  },
  {
    name: 'Departamentos',
    href: '/cockpit/departamentos',
    icon: Target,
    permissionModule: 'departamentos',
    description: 'Organograma / centro de custo',
    testId: 'hub-card-departamentos',
  },
]

export const rn3HubCards: CockpitNavItem[] = [
  {
    name: 'Addons',
    href: '/cockpit/addons',
    icon: Boxes,
    rn3Only: true,
    description: 'Catálogo e entitlements por empresa',
    testId: 'hub-card-addons',
  },
  {
    name: 'Financeiro',
    href: '/cockpit/financeiro',
    icon: Wallet,
    rn3Only: true,
    description: 'Billing SaaS RN3 (finance_*)',
    testId: 'hub-card-financeiro',
  },
  {
    name: 'Contratos',
    href: '/cockpit/financeiro/contratos',
    icon: FileText,
    rn3Only: true,
    description: 'Contratos e geração de AR',
    testId: 'hub-card-contratos',
  },
  {
    name: 'Módulo de Testes',
    href: '/cockpit/testes',
    icon: FlaskConical,
    rn3Only: true,
    description: 'Baterias e execuções de homologação',
    testId: 'hub-card-testes',
  },
  {
    name: 'Simulador de Chat',
    href: '/cockpit/crm/simulador',
    icon: MessageSquare,
    rn3Only: true,
    description: 'Homologação omni sem Evolution',
    testId: 'hub-card-simulador',
  },
]

/** Módulos da sidebar (ordem = Bifrost: lista plana). */
export const cockpitModules: CockpitModule[] = [
  {
    id: 'cockpit',
    nav: {
      name: 'Cockpit',
      href: '/cockpit',
      icon: LayoutDashboard,
      testId: 'nav-cockpit',
    },
    cards: [],
  },
  {
    id: 'workflow',
    nav: {
      name: 'Workflow',
      href: '/cockpit/workflow',
      icon: Workflow,
      permissionAny: ['funis', 'relatorios'],
      testId: 'nav-workflow',
      description: 'Funis e relatórios',
    },
    cards: workflowHubCards,
    hubDescription: 'Processos em funil e indicadores do módulo.',
  },
  {
    id: 'omni',
    nav: {
      name: 'Omni',
      href: '/cockpit/omni',
      icon: Headset,
      permissionAny: ['omni_chat', 'conhecimento', 'canais'],
      addon: 'omni',
      testId: 'nav-omni',
      description: 'Chat, conhecimento e canais',
    },
    cards: omniHubCards,
    hubDescription: 'Atendimento omnichannel e configuração de canais.',
  },
  {
    id: 'cadastros',
    nav: {
      name: 'Cadastros',
      href: '/cockpit/cadastros',
      icon: FolderOpen,
      permissionAny: ['leads', 'skus', 'ativos'],
      addonsAny: ['cadastros', 'workflow', 'omni', 'estoque', 'crm', 'finops'],
      testId: 'nav-cadastros',
      description: 'Pessoas, SKUs e ativos',
    },
    cards: cadastrosHubCards,
    hubDescription: 'Mestres compartilhados. Locais de estoque ficam no módulo Estoque.',
  },
  {
    id: 'estoque',
    nav: {
      name: 'Estoque',
      href: '/cockpit/estoque',
      icon: Boxes,
      permissionAny: [
        'estoque',
        'estoque_locais',
        'estoque_config',
        'estoque_entradas',
        'estoque_retiradas',
        'estoque_transferencias',
        'estoque_ajustes',
        'estoque_remessas',
        'estoque_requisicoes',
        'estoque_atendimento',
        'estoque_relatorios',
      ],
      addon: 'estoque',
      testId: 'nav-estoque',
      description: 'Locais, movimentações, requisições e remessas',
    },
    cards: estoqueHubCards,
    deepLinks: [
      {
        name: 'Novo Local',
        href: '/cockpit/estoque/locais/novo',
        icon: Warehouse,
        permissionModule: 'estoque_locais',
        addon: 'estoque',
      },
      {
        name: 'Nova Entrada',
        href: '/cockpit/estoque/entradas/novo',
        icon: ArrowDownToLine,
        permissionModule: 'estoque_entradas',
        addon: 'estoque',
      },
      {
        name: 'Importar Entrada',
        href: '/cockpit/estoque/entradas/import',
        icon: ArrowDownToLine,
        permissionModule: 'estoque_entradas',
        addon: 'estoque',
      },
      {
        name: 'Importar NF-e XML',
        href: '/cockpit/estoque/entradas/xml',
        icon: ArrowDownToLine,
        permissionModule: 'estoque_entradas',
        addon: 'estoque',
      },
      {
        name: 'Nova Transferência',
        href: '/cockpit/estoque/transferencias/novo',
        icon: ArrowLeftRight,
        permissionModule: 'estoque_transferencias',
        addon: 'estoque',
      },
      {
        name: 'Nova Requisição',
        href: '/cockpit/estoque/requisicoes/novo',
        icon: ClipboardList,
        permissionModule: 'estoque_requisicoes',
        addon: 'estoque',
      },
      {
        name: 'Nova Remessa',
        href: '/cockpit/estoque/remessas/novo',
        icon: Truck,
        permissionModule: 'estoque_remessas',
        addon: 'estoque',
      },
      {
        name: 'Nova Retirada',
        href: '/cockpit/estoque/retiradas/novo',
        icon: ArrowUpRight,
        permissionModule: 'estoque_retiradas',
        addon: 'estoque',
      },
      {
        name: 'Novo Ajuste',
        href: '/cockpit/estoque/ajustes/novo',
        icon: SlidersHorizontal,
        permissionModule: 'estoque_ajustes',
        addon: 'estoque',
      },
    ],
    hubDescription: 'Gestão operacional de materiais, movimentações e poder de terceiros.',
  },
  {
    id: 'administracao',
    nav: {
      name: 'Administração',
      href: '/cockpit/administracao',
      icon: Settings2,
      permissionAny: ['empresas', 'admin_usuarios', 'admin_grupos', 'departamentos'],
      testId: 'nav-administracao',
      description: 'Empresa, usuários e permissões',
    },
    cards: administracaoHubCards,
    hubDescription: 'Governança do tenant: acesso, grupos e organograma.',
  },
  {
    id: 'rn3',
    nav: {
      name: 'Admin RN3',
      href: '/cockpit/rn3',
      icon: Landmark,
      rn3Only: true,
      testId: 'nav-rn3',
      description: 'Plataforma e billing RN3',
    },
    cards: rn3HubCards,
    hubDescription: 'Configuração RN3: addons, billing e ferramentas internas.',
  },
]

/** @deprecated use cockpitModules — mantido para imports legados. */
export const cockpitTopLevelNav: CockpitNavItem[] = cockpitModules.map((m) => m.nav)

/** @deprecated seções accordion removidas (padrão Bifrost). */
export const cockpitNavSections: never[] = []

export const cockpitNavDeepLinks: CockpitNavItem[] = cockpitModules.flatMap((m) => [
  ...m.cards,
  ...(m.deepLinks ?? []),
])

export function getAllCockpitNavItems(): CockpitNavItem[] {
  return [...cockpitModules.map((m) => m.nav), ...cockpitNavDeepLinks]
}

export function isActiveCockpitPath(pathname: string, href: string, siblingHrefs: string[] = []) {
  if (href === '/cockpit') return pathname === '/cockpit'
  const matches = pathname === href || pathname.startsWith(href + '/')
  if (!matches) return false
  const hasMoreSpecificMatch = siblingHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(href + '/') &&
      (pathname === other || pathname.startsWith(other + '/')),
  )
  return !hasMoreSpecificMatch
}

/** Sidebar: módulo ativo se hub ou qualquer rota filha do módulo. */
export function isModuleNavActive(pathname: string, module: CockpitModule): boolean {
  const href = module.nav.href
  if (href === '/cockpit') return pathname === '/cockpit'
  if (pathname === href || pathname.startsWith(href + '/')) return true
  const routes = [...module.cards, ...(module.deepLinks ?? [])]
  return routes.some((r) => pathname === r.href || pathname.startsWith(r.href + '/'))
}

export type ResolvedCockpitNav = {
  item: CockpitNavItem
  isExact: boolean
}

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
      item: cockpitModules[0].nav,
      isExact: pathname === '/cockpit',
    }
  }

  return {
    item: best,
    isExact: pathname === best.href,
  }
}

export function navItemAllowedByAddon(
  item: CockpitNavItem,
  empresaAddons: Record<string, boolean> | null | undefined,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true
  if (!item.addon && !item.addonsAny?.length) return true
  const flags = empresaAddons ?? {}
  if (item.addon && !flags[item.addon]) return false
  if (item.addonsAny?.length && !item.addonsAny.some((code) => flags[code])) return false
  return true
}

export function navItemAllowedByPermission(
  item: CockpitNavItem,
  navPermissions: Record<string, boolean>,
): boolean {
  if (item.permissionModule && !navPermissions[item.permissionModule]) return false
  if (item.permissionAny?.length && !item.permissionAny.some((m) => navPermissions[m])) {
    return false
  }
  return true
}

export function filterNavItems(
  items: CockpitNavItem[],
  isSuperAdmin: boolean,
  isAdminOrSuperAdmin: boolean,
  navPermissions: Record<string, boolean>,
  empresaAddons?: Record<string, boolean> | null,
): CockpitNavItem[] {
  return items.filter((item) => {
    if (item.rn3Only && !isSuperAdmin) return false
    if (item.adminOnly && !isAdminOrSuperAdmin) return false
    if (!navItemAllowedByPermission(item, navPermissions)) return false
    if (!navItemAllowedByAddon(item, empresaAddons, isSuperAdmin)) return false
    return true
  })
}

/** Módulo aparece na sidebar se sobrou pelo menos um card (Cockpit sempre). */
export function filterVisibleModules(
  isSuperAdmin: boolean,
  isAdminOrSuperAdmin: boolean,
  navPermissions: Record<string, boolean>,
  empresaAddons?: Record<string, boolean> | null,
): CockpitModule[] {
  return cockpitModules.filter((mod) => {
    if (mod.nav.rn3Only && !isSuperAdmin) return false
    if (mod.id === 'cockpit') return true
    if (mod.id === 'rn3') return isSuperAdmin
    const cards = filterNavItems(
      mod.cards,
      isSuperAdmin,
      isAdminOrSuperAdmin,
      navPermissions,
      empresaAddons,
    )
    return cards.length > 0
  })
}
