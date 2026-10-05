import { ScanBarcode } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { comprasHubCards, filterNavItems } from '@/app/(app)/cockpit/cockpit-nav'
import ModuleHub from '@/components/cockpit/ModuleHub'
import { getEmpresaAddons } from '@/lib/addons/entitlements'
import { buildCockpitNavPermissions } from '@/utils/cockpit-nav-permissions'
import { createClient } from '@/utils/supabase/server'

export const metadata = { title: 'Compras | HuginFlow' }

export default async function ComprasHubPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const empresaAddons =
    me?.empresa_id && !isSuperAdmin ? await getEmpresaAddons(me.empresa_id) : null
  const cards = [...filterNavItems(
    comprasHubCards,
    isSuperAdmin,
    isSuperAdmin || me?.role_global === 'admin',
    buildCockpitNavPermissions(me),
    empresaAddons,
  )]

  if (me?.empresa_id) {
    const supabase = await createClient()
    const { data: config } = await supabase
      .from('com_config')
      .select('recebimento_importados')
      .eq('empresa_id', me.empresa_id)
      .maybeSingle()
    if (config?.recebimento_importados) {
      cards.push(
        ...filterNavItems(
          [
            {
              name: 'Importados',
              href: '/cockpit/compras/importados',
              icon: ScanBarcode,
              permissionModule: 'compras_conferencia',
              addon: 'compras',
              description: 'Ler a caixa do fornecedor e conferir a etiqueta do item',
              testId: 'hub-card-compras-importados',
            },
          ],
          isSuperAdmin,
          isSuperAdmin || me?.role_global === 'admin',
          buildCockpitNavPermissions(me),
          empresaAddons,
        ),
      )
    }
  }

  return (
    <ModuleHub
      title="Compras"
      description="Solicitações, pedidos, notas e relatórios de leitura."
      cards={cards}
      emptyMessage="Seu grupo ou o addon Compras não liberam este módulo."
      testId="compras-hub"
    />
  )
}
