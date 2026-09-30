import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { comprasHubCards, filterNavItems } from '@/app/(app)/cockpit/cockpit-nav'
import ModuleHub from '@/components/cockpit/ModuleHub'
import { getEmpresaAddons } from '@/lib/addons/entitlements'
import { buildCockpitNavPermissions } from '@/utils/cockpit-nav-permissions'

export const metadata = { title: 'Compras | HuginFlow' }

export default async function ComprasHubPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const empresaAddons =
    me?.empresa_id && !isSuperAdmin ? await getEmpresaAddons(me.empresa_id) : null
  const cards = filterNavItems(
    comprasHubCards,
    isSuperAdmin,
    isSuperAdmin || me?.role_global === 'admin',
    buildCockpitNavPermissions(me),
    empresaAddons,
  )

  return (
    <ModuleHub
      title="Compras"
      description="Solicitações, cotações (até 3 fornecedores) e pedidos com alçada."
      cards={cards}
      emptyMessage="Seu grupo ou o addon Compras não liberam este módulo."
      testId="compras-hub"
    />
  )
}
