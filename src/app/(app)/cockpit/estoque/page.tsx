import { getMyProfile } from '@/app/(app)/cockpit/actions'
import ModuleHub from '@/components/cockpit/ModuleHub'
import {
  estoqueHubCards,
  filterNavItems,
} from '@/app/(app)/cockpit/cockpit-nav'
import { getEmpresaAddons } from '@/lib/addons/entitlements'
import { buildCockpitNavPermissions } from '@/utils/cockpit-nav-permissions'

export const metadata = { title: 'Estoque | HuginFlow' }

export default async function EstoqueHubPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const empresaAddons =
    me?.empresa_id && !isSuperAdmin ? await getEmpresaAddons(me.empresa_id) : null
  const cards = filterNavItems(
    estoqueHubCards,
    isSuperAdmin,
    isSuperAdmin || me?.role_global === 'admin',
    buildCockpitNavPermissions(me),
    empresaAddons,
  )

  return (
    <ModuleHub
      title="Estoque"
      description="Gestão operacional de materiais, movimentações, requisições e poder de terceiros."
      cards={cards}
      emptyMessage="Seu grupo de acesso ou os addons da empresa não liberam operações de estoque."
    />
  )
}
