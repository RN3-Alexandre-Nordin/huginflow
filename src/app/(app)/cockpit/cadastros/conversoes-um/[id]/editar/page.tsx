import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { notFound } from 'next/navigation'
import ConversaoUmForm from '@/components/skus/ConversaoUmForm'
import {
  collectUnidadesFromConversoes,
  collectUnidadesFromSkus,
  mergeKnownUnidades,
} from '@/lib/skus/constants'
import { updateConversaoUm } from '../../actions'

export const metadata = { title: 'Editar conversão UM | HuginFlow' }

export default async function EditarConversaoUmPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const me = await getMyProfile()
  const supabase = await createClient()
  const empresaId = me?.empresa_id ?? ''
  const isSuper = me?.role_global === 'superadmin'

  let rowQ = supabase.from('cad_sku_unidade_conversao').select('*').eq('id', id)
  if (!isSuper) rowQ = rowQ.eq('empresa_id', empresaId)
  const { data: row } = await rowQ.maybeSingle()
  if (!row) notFound()

  let skusQ = supabase
    .from('cad_skus')
    .select('id, codigo, nome, unidade_venda, unidade_compra, unidade_estoque')
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
    [row.unidade_origem, row.unidade_destino],
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Editar conversão</h2>
        <p className="mt-1 text-sm font-medium text-gray-400">
          {row.unidade_origem} → {row.unidade_destino}
          {row.fator_conversao != null ? ` · fator ${row.fator_conversao}` : ''}
        </p>
      </div>

      <ConversaoUmForm
        mode="edit"
        skus={(skus || []).map(({ id: skuId, codigo, nome }) => ({
          id: skuId,
          codigo,
          nome,
        }))}
        knownUnits={knownUnits}
        initial={row}
        cancelHref="/cockpit/cadastros/conversoes-um"
        submitLabel="Salvar"
        action={updateConversaoUm.bind(null, id)}
      />
    </div>
  )
}
