import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import PropostaFornecedorForm from './PropostaFornecedorForm'

export const metadata = { title: 'Proposta do fornecedor | HuginFlow' }

export default async function PropostaFornecedorPage({
  params,
}: {
  params: Promise<{ id: string; fornecedorId: string }>
}) {
  const { id, fornecedorId } = await params
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_cotacoes', 'view')))

  if (!permitido || !me?.empresa_id) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: cot } = await supabase
    .from('com_cotacoes')
    .select('id, numero, status')
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  if (!cot) {
    return <p className="text-sm text-gray-400">Cotação não encontrada.</p>
  }

  const { data: vinculo } = await supabase
    .from('com_cotacao_fornecedores')
    .select('fornecedor_id, lead:crm_leads!fornecedor_id(nome)')
    .eq('cotacao_id', cot.id)
    .eq('empresa_id', me.empresa_id)
    .eq('fornecedor_id', fornecedorId)
    .maybeSingle()

  if (!vinculo) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-400">Fornecedor não faz parte desta cotação.</p>
        <Link href={`/cockpit/compras/cotacoes/${cot.id}`} className="text-sm text-[#2BAADF]">
          Voltar ao hub
        </Link>
      </div>
    )
  }

  const leadRaw = vinculo.lead as { nome?: string } | { nome?: string }[] | null
  const lead = Array.isArray(leadRaw) ? leadRaw[0] : leadRaw
  const fornecedorNome = lead?.nome?.trim() || 'Fornecedor'

  const [{ data: itens }, { data: props }] = await Promise.all([
    supabase
      .from('com_cotacao_itens')
      .select('id, descricao, quantidade, unidade')
      .eq('cotacao_id', cot.id)
      .eq('empresa_id', me.empresa_id),
    supabase
      .from('com_cotacao_propostas')
      .select('cotacao_item_id, preco_unitario')
      .eq('cotacao_id', cot.id)
      .eq('empresa_id', me.empresa_id)
      .eq('fornecedor_id', fornecedorId),
  ])

  const precoMap = new Map(
    (props || []).map((p) => [p.cotacao_item_id, String(p.preco_unitario)]),
  )

  const podeEditar =
    (isSuper || hasPermission(me, 'compras_cotacoes', 'edit')) &&
    cot.status !== 'confirmada' &&
    cot.status !== 'cancelada'

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Preços</p>
          <h1 className="text-xl font-semibold text-white">{cot.numero}</h1>
        </div>
        <Link href={`/cockpit/compras/cotacoes/${cot.id}`} className="text-sm text-[#2BAADF]">
          Hub
        </Link>
      </div>

      <PropostaFornecedorForm
        cotacaoId={cot.id}
        cotacaoNumero={cot.numero}
        fornecedorId={fornecedorId}
        fornecedorNome={fornecedorNome}
        somenteLeitura={!podeEditar}
        itens={(itens || []).map((i) => ({
          id: i.id,
          descricao: i.descricao,
          quantidade: Number(i.quantidade),
          unidade: i.unidade || 'UN',
          preco: precoMap.get(i.id) || '',
        }))}
      />
    </div>
  )
}
