import { Link2 } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import SkuDeparaBulkForm from '@/components/skus/SkuDeparaBulkForm'
import { createSkuDeparasBulk } from '../actions'

export const metadata = { title: 'Cadastro em lista — De-para SKU | HuginFlow' }

export default async function NovoSkuDeparaPage() {
  const me = await getMyProfile()
  const supabase = await createClient()

  let skusQ = supabase.from('cad_skus').select('id, codigo, nome').eq('ativo', true).order('codigo')
  let pessoasQ = supabase.from('crm_leads').select('id, nome').order('nome').limit(500)
  if (me?.role_global !== 'superadmin') {
    const emp = me?.empresa_id ?? ''
    skusQ = skusQ.eq('empresa_id', emp)
    pessoasQ = pessoasQ.eq('empresa_id', emp)
  }

  const [{ data: skus }, { data: pessoas }] = await Promise.all([skusQ, pessoasQ])

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/cadastros/sku-depara" />
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Link2 className="h-6 w-6 text-[#2BAADF]" />
            Cadastro em lista
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Lance vários de-paras de uma vez (SKU Hugin ↔ pessoa ↔ código do parceiro).
          </p>
        </div>
      </div>
      <SkuDeparaBulkForm
        skus={skus || []}
        pessoas={pessoas || []}
        cancelHref="/cockpit/cadastros/sku-depara"
        action={createSkuDeparasBulk}
        initialRows={10}
      />
    </div>
  )
}
