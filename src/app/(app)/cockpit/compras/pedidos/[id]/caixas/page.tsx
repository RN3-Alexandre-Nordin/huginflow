import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { pedidoRecebivel } from '@/lib/compras/pedido-status'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import CaixasPainel from './CaixasPainel'

export const metadata = { title: 'Caixas do pedido | HuginFlow' }

export default async function CaixasPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        (hasPermission(me, 'compras_pedidos', 'view') || hasPermission(me, 'compras_conferencia', 'view'))))

  if (!permitido) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: config } = await supabase
    .from('com_config')
    .select('recebimento_por_caixa')
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()
  if (!config?.recebimento_por_caixa) notFound()

  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, numero, status')
    .eq('id', id)
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()
  if (!pedido) return <p className="text-sm text-gray-400">Pedido não encontrado.</p>

  const { data: caixas } = await supabase
    .from('com_caixas')
    .select('id, codigo, status, numero')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me!.empresa_id)
    .order('numero')

  const podeConferir =
    pedidoRecebivel(pedido.status) &&
    (isSuper ||
      hasPermission(me, 'compras_conferencia', 'create') ||
      hasPermission(me, 'compras_conferencia', 'edit'))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Caixas</p>
          <h1 className="text-xl font-semibold text-white">{pedido.numero}</h1>
        </div>
        <Link href={`/cockpit/compras/pedidos/${pedido.id}`} className="text-sm text-[#2BAADF]">
          Voltar
        </Link>
      </div>
      <CaixasPainel pedidoId={pedido.id} caixas={caixas || []} podeConferir={podeConferir} />
    </div>
  )
}
