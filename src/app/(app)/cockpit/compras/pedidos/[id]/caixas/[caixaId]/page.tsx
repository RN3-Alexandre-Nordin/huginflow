import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import LerCaixaForm from './LerCaixaForm'

export const metadata = { title: 'Leitura da caixa | HuginFlow' }

export default async function LerCaixaPage({
  params,
}: {
  params: Promise<{ id: string; caixaId: string }>
}) {
  const { id, caixaId } = await params
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        (hasPermission(me, 'compras_conferencia', 'view') ||
          hasPermission(me, 'compras_conferencia', 'create') ||
          hasPermission(me, 'compras_conferencia', 'edit') ||
          hasPermission(me, 'compras_pedidos', 'view'))))

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

  const { data: caixa } = await supabase
    .from('com_caixas')
    .select('id, codigo, status, pedido_id')
    .eq('id', caixaId)
    .eq('pedido_id', id)
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()
  if (!caixa || caixa.status === 'cancelada') notFound()

  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('numero')
    .eq('id', caixa.pedido_id)
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()

  const { data: pedidoItens } = await supabase
    .from('com_pedido_itens')
    .select('id, descricao, unidade, quantidade')
    .eq('pedido_id', caixa.pedido_id)
    .eq('empresa_id', me!.empresa_id)

  const itemIds = (pedidoItens || []).map((item) => item.id)
  const { data: recebidos } = itemIds.length
    ? await supabase
        .from('com_recebimento_itens')
        .select('pedido_item_id, quantidade')
        .eq('empresa_id', me!.empresa_id)
        .in('pedido_item_id', itemIds)
    : { data: [] }

  const { data: daCaixa } = await supabase
    .from('com_caixa_itens')
    .select('pedido_item_id, quantidade, divergencia')
    .eq('caixa_id', caixa.id)
    .eq('empresa_id', me!.empresa_id)

  const ja = new Map<string, number>()
  for (const row of recebidos || []) {
    ja.set(row.pedido_item_id, (ja.get(row.pedido_item_id) || 0) + Number(row.quantidade))
  }
  const nesta = new Map(
    (daCaixa || []).map((row) => [row.pedido_item_id, row] as const),
  )

  const itens = (pedidoItens || []).map((item) => {
    const lido = nesta.get(item.id)
    const saldo = Number(item.quantidade) - (ja.get(item.id) || 0)
    return {
      id: item.id,
      descricao: item.descricao,
      unidade: item.unidade,
      saldo,
      quantidade: lido ? String(lido.quantidade) : '',
      divergencia: lido?.divergencia || '',
    }
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Caixa</p>
          <h1 className="font-mono text-xl font-semibold text-white">{caixa.codigo}</h1>
        </div>
        <Link href={`/cockpit/compras/pedidos/${id}/caixas`} className="text-sm text-[#2BAADF]">
          Voltar
        </Link>
      </div>
      <LerCaixaForm
        caixaId={caixa.id}
        codigo={caixa.codigo}
        pedidoNumero={pedido?.numero || ''}
        status={caixa.status}
        itensIniciais={itens}
      />
    </div>
  )
}
