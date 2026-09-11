import { redirect } from 'next/navigation'
import { Boxes } from 'lucide-react'
import { getMyProfile } from '@/lib/auth/getMyProfile'
import { createAdminClient } from '@/utils/supabase/admin'
import { listAddonRegistry } from '@/lib/addons/entitlements'
import AddonsCatalogClient from './AddonsCatalogClient'

export const metadata = { title: 'Addons | HuginFlow' }

export default async function AddonsCatalogPage() {
  const me = await getMyProfile()
  if (!me || me.role_global !== 'superadmin') {
    redirect('/cockpit/acesso-negado')
  }

  const rows = await listAddonRegistry({}, createAdminClient())

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#2BAADF]/10 border border-[#2BAADF]/20 flex items-center justify-center">
          <Boxes className="w-5 h-5 text-[#2BAADF]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Catálogo de Addons</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Produtos vendáveis da plataforma. Entitlement por empresa fica na ficha do tenant.
          </p>
        </div>
      </div>

      <AddonsCatalogClient rows={rows} />
    </div>
  )
}
