import { hasPermission, type PermissionData } from '@/utils/permissions'

export type CardAccessUser = PermissionData & {
  id: string
  role_global?: string | null
  grupos_acesso?: { is_admin: boolean | null } | null
}

export function isTenantAdmin(me: CardAccessUser | null | undefined): boolean {
  if (!me) return false
  return (
    me.role_global === 'superadmin' ||
    me.role_global === 'admin' ||
    me.grupos_acesso?.is_admin === true
  )
}

/** Visualização read-only do card (chat / consulta). */
export function canConsultCard(
  me: CardAccessUser,
  userDeptIds: string[],
  opts: { responsavel_id?: string | null; departamento_id?: string | null },
): boolean {
  if (!hasPermission(me, 'cards', 'view')) return false
  if (isTenantAdmin(me)) return true
  if (opts.responsavel_id === me.id) return true
  if (opts.departamento_id && userDeptIds.includes(opts.departamento_id)) return true
  return false
}

/** Abrir card no funil com ações de trabalho. */
export function canWorkCardInKanban(
  me: CardAccessUser,
  userDeptIds: string[],
  opts: { responsavel_id?: string | null; departamento_id?: string | null },
): boolean {
  return canConsultCard(me, userDeptIds, opts) && hasPermission(me, 'cards', 'edit')
}
