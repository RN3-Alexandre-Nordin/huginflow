import { Shield, Eye, Pencil, Plus, Trash2, MousePointerClick } from 'lucide-react'

export interface PermissionModule {
  slug: string
  label: string
  actions: { slug: string; label: string; icon: any }[]
  /** Addon técnico necessário para exibir na matriz do tenant (além da categoria). */
  requiredAddon?: string
  /** Subseção dentro da aba Estoque. */
  estoqueSection?: 'hub' | 'movimentacoes' | 'requisicoes' | 'consultas'
  /** Não aparece na matriz de grupos (gate fora do RBAC). */
  hideFromGroupsMatrix?: boolean
}

export interface PermissionCategory {
  id: string
  label: string
  hint: string
  color: string
  modules: PermissionModule[]
  /**
   * false = não entra na matriz de Grupos do tenant
   * (ex.: Financeiro SaaS RN3).
   */
  showInGroupsMatrix?: boolean
  /** Exige este addon enabled na empresa para mostrar a aba. */
  requiredAddon?: string
  /** Exige ao menos um destes addons. */
  requiredAddonsAny?: string[]
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'administracao',
    label: 'Administração',
    hint: 'Empresa, usuários, grupos e departamentos',
    color: '#2BAADF',
    showInGroupsMatrix: true,
    modules: [
      {
        slug: 'empresas',
        label: 'Empresas',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'departamentos',
        label: 'Departamentos',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'usuarios',
        label: 'Usuários',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'invite', label: 'Convidar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'grupos',
        label: 'Grupos de Acesso',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
    ],
  },
  {
    id: 'crm',
    label: 'CRM / Workflow',
    hint: 'Funis, pessoas, omni e cadastros do processo',
    color: '#80B828',
    showInGroupsMatrix: true,
    requiredAddonsAny: ['workflow', 'omni', 'cadastros', 'crm'],
    modules: [
      {
        slug: 'crm',
        label: 'CRM Workspace',
        requiredAddon: 'workflow',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'manage', label: 'Gerenciar', icon: Shield },
        ],
      },
      {
        slug: 'funis',
        label: 'Funis de Vendas',
        requiredAddon: 'workflow',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'leads',
        label: 'Pessoas',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'skus',
        label: 'SKUs (produtos/serviços)',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'ativos',
        label: 'Ativos (patrimônio)',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'canais',
        label: 'Canais Inbound',
        requiredAddon: 'omni',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'simulador',
        label: 'Chat Interno (Simulador)',
        requiredAddon: 'omni',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'use', label: 'Usar', icon: MousePointerClick },
        ],
      },
      {
        slug: 'cards',
        label: 'Cards (Leads/Negócios)',
        requiredAddon: 'workflow',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'move', label: 'Mover (Arrastar)', icon: MousePointerClick },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'card_attachments',
        label: 'Anexos de Cards',
        requiredAddon: 'workflow',
        actions: [
          { slug: 'view', label: 'Visualizar', icon: Eye },
          { slug: 'create', label: 'Anexar Arquivo', icon: Plus },
          { slug: 'delete', label: 'Remover Anexo', icon: Trash2 },
        ],
      },
      {
        slug: 'conhecimento',
        label: 'Base de Conhecimento',
        requiredAddon: 'omni',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'relatorios',
        label: 'Relatórios e Analytics',
        requiredAddon: 'workflow',
        actions: [{ slug: 'view', label: 'Ver', icon: Eye }],
      },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    hint: 'Billing SaaS RN3 — fora da matriz de grupos do tenant',
    color: '#E8A317',
    showInGroupsMatrix: false,
    modules: [
      {
        slug: 'financeiro',
        label: 'Contas a Receber',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Baixar / Cancelar', icon: Pencil },
        ],
      },
      {
        slug: 'contratos',
        label: 'Contratos Comerciais',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque',
    hint: 'Locais, movimentações, requisições e consultas',
    color: '#10B981',
    showInGroupsMatrix: true,
    requiredAddon: 'estoque',
    modules: [
      {
        slug: 'estoque',
        label: 'Estoque Geral / Hub',
        estoqueSection: 'hub',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'estoque_locais',
        label: 'Locais de Estoque',
        estoqueSection: 'hub',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'estoque_config',
        label: 'Configurações de Estoque',
        estoqueSection: 'hub',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'edit', label: 'Editar', icon: Pencil },
        ],
      },
      {
        slug: 'estoque_entradas',
        label: 'Entradas de Mercadoria',
        estoqueSection: 'movimentacoes',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
        ],
      },
      {
        slug: 'estoque_retiradas',
        label: 'Retiradas Manuais',
        estoqueSection: 'movimentacoes',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
        ],
      },
      {
        slug: 'estoque_transferencias',
        label: 'Transferências entre Locais',
        estoqueSection: 'movimentacoes',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
        ],
      },
      {
        slug: 'estoque_ajustes',
        label: 'Ajustes de Estoque',
        estoqueSection: 'movimentacoes',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
        ],
      },
      {
        slug: 'estoque_remessas',
        label: 'Remessas (Poder de Terceiros)',
        estoqueSection: 'movimentacoes',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar / Retorno', icon: Pencil },
        ],
      },
      {
        slug: 'estoque_requisicoes',
        label: 'Requisições de Materiais',
        estoqueSection: 'requisicoes',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ],
      },
      {
        slug: 'estoque_atendimento',
        label: 'Atendimento de Requisições',
        estoqueSection: 'requisicoes',
        actions: [
          { slug: 'create', label: 'Atender', icon: Plus },
          { slug: 'edit', label: 'Baixar estoque', icon: Pencil },
        ],
      },
      {
        slug: 'estoque_relatorios',
        label: 'Relatórios de Estoque',
        estoqueSection: 'consultas',
        actions: [{ slug: 'view', label: 'Ver', icon: Eye }],
      },
      // Gate operacional: Estoque → Configuração (aprovador). Fora da matriz RBAC.
      {
        slug: 'estoque_aprovacao',
        label: 'Aprovação de Requisições',
        hideFromGroupsMatrix: true,
        estoqueSection: 'requisicoes',
        actions: [{ slug: 'edit', label: 'Aprovar / Rejeitar', icon: Pencil }],
      },
    ],
  },
]

export const ESTOQUE_MATRIX_SECTIONS = [
  { id: 'hub' as const, label: 'Hub & Cadastros', hint: 'Hub, locais e configuração' },
  { id: 'movimentacoes' as const, label: 'Movimentações', hint: 'Entradas, saídas, transferências e remessas' },
  { id: 'requisicoes' as const, label: 'Requisições', hint: 'Pedido e atendimento (aprovação é na Configuração)' },
  { id: 'consultas' as const, label: 'Consultas', hint: 'Saldos, cardex e exportações' },
]

function addonEnabled(
  empresaAddons: Record<string, boolean> | null | undefined,
  codigo: string,
): boolean {
  // Sem mapa ainda (carregando): não liberar addons — evita mostrar módulos indevidos
  if (!empresaAddons) return false
  return empresaAddons[codigo] === true
}

function categoryVisibleForAddons(
  category: PermissionCategory,
  empresaAddons: Record<string, boolean> | null | undefined,
): boolean {
  if (category.showInGroupsMatrix === false) return false
  if (category.requiredAddon && !addonEnabled(empresaAddons, category.requiredAddon)) {
    return false
  }
  if (category.requiredAddonsAny?.length) {
    // Sem addons carregados ou nenhum do conjunto ativo → esconde a aba
    if (!empresaAddons) return false
    if (!category.requiredAddonsAny.some((c) => empresaAddons[c] === true)) return false
  }
  return true
}

function moduleVisibleForAddons(
  module: PermissionModule,
  empresaAddons: Record<string, boolean> | null | undefined,
): boolean {
  if (module.hideFromGroupsMatrix) return false
  if (module.requiredAddon && !addonEnabled(empresaAddons, module.requiredAddon)) {
    return false
  }
  return true
}

/** Categorias + módulos filtrados para a matriz de Grupos do tenant. */
export function getGroupsMatrixCategories(
  empresaAddons?: Record<string, boolean> | null,
): PermissionCategory[] {
  return PERMISSION_CATEGORIES.filter((c) => categoryVisibleForAddons(c, empresaAddons))
    .map((c) => ({
      ...c,
      modules: c.modules.filter((m) => moduleVisibleForAddons(m, empresaAddons)),
    }))
    .filter((c) => c.modules.length > 0)
}

/** Marca todas as ações dos módulos que a empresa tem direito de ver na matriz. */
export function buildGroupsMatrixFullPermissions(
  empresaAddons?: Record<string, boolean> | null,
): Record<string, string[]> {
  const full: Record<string, string[]> = {}
  for (const category of getGroupsMatrixCategories(empresaAddons)) {
    for (const mod of category.modules) {
      full[mod.slug] = mod.actions.map((a) => a.slug)
    }
  }
  return full
}

/**
 * Retorna um objeto com todas as permissões do sistema.
 */
export function getFullPermissionsJSON(): Record<string, string[]> {
  const fullPerms: Record<string, string[]> = {}

  PERMISSION_CATEGORIES.forEach((category) => {
    category.modules.forEach((module) => {
      fullPerms[module.slug] = module.actions.map((action) => action.slug)
    })
  })

  return fullPerms
}
