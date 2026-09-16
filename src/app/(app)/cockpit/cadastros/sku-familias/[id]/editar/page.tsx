import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { notFound } from 'next/navigation'
import FamiliaForm from '../../FamiliaForm'
import { updateSkuFamilia } from '../../actions'

export const metadata = { title: 'Editar Família de SKU | HuginFlow' }

export default async function EditarSkuFamiliaPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const me = await getMyProfile()
  const supabase = await createClient()

  let q = supabase.from('cad_sku_familias').select('*').eq('id', id)
  if (me?.role_global !== 'superadmin') {
    q = q.eq('empresa_id', me?.empresa_id ?? '')
  }
  const { data: familia } = await q.maybeSingle()
  if (!familia) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Editar família</h2>
        <p className="mt-1 text-sm text-gray-400 font-medium">
          {familia.codigo} · {familia.nome}
        </p>
      </div>
      <FamiliaForm
        familia={familia}
        action={updateSkuFamilia.bind(null, id)}
        cancelHref="/cockpit/cadastros/sku-familias"
        submitLabel="Salvar"
      />
    </div>
  )
}
