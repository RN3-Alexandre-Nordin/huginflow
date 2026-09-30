import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import CotacaoHub from './CotacaoHub'

export const metadata = { title: 'Cotação | HuginFlow' }

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  em_cotacao: 'Em cotação',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
}

export default async function CotacaoDetalhePage({
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
    .select(
      'id, numero, tipo, status, observacao, solicitacao:com_solicitacoes!solicitacao_id(numero)',
    )
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  if (!cot) {
    return <p className="text-sm text-gray-400">Cotação não encontrada.</p>
  }

  const [{ data: itens }, { data: forn }, { data: props }, { data: cadastro }] = await Promise.all([
    supabase
      .from('com_cotacao_itens')
      .select('id')
      .eq('cotacao_id', cot.id)
      .eq('empresa_id', me.empresa_id),
    supabase
      .from('com_cotacao_fornecedores')
      .select(
        'fornecedor_id, prazo_texto, condicao_texto, ordem, lead:crm_leads!fornecedor_id(nome, documento)',
      )
      .eq('cotacao_id', cot.id)
      .eq('empresa_id', me.empresa_id)
      .order('ordem'),
    supabase
      .from('com_cotacao_propostas')
      .select('cotacao_item_id, fornecedor_id, preco_unitario')
      .eq('cotacao_id', cot.id)
      .eq('empresa_id', me.empresa_id),
    supabase
      .from('crm_leads')
      .select('id, nome, documento')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .contains('papeis', ['fornecedor'])
      .order('nome')
      .limit(500),
  ])

  const totalItens = (itens || []).length
  const itemIds = new Set((itens || []).map((i) => i.id))

  const precosPorForn = new Map<string, Set<string>>()
  for (const p of props || []) {
    if (!itemIds.has(p.cotacao_item_id)) continue
    if (p.preco_unitario == null) continue
    const set = precosPorForn.get(p.fornecedor_id) || new Set()
    set.add(p.cotacao_item_id)
    precosPorForn.set(p.fornecedor_id, set)
  }

  // Cada item tem ≥1 preço?
  const itensComPreco = new Set((props || []).map((p) => p.cotacao_item_id))
  const podeComparar = totalItens > 0 && [...itemIds].every((iid) => itensComPreco.has(iid))

  const hubForns = (forn || []).map((f) => {
    const leadRaw = f.lead as
      | { nome?: string; documento?: string | null }
      | { nome?: string; documento?: string | null }[]
      | null
    const lead = Array.isArray(leadRaw) ? leadRaw[0] : leadRaw
    return {
      fornecedor_id: f.fornecedor_id,
      nome: lead?.nome?.trim() || 'Fornecedor',
      documento: lead?.documento ?? null,
      prazo_texto: f.prazo_texto,
      condicao_texto: f.condicao_texto,
      precosPreenchidos: precosPorForn.get(f.fornecedor_id)?.size || 0,
      totalItens,
    }
  })

  const sol = cot.solicitacao as { numero?: string } | { numero?: string }[] | null
  const solNum = Array.isArray(sol) ? sol[0]?.numero : sol?.numero
  const podeEditar =
    (isSuper || hasPermission(me, 'compras_cotacoes', 'edit')) &&
    cot.status !== 'confirmada' &&
    cot.status !== 'cancelada'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Cotação</p>
          <h1 className="text-xl font-semibold text-white">{cot.numero}</h1>
          <p className="text-sm text-gray-500">
            {TIPO_COMPRA_LABEL[cot.tipo as TipoCompra]}
            {solNum ? ` · Solicitação ${solNum}` : ''}
            {` · ${STATUS_LABEL[cot.status] || cot.status}`}
            {cot.observacao ? ` · ${cot.observacao}` : ''}
          </p>
        </div>
        <Link href="/cockpit/compras/cotacoes" className="text-sm text-[#2BAADF]">
          Voltar à lista
        </Link>
      </div>

      <CotacaoHub
        cotacaoId={cot.id}
        status={cot.status}
        fornecedores={hubForns}
        cadastro={cadastro || []}
        totalItens={totalItens}
        podeComparar={podeComparar && podeEditar}
        somenteLeitura={!podeEditar}
      />
    </div>
  )
}
