import { getMyProfile } from '@/app/(app)/cockpit/actions'
import ModuleHub from '@/components/cockpit/ModuleHub'
import { filterNavItems, rn3HubCards } from '@/app/(app)/cockpit/cockpit-nav'
import { buildCockpitNavPermissions } from '@/utils/cockpit-nav-permissions'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Admin RN3 | HuginFlow' }

export default async function Rn3HubPage() {
  const me = await getMyProfile()
  if (me?.role_global !== 'superadmin') {
    redirect('/cockpit')
  }

  const cards = filterNavItems(
    rn3HubCards,
    true,
    true,
    buildCockpitNavPermissions(me),
    null,
  )

  return (
    <ModuleHub
      title="Admin RN3"
      description="Configuração RN3: addons, billing e ferramentas internas."
      cards={cards}
    />
  )
}
