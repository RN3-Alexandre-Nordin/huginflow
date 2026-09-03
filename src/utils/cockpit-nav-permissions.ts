import { PERMISSION_CATEGORIES } from "@/constants/permissions"
import { hasPermission, type PermissionData } from "@/utils/permissions"

/** Chaves usadas em `permissionModule` do menu lateral do cockpit. */
export type CockpitNavPermissions = Record<string, boolean>

function canViewModule(user: PermissionData | null, module: string): boolean {
  return hasPermission(user, module, "view")
}

/**
 * Monta o mapa de visibilidade do menu com base na matriz RBAC.
 * Deve espelhar as checagens das páginas (guard por URL).
 */
export function buildCockpitNavPermissions(
  user: PermissionData | null
): CockpitNavPermissions {
  const perms: CockpitNavPermissions = {}

  for (const category of PERMISSION_CATEGORIES) {
    for (const module of category.modules) {
      perms[module.slug] = canViewModule(user, module.slug)
    }
  }

  // Slugs legados usados em algumas páginas de administração
  perms.admin_usuarios =
    canViewModule(user, "admin_usuarios") || canViewModule(user, "usuarios")
  perms.admin_grupos =
    canViewModule(user, "admin_grupos") || canViewModule(user, "grupos")

  // Chat omnichannel: sem módulo dedicado; operadores costumam ter funil ou leads
  perms.omni_chat =
    canViewModule(user, "funis") ||
    canViewModule(user, "leads") ||
    hasPermission(user, "cards", "edit")

  return perms
}
