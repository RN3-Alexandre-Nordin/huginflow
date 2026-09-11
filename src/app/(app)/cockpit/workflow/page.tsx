import { getMyProfile } from '@/app/(app)/cockpit/actions'
import ModuleHub from '@/components/cockpit/ModuleHub'
import {
  filterNavItems,
  workflowHubCards,
} from '@/app/(app)/cockpit/cockpit-nav'
import { getEmpresaAddons } from '@/lib/addons/entitlements'
import { buildCockpitNavPermissions } from '@/utils/cockpit-nav-permissions'

export const metadata = { title: 'Workflow | HuginFlow' }

export default async function WorkflowHubPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const empresaAddons =
    me?.empresa_id && !isSuperAdmin ? await getEmpresaAddons(me.empresa_id) : null
  const cards = filterNavItems(
    workflowHubCards,
    isSuperAdmin,
    isSuperAdmin || me?.role_global === 'admin',
    buildCockpitNavPermissions(me),
    empresaAddons,
  )

  return (
    <ModuleHub
      title="Workflow"
      description="Processos em funil e indicadores do módulo."
      cards={cards}
      emptyMessage="Seu grupo ou os addons da empresa não liberam Funis nem Relatórios."
    />
  )
}
