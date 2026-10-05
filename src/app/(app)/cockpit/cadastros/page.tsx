import { getMyProfile } from '@/app/(app)/cockpit/actions'
import ModuleHub from '@/components/cockpit/ModuleHub'
import {
  cadastrosHubCards,
  filterNavItems,
} from '@/app/(app)/cockpit/cockpit-nav'
import { getEmpresaAddons } from '@/lib/addons/entitlements'
import { buildCockpitNavPermissions } from '@/utils/cockpit-nav-permissions'

export const metadata = { title: 'Cadastros | HuginFlow' }

export default async function CadastrosHubPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const empresaAddons =
    me?.empresa_id && !isSuperAdmin ? await getEmpresaAddons(me.empresa_id) : null
  const cards = filterNavItems(
    cadastrosHubCards,
    isSuperAdmin,
    isSuperAdmin || me?.role_global === 'admin',
    buildCockpitNavPermissions(me),
    empresaAddons,
  )

  return (
    <ModuleHub
      title="Cadastros"
      description="Mestres compartilhados. Locais de estoque ficam no módulo Estoque."
      cards={cards}
      emptyMessage="Seu grupo ou os addons da empresa não liberam Pessoas, SKUs ou Ativos."
    />
  )
}
