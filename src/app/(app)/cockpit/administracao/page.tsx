import { getMyProfile } from '@/app/(app)/cockpit/actions'
import ModuleHub from '@/components/cockpit/ModuleHub'
import {
  administracaoHubCards,
  filterNavItems,
} from '@/app/(app)/cockpit/cockpit-nav'
import { getEmpresaAddons } from '@/lib/addons/entitlements'
import { buildCockpitNavPermissions } from '@/utils/cockpit-nav-permissions'

export const metadata = { title: 'Administração | HuginFlow' }

export default async function AdministracaoHubPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const empresaAddons =
    me?.empresa_id && !isSuperAdmin ? await getEmpresaAddons(me.empresa_id) : null
  const cards = filterNavItems(
    administracaoHubCards,
    isSuperAdmin,
    isSuperAdmin || me?.role_global === 'admin',
    buildCockpitNavPermissions(me),
    empresaAddons,
  )

  return (
    <ModuleHub
      title="Administração"
      description="Governança do tenant: acesso, grupos e organograma."
      cards={cards}
      emptyMessage="Sem permissão para áreas de administração."
    />
  )
}
