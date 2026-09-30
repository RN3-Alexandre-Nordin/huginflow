import { Lock } from 'lucide-react'
import Link from 'next/link'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { pedidoEditavel, PEDIDO_STATUS_LABEL } from '@/lib/compras/pedido-status'
import { observacaoDoPedido } from '@/lib/compras/pedido-observacao'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import EditarPedidoForm from './EditarPedidoForm'

export const metadata = { title: 'Editar pedido | HuginFlow' }

export default async function EditarPedidoPage({
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
        hasPermission(me, 'compras_pedidos', 'edit')))

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
  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, numero, status, previsao_chegada, observacao, fornecedor_id, cotacao_id')
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  if (!pedido) return <p className="text-sm text-gray-400">Pedido não encontrado.</p>

  const { count } = await supabase
    .from('com_recebimentos')
    .select('id', { count: 'exact', head: true })
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me.empresa_id)

  if (!pedidoEditavel(pedido.status) || (count || 0) > 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-300">
          Este pedido não pode ser editado. Edição vale até o primeiro recebimento, e o cancelado
          permanece só como histórico.
        </p>
        <Link href={`/cockpit/compras/pedidos/${pedido.id}`} className="text-sm text-[#2BAADF]">
          Voltar ao pedido
        </Link>
      </div>
    )
  }

  const [{ data: itens }, { data: fornecedores }] = await Promise.all([
    supabase
      .from('com_pedido_itens')
      .select('id, descricao, quantidade, unidade, preco_unitario')
      .eq('pedido_id', pedido.id)
      .eq('empresa_id', me.empresa_id)
      .order('descricao'),
    supabase
      .from('crm_leads')
      .select('id, nome, documento')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .contains('papeis', ['fornecedor'])
      .order('nome')
      .limit(500),
  ])

  const observacao = await observacaoDoPedido(supabase, me.empresa_id, pedido)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-gray-500">Editar pedido</p>
        <h1 className="text-xl font-semibold text-white">{pedido.numero}</h1>
      </div>
      <EditarPedidoForm
        pedidoId={pedido.id}
        numero={pedido.numero}
        statusLabel={PEDIDO_STATUS_LABEL[pedido.status] || pedido.status}
        fornecedorId={pedido.fornecedor_id || ''}
        previsao={pedido.previsao_chegada || ''}
        observacao={observacao}
        fornecedores={fornecedores || []}
        valorAprovado={pedido.status === 'aprovado'}
        itensIniciais={(itens || []).map((item) => ({
          id: item.id,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: String(item.quantidade),
          preco: String(item.preco_unitario),
        }))}
      />
    </div>
  )
}
