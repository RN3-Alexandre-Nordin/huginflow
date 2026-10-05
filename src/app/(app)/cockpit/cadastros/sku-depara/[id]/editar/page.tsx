import { Link2 } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { notFound } from 'next/navigation'
import SkuDeparaForm from '@/components/skus/SkuDeparaForm'
import { updateSkuDepara } from '../../actions'

export const metadata = { title: 'Editar de-para SKU | HuginFlow' }

export default async function EditarSkuDeparaPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const me = await getMyProfile()
  const supabase = await createClient()

  let rowQ = supabase.from('cad_sku_depara').select('*').eq('id', id)
  if (me?.role_global !== 'superadmin') {
    rowQ = rowQ.eq('empresa_id', me?.empresa_id ?? '')
  }
  const { data: row } = await rowQ.maybeSingle()
  if (!row) notFound()

  let skusQ = supabase.from('cad_skus').select('id, codigo, nome').order('codigo')
  let pessoasQ = supabase.from('crm_leads').select('id, nome').order('nome').limit(500)
  if (me?.role_global !== 'superadmin') {
    const emp = me?.empresa_id ?? ''
    skusQ = skusQ.eq('empresa_id', emp)
    pessoasQ = pessoasQ.eq('empresa_id', emp)
  }
  const [{ data: skus }, { data: pessoas }] = await Promise.all([skusQ, pessoasQ])

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/cadastros/sku-depara" />
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Link2 className="h-6 w-6 text-[#2BAADF]" />
            Editar de-para
          </h2>
        </div>
      </div>
      <SkuDeparaForm
        skus={skus || []}
        pessoas={pessoas || []}
        initial={row}
        cancelHref="/cockpit/cadastros/sku-depara"
        submitLabel="Salvar"
        action={(fd) => updateSkuDepara(id, fd)}
      />
    </div>
  )
}
