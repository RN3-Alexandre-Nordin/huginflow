import { Lock } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { type TipoCompra } from '@/lib/compras/tipos'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import SolicitacaoForm from '../../novo/SolicitacaoForm'

export const metadata = { title: 'Editar solicitação | HuginFlow' }

export default async function EditarSolicitacaoPage({
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
      (!!me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_solicitacoes', 'edit')))

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
  const { data: sol } = await supabase
    .from('com_solicitacoes')
    .select(
      'id, numero, tipo, status, data_necessidade, observacao, solicitante_pessoa_id',
    )
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  if (!sol || sol.status === 'rascunho') {
    redirect('/cockpit/compras/solicitacoes')
  }

  const { count: cotCount } = await supabase
    .from('com_cotacoes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', me.empresa_id)
    .eq('solicitacao_id', sol.id)

  if ((cotCount || 0) > 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-400">
          Esta solicitação já tem cotação e não pode ser editada.
        </p>
        <BackTextButton className="text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const [{ data: pessoas }, { data: skus }, { data: servicos }, { data: itens }] =
    await Promise.all([
      supabase
        .from('crm_leads')
        .select('id, nome, documento, email')
        .eq('empresa_id', me.empresa_id)
        .eq('ativo', true)
        .contains('papeis', ['funcionario'])
        .order('nome')
        .limit(500),
      supabase
        .from('cad_skus')
        .select('id, codigo, nome, unidade_compra, preco_custo')
        .eq('empresa_id', me.empresa_id)
        .eq('ativo', true)
        .order('codigo')
        .limit(2000),
      supabase
        .from('cad_servicos')
        .select('id, codigo, nome, unidade, preco_referencia')
        .eq('empresa_id', me.empresa_id)
        .eq('ativo', true)
        .order('codigo')
        .limit(2000),
      supabase
        .from('com_solicitacao_itens')
        .select('sku_id, servico_id, descricao, quantidade, unidade')
        .eq('solicitacao_id', sol.id)
        .eq('empresa_id', me.empresa_id),
    ])

  const skuById = new Map((skus || []).map((s) => [s.id, s]))
  const servById = new Map((servicos || []).map((s) => [s.id, s]))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Editar solicitação</h1>
        <p className="text-sm text-gray-500">
          Número <span className="font-mono text-[#2BAADF]">{sol.numero}</span> (não muda).
        </p>
      </div>
      <SolicitacaoForm
        mode="edit"
        solicitacaoId={sol.id}
        numero={sol.numero}
        pessoas={pessoas || []}
        skus={skus || []}
        servicos={servicos || []}
        defaultSolicitanteId={sol.solicitante_pessoa_id || ''}
        initial={{
          solicitanteId: sol.solicitante_pessoa_id || '',
          tipo: sol.tipo as TipoCompra,
          dataNecessidade: sol.data_necessidade || '',
          observacao: sol.observacao || '',
          itens: (itens || []).map((i) => {
            const sku = i.sku_id ? skuById.get(i.sku_id) : null
            const serv = i.servico_id ? servById.get(i.servico_id) : null
            const preco = sku
              ? Number(sku.preco_custo ?? 0)
              : serv
                ? Number(serv.preco_referencia ?? 0)
                : 0
            return {
              sku_id: i.sku_id || '',
              servico_id: i.servico_id || '',
              descricao: i.descricao,
              quantidade: String(i.quantidade),
              unidade: i.unidade || 'UN',
              preco: Number.isFinite(preco) && preco ? String(preco) : '',
            }
          }),
        }}
      />
    </div>
  )
}
