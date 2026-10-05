import { Lock } from 'lucide-react'
import Link from 'next/link'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { pedidoEditavel } from '@/lib/compras/pedido-status'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import CancelarPedidoForm from './CancelarPedidoForm'

export const metadata = { title: 'Cancelar pedido | HuginFlow' }

export default async function CancelarPedidoPage({
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
    .select('id, numero, status')
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
        <p className="text-sm text-gray-300">Este pedido não pode ser cancelado.</p>
        <Link href={`/cockpit/compras/pedidos/${pedido.id}`} className="text-sm text-[#2BAADF]">
          Voltar ao pedido
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link href={`/cockpit/compras/pedidos/${pedido.id}`} className="text-sm text-[#2BAADF]">
        Voltar ao pedido
      </Link>
      <CancelarPedidoForm pedidoId={pedido.id} numero={pedido.numero} />
    </div>
  )
}
