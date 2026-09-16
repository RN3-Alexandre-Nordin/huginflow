import { hasPermission, type PermissionData } from '@/utils/permissions'

/** Templates de home prontos (sem builder de KPI para PME). */
export const COCKPIT_TEMPLATES = [
  {
    id: 'auto',
    label: 'Automático',
    hint: 'Resolve pelo addon e pelas permissões do grupo',
  },
  {
    id: 'atendente_omni',
    label: 'Atendente Omni',
    hint: 'Fila WhatsApp, cards e produtividade CRM',
  },
  {
    id: 'operador_estoque',
    label: 'Operador Estoque',
    hint: 'Aprovações, atendimento, remessas e movimentos',
  },
] as const

export type CockpitTemplateId = (typeof COCKPIT_TEMPLATES)[number]['id']

/** Template efetivo após resolução de `auto`. */
export type ResolvedCockpitTemplate = Exclude<CockpitTemplateId, 'auto'>

export function isCockpitTemplateId(value: unknown): value is CockpitTemplateId {
  return (
    value === 'auto' || value === 'atendente_omni' || value === 'operador_estoque'
  )
}

export function parseCockpitTemplate(value: unknown): CockpitTemplateId {
  return isCockpitTemplateId(value) ? value : 'auto'
}

type AddonMap = Record<string, boolean> | null | undefined

function hasOmniOps(addons: AddonMap): boolean {
  return Boolean(addons?.omni || addons?.workflow)
}

function hasEstoqueOps(addons: AddonMap): boolean {
  return Boolean(addons?.estoque)
}

function userHasStockOps(user: PermissionData | null): boolean {
  return (
    hasPermission(user, 'estoque_requisicoes', 'view') ||
    hasPermission(user, 'estoque_atendimento', 'create') ||
    hasPermission(user, 'estoque_remessas', 'view') ||
    hasPermission(user, 'estoque', 'view')
  )
}

function userHasCrmOps(user: PermissionData | null): boolean {
  return (
    hasPermission(user, 'leads', 'view') ||
    hasPermission(user, 'funis', 'view') ||
    hasPermission(user, 'cards', 'view')
  )
}

/**
 * Resolve o template efetivo da home.
 * - Preferência explícita do grupo (exceto `auto`)
 * - `auto`: addon dominante; com ambos, estoque se só tem perms de estoque
 */
export function resolveCockpitTemplate(opts: {
  preferred: CockpitTemplateId | null | undefined
  addons: AddonMap
  user: PermissionData | null
}): ResolvedCockpitTemplate {
  const preferred = parseCockpitTemplate(opts.preferred)
  const omni = hasOmniOps(opts.addons)
  const estoque = hasEstoqueOps(opts.addons)

  if (preferred === 'operador_estoque') {
    return estoque ? 'operador_estoque' : omni ? 'atendente_omni' : 'operador_estoque'
  }
  if (preferred === 'atendente_omni') {
    return omni ? 'atendente_omni' : estoque ? 'operador_estoque' : 'atendente_omni'
  }

  // auto
  if (estoque && !omni) return 'operador_estoque'
  if (omni && !estoque) return 'atendente_omni'
  if (estoque && omni) {
    if (userHasStockOps(opts.user) && !userHasCrmOps(opts.user)) {
      return 'operador_estoque'
    }
    return 'atendente_omni'
  }

  return 'atendente_omni'
}

/** Empresa tem home operacional? (omni/workflow/estoque) */
export function empresaHasOperationalHome(addons: AddonMap): boolean {
  return hasOmniOps(addons) || hasEstoqueOps(addons)
}
