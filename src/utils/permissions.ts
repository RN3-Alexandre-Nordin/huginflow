/**
 * HuginFlow Permission Engine (RBAC)
 * 
 * Regras de Precedência:
 * 1. SuperAdmin (RN3): Acesso 100% a tudo (dados e sistema).
 * 2. Admin de Empresa (is_admin): Acesso 100% aos recursos da empresa. 
 * 3. Granular (permissoes): Baseado na matriz JSONB do grupo.
 */

export interface PermissionData {
  role_global?: string | null
  grupos_acesso?: {
    is_admin: boolean | null
    permissoes: any
  } | null
}

export function isRn3SuperAdmin(user: PermissionData | null | undefined): boolean {
  return user?.role_global === 'superadmin'
}

/** Simulador de IA: apenas admin da empresa ou superadmin RN3. */
export function canAccessSimulador(user: PermissionData | null | undefined): boolean {
  if (!user) return false
  return user.role_global === 'superadmin' || user.role_global === 'admin'
}

/**
 * Verifica se um usuário possui uma permissão específica para um módulo e ação.
 */
export function hasPermission(
  user: PermissionData | null,
  module: string,
  action: string
): boolean {
  if (!user) return false

  // Nível 1: SuperAdmin da RN3 (Bypass Total)
  if (user.role_global === 'superadmin') return true

  // Admin da empresa: acesso total ao tenant mesmo se o join do grupo falhar
  if (user.role_global === 'admin') return true

  // Se não houver grupo de acesso (e não for admin/superadmin), não tem permissão
  if (!user.grupos_acesso) return false

  // Nível 2: Administrador da Empresa via flag do grupo
  if (user.grupos_acesso.is_admin === true) return true

  // Nível 3: Permissões Granulares (JSONB)
  const permissions = user.grupos_acesso.permissoes || {}
  const moduleActions = permissions[module] || []
  
  return moduleActions.includes(action)
}
