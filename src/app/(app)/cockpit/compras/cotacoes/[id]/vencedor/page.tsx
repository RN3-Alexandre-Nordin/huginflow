import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import CompararVencedorForm from './CompararVencedorForm'

export const metadata = { title: 'Vencedor da cotação | HuginFlow' }

export default async function CotacaoVencedorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const [{ data: itens }, { data: forn }, { data: props }] = await Promise.all([
    supabase
      .from('com_cotacao_itens')
      .select('id, descricao, quantidade, unidade, vencedor_fornecedor_id')
      .eq('cotacao_id', cot.id)
      .eq('empresa_id', me.empresa_id),
    supabase
      .from('com_cotacao_fornecedores')
      .select(
        'fornecedor_id, ordem, prazo_texto, condicao_texto, lead:crm_leads!fornecedor_id(nome)',
      )
      .eq('cotacao_id', cot.id)
      .eq('empresa_id', me.empresa_id)
      .order('ordem'),
    supabase
      .from('com_cotacao_propostas')
      .select('cotacao_item_id, fornecedor_id, preco_unitario')
      .eq('cotacao_id', cot.id)
      .eq('empresa_id', me.empresa_id),
  ])

  const fornecedores = (forn || []).map((f) => {
    const leadRaw = f.lead as { nome?: string } | { nome?: string }[] | null
    const lead = Array.isArray(leadRaw) ? leadRaw[0] : leadRaw
    return {
      id: f.fornecedor_id,
      nome: lead?.nome?.trim() || 'Fornecedor',
      prazo: f.prazo_texto?.trim() || null,
      condicao: f.condicao_texto?.trim() || null,
    }
  })

  const podeEditar =
    (isSuper || hasPermission(me, 'compras_cotacoes', 'edit')) &&
    cot.status !== 'confirmada' &&
    cot.status !== 'cancelada'

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Vencedor</p>
          <h1 className="text-xl font-semibold text-white">{cot.numero}</h1>
        </div>
        <Link href={`/cockpit/compras/cotacoes/${cot.id}`} className="text-sm text-[#2BAADF]">
          Hub
        </Link>
      </div>

      <CompararVencedorForm
        cotacaoId={cot.id}
        status={cot.status}
        somenteLeitura={!podeEditar}
        itens={(itens || []).map((i) => ({
          id: i.id,
          descricao: i.descricao,
          quantidade: Number(i.quantidade),
          unidade: i.unidade || 'UN',
          vencedor_fornecedor_id: i.vencedor_fornecedor_id,
        }))}
        fornecedores={fornecedores}
        propostas={(props || []).map((p) => ({
          cotacao_item_id: p.cotacao_item_id,
          fornecedor_id: p.fornecedor_id,
          preco_unitario: Number(p.preco_unitario),
        }))}
      />
    </div>
  )
}
