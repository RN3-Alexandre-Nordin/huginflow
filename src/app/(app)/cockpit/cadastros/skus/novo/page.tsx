import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import SkuForm from '@/components/skus/SkuForm'
import { collectUnidadesFromSkus } from '@/lib/skus/constants'
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
    pessoasQuery,
    unitsQuery,
    familiasQuery,
  ])

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Novo SKU</h2>
        <p className="text-sm text-gray-400 mt-1">
          Produto ou serviço com unidades, estoque, fiscal e de-para.
        </p>
      </div>

      <SkuForm
        mode="create"
        pessoas={pessoas || []}
        familias={familias || []}
        knownUnits={collectUnidadesFromSkus(skuUnits || [])}
        cancelHref="/cockpit/cadastros/skus"
        submitLabel="Cadastrar SKU"
        action={createSku}
      />
    </div>
  )
}
