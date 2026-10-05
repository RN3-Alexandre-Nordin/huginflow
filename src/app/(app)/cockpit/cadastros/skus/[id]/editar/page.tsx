import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { notFound } from 'next/navigation'
import SkuForm from '@/components/skus/SkuForm'
import { updateSku } from '../../actions'
import { collectUnidadesFromSkus, type SkuRecord } from '@/lib/skus/constants'

export const metadata = { title: 'Editar SKU | HuginFlow' }

export default async function EditarSkuPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const me = await getMyProfile()
  const supabase = await createClient()

  let skuQuery = supabase.from('cad_skus').select('*').eq('id', params.id)
  if (me?.role_global !== 'superadmin') {
    skuQuery = skuQuery.eq('empresa_id', me?.empresa_id ?? '')
  }
  const { data: sku } = await skuQuery.maybeSingle()
  if (!sku) notFound()

  let pessoasQ = supabase.from('crm_leads').select('id, nome, papeis').order('nome').limit(500)
  if (me?.role_global !== 'superadmin') {
    pessoasQ = pessoasQ.eq('empresa_id', me?.empresa_id ?? '')
  }

  let unitsQuery = supabase
    .from('cad_skus')
    .select('unidade_venda, unidade_compra, unidade_estoque')
    .limit(2000)
  if (me?.role_global !== 'superadmin') {
    unitsQuery = unitsQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  let familiasQuery = supabase
    .from('cad_sku_familias')
    .select('id, codigo, nome')
    .eq('ativo', true)
    .order('ordem')
    .order('nome')
  if (me?.role_global !== 'superadmin') {
    familiasQuery = familiasQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  const [{ data: pessoas }, { data: skuUnits }, { data: familias }] = await Promise.all([
    pessoasQ,
    unitsQuery,
    familiasQuery,
  ])

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Editar SKU</h2>
        <p className="text-sm text-gray-400 mt-1 font-medium">
          {sku.codigo} · {sku.nome}
        </p>
      </div>

      <SkuForm
        mode="edit"
        sku={sku as SkuRecord}
        pessoas={pessoas || []}
        familias={familias || []}
        knownUnits={collectUnidadesFromSkus(skuUnits || [])}
        cancelHref="/cockpit/cadastros/skus"
        submitLabel="Salvar alterações"
        action={updateSku.bind(null, params.id)}
      />
    </div>
  )
}
