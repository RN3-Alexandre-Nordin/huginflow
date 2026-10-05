import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import ConversaoUmForm from '@/components/skus/ConversaoUmForm'
import {
  collectUnidadesFromConversoes,
  collectUnidadesFromSkus,
  mergeKnownUnidades,
} from '@/lib/skus/constants'
import { createConversaoUm } from '../actions'

export const metadata = { title: 'Nova conversão UM | HuginFlow' }

export default async function NovaConversaoUmPage() {
  const me = await getMyProfile()
  const supabase = await createClient()
  const empresaId = me?.empresa_id ?? ''
  const isSuper = me?.role_global === 'superadmin'

  let skusQ = supabase
    .from('cad_skus')
    .select('id, codigo, nome, unidade_venda, unidade_compra, unidade_estoque')
    .eq('ativo', true)
    .order('codigo')
  if (!isSuper) skusQ = skusQ.eq('empresa_id', empresaId)

  let convQ = supabase
    .from('cad_sku_unidade_conversao')
    .select('unidade_origem, unidade_destino')
    .limit(2000)
  if (!isSuper) convQ = convQ.eq('empresa_id', empresaId)

  const [{ data: skus }, { data: conversoes }] = await Promise.all([skusQ, convQ])

  const knownUnits = mergeKnownUnidades(
    collectUnidadesFromSkus(skus || []),
    collectUnidadesFromConversoes(conversoes || []),
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Nova conversão</h2>
        <p className="mt-1 text-sm font-medium text-gray-400">
          Deixe SKU vazio para regra genérica da empresa.
        </p>
      </div>

      <ConversaoUmForm
        mode="create"
        skus={(skus || []).map(({ id, codigo, nome }) => ({ id, codigo, nome }))}
        knownUnits={knownUnits}
        cancelHref="/cockpit/cadastros/conversoes-um"
        submitLabel="Cadastrar"
        action={createConversaoUm}
      />
    </div>
  )
}
