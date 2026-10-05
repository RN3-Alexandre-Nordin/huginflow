import { ArrowLeftRight } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import ConversaoUmForm from '@/components/skus/ConversaoUmForm'
import { createConversaoUm } from '../actions'

export const metadata = { title: 'Nova conversão UM | HuginFlow' }

export default async function NovaConversaoUmPage() {
  const me = await getMyProfile()
  const supabase = await createClient()
  let skusQ = supabase.from('cad_skus').select('id, codigo, nome').eq('ativo', true).order('codigo')
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
            Nova conversão
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Deixe SKU vazio para regra genérica da empresa.
          </p>
        </div>
      </div>
      <ConversaoUmForm
        mode="create"
        skus={skus || []}
        cancelHref="/cockpit/cadastros/conversoes-um"
        submitLabel="Cadastrar"
        action={createConversaoUm}
      />
    </div>
  )
}
