import { ArrowLeftRight } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { notFound } from 'next/navigation'
import ConversaoUmForm from '@/components/skus/ConversaoUmForm'
import { updateConversaoUm } from '../../actions'

export const metadata = { title: 'Editar conversão UM | HuginFlow' }

export default async function EditarConversaoUmPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const me = await getMyProfile()
  const supabase = await createClient()

  let rowQ = supabase.from('cad_sku_unidade_conversao').select('*').eq('id', id)
  if (me?.role_global !== 'superadmin') {
    rowQ = rowQ.eq('empresa_id', me?.empresa_id ?? '')
  }
  const { data: row } = await rowQ.maybeSingle()
  if (!row) notFound()

  let skusQ = supabase.from('cad_skus').select('id, codigo, nome').order('codigo')
  if (me?.role_global !== 'superadmin') {
    skusQ = skusQ.eq('empresa_id', me?.empresa_id ?? '')
  }
  const { data: skus } = await skusQ

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/cadastros/conversoes-um" />
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
            <ArrowLeftRight className="h-6 w-6 text-[#2BAADF]" />
            Editar conversão
          </h2>
        </div>
      </div>
      <ConversaoUmForm
        mode="edit"
        skus={skus || []}
        initial={row}
        cancelHref="/cockpit/cadastros/conversoes-um"
        submitLabel="Salvar"
        action={(fd) => updateConversaoUm(id, fd)}
      />
    </div>
  )
}
