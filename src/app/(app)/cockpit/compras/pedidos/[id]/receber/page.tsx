import { Lock } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { pedidoRecebivel } from '@/lib/compras/pedido-status'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import ReceberPedidoForm from './ReceberPedidoForm'

export const metadata = { title: 'Receber pedido | HuginFlow' }

export default async function ReceberPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const pode =
    isSuper ||
    hasPermission(me, 'compras_conferencia', 'create') ||
    hasPermission(me, 'compras_conferencia', 'edit')
  const permitido =
    !!me &&
    (isSuper ||
      (!!me.empresa_id && (await empresaHasAddon(me.empresa_id, 'compras')) && pode))

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
  const { data: configCaixa } = await supabase
    .from('com_config')
    .select('recebimento_por_caixa')
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (configCaixa?.recebimento_por_caixa) notFound()

  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, numero, status')
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  if (!pedido) return <p className="text-sm text-gray-400">Pedido não encontrado.</p>
  if (!pedidoRecebivel(pedido.status)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-300">
          Recebimento começa depois da aprovação e segue até fechar o saldo.
        </p>
        <Link href={`/cockpit/compras/pedidos/${pedido.id}`} className="text-sm text-[#2BAADF]">
          Voltar ao pedido
        </Link>
      </div>
    )
  }

  const { data: itens } = await supabase
    .from('com_pedido_itens')
    .select('id, descricao, quantidade, unidade')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me.empresa_id)
    .order('descricao')

  const ids = (itens || []).map((i) => i.id)
  const recebido = new Map<string, number>()
  if (ids.length) {
    const { data: anteriores } = await supabase
      .from('com_recebimento_itens')
      .select('pedido_item_id, quantidade')
      .eq('empresa_id', me.empresa_id)
      .in('pedido_item_id', ids)
    for (const row of anteriores || []) {
      recebido.set(row.pedido_item_id, (recebido.get(row.pedido_item_id) || 0) + Number(row.quantidade))
    }
  }

  const abertos = (itens || [])
    .map((item) => ({
      id: item.id,
      descricao: item.descricao,
      unidade: item.unidade,
      pedido: Number(item.quantidade),
      recebido: recebido.get(item.id) || 0,
    }))
    .filter((item) => item.pedido - item.recebido > 0.0001)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Conferência</p>
          <h1 className="text-xl font-semibold text-white">{pedido.numero}</h1>
        </div>
        <Link href={`/cockpit/compras/pedidos/${pedido.id}`} className="text-sm text-[#2BAADF]">
          Voltar ao pedido
        </Link>
      </div>
      {abertos.length ? (
        <ReceberPedidoForm pedidoId={pedido.id} numero={pedido.numero} itens={abertos} />
      ) : (
        <p className="text-sm text-gray-400">Não há saldo em aberto neste pedido.</p>
      )}
    </div>
  )
}
