import { getMyProfile } from '@/app/(app)/cockpit/actions'
import ModuleHub from '@/components/cockpit/ModuleHub'
import { filterNavItems, omniHubCards } from '@/app/(app)/cockpit/cockpit-nav'
import { getEmpresaAddons } from '@/lib/addons/entitlements'
import { buildCockpitNavPermissions } from '@/utils/cockpit-nav-permissions'

export const metadata = { title: 'Omni | HuginFlow' }

export default async function OmniHubPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const empresaAddons =
    me?.empresa_id && !isSuperAdmin ? await getEmpresaAddons(me.empresa_id) : null
  const cards = filterNavItems(
    omniHubCards,
    isSuperAdmin,
    isSuperAdmin || me?.role_global === 'admin',
    buildCockpitNavPermissions(me),
    empresaAddons,
  )

  return (
    <ModuleHub
      title="Omni"
      description="Atendimento omnichannel e configuração de canais."
      cards={cards}
      emptyMessage="Seu grupo ou o addon Omni não liberam chat, conhecimento ou canais."
    />
  )
}
