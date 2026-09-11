import { Package } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import SkuForm from '@/components/skus/SkuForm'
import { createSku } from '../actions'

export const metadata = { title: 'Novo SKU | HuginFlow' }

export default async function NovoSkuPage() {
  const me = await getMyProfile()
  const supabase = await createClient()

  let pessoasQuery = supabase
    .from('crm_leads')
    .select('id, nome, papeis')
    .order('nome')
    .limit(500)

  if (me?.role_global !== 'superadmin') {
    pessoasQuery = pessoasQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { data: pessoas } = await pessoasQuery

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/cadastros/skus" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Package className="w-6 h-6 text-[#2BAADF]" />
            Novo SKU
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Produto ou serviço com unidades, estoque, fiscal e de-para.
          </p>
        </div>
      </div>

      <SkuForm
        mode="create"
        pessoas={pessoas || []}
        cancelHref="/cockpit/cadastros/skus"
        submitLabel="Cadastrar SKU"
        action={createSku}
      />
    </div>
  )
}
