import { Shield, Eye, Pencil, Plus, Trash2, MousePointerClick } from 'lucide-react'

export interface PermissionModule {
  slug: string
  label: string
  actions: { slug: string; label: string; icon: any }[]
}

export interface PermissionCategory {
  label: string
  color: string
  modules: PermissionModule[]
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    label: 'Administração',
    color: '#2BAADF',
    modules: [
      {
        slug: 'empresas',
        label: 'Empresas',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'departamentos',
        label: 'Departamentos',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'usuarios',
        label: 'Usuários',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'invite', label: 'Convidar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'grupos',
        label: 'Grupos de Acesso',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
    ]
  },
  {
    label: 'CRM',
    color: '#80B828',
    modules: [
      {
        slug: 'crm',
        label: 'CRM Workspace',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'manage', label: 'Gerenciar', icon: Shield },
        ]
      },
      {
        slug: 'funis',
        label: 'Funis de Vendas',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'leads',
        label: 'Pessoas',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'skus',
        label: 'SKUs (produtos/serviços)',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'ativos',
        label: 'Ativos (patrimônio)',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'canais',
        label: 'Canais Inbound',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'simulador',
        label: 'Chat Interno (Simulador)',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'use', label: 'Usar', icon: MousePointerClick },
        ]
      },
      {
        slug: 'cards',
        label: 'Cards (Leads/Negócios)',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'move', label: 'Mover (Arrastar)', icon: MousePointerClick },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'card_attachments',
        label: 'Anexos de Cards',
        actions: [
          { slug: 'view', label: 'Visualizar', icon: Eye },
          { slug: 'create', label: 'Anexar Arquivo', icon: Plus },
          { slug: 'delete', label: 'Remover Anexo', icon: Trash2 },
        ]
      },
      {
        slug: 'conhecimento',
        label: 'Base de Conhecimento',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'relatorios',
        label: 'Relatórios e Analytics',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
        ]
      },
    ]
  },
  {
    label: 'Financeiro',
    color: '#E8A317',
    modules: [
      {
        slug: 'financeiro',
        label: 'Contas a Receber',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Baixar / Cancelar', icon: Pencil },
        ]
      },
      {
        slug: 'contratos',
        label: 'Contratos Comerciais',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
    ]
  },
  {
    label: 'Estoque',
    color: '#10B981',
    modules: [
      {
        slug: 'estoque',
        label: 'Estoque Geral / Hub',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'estoque_locais',
        label: 'Locais de Estoque',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'estoque_config',
        label: 'Configurações de Estoque',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'edit', label: 'Editar', icon: Pencil },
        ]
      },
      {
        slug: 'estoque_entradas',
        label: 'Entradas de Mercadoria',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
        ]
      },
      {
        slug: 'estoque_retiradas',
        label: 'Retiradas Manuais',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
        ]
      },
      {
        slug: 'estoque_transferencias',
        label: 'Transferências entre Locais',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
        ]
      },
      {
        slug: 'estoque_ajustes',
        label: 'Ajustes de Estoque',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
        ]
      },
      {
        slug: 'estoque_remessas',
        label: 'Remessas (Poder de Terceiros)',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar / Retorno', icon: Pencil },
        ]
      },
      {
        slug: 'estoque_requisicoes',
        label: 'Requisições de Materiais',
        actions: [
          { slug: 'view', label: 'Ver', icon: Eye },
          { slug: 'create', label: 'Criar', icon: Plus },
          { slug: 'edit', label: 'Editar', icon: Pencil },
          { slug: 'delete', label: 'Excluir', icon: Trash2 },
        ]
      },
      {
        slug: 'estoque_aprovacao',
        label: 'Aprovação de Requisições',
        actions: [
          { slug: 'edit', label: 'Aprovar / Rejeitar', icon: Pencil },
        ]
      },
      {
        slug: 'estoque_atendimento',
        label: 'Atendimento de Requisições',
        actions: [
          { slug: 'edit', label: 'Atender / Baixar', icon: Pencil },
        ]
      },
    ]
  }
]

/**
 * Retorna um objeto com todas as permissões do sistema.
 */
export function getFullPermissionsJSON(): Record<string, string[]> {
  const fullPerms: Record<string, string[]> = {}
  
  PERMISSION_CATEGORIES.forEach(category => {
    category.modules.forEach(module => {
      fullPerms[module.slug] = module.actions.map(action => action.slug)
    })
  })
  
  return fullPerms
}
