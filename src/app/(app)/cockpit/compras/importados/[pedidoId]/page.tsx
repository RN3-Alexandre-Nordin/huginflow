import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { pedidoRecebivel } from '@/lib/compras/pedido-status'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import ConferenciaImportado from './ConferenciaImportado'

export const metadata = { title: 'Conferência de importados | HuginFlow' }

export default async function ConferenciaImportadoPage({
  params,
}: {
  params: Promise<{ pedidoId: string }>
}) {
  const { pedidoId } = await params
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        (hasPermission(me, 'compras_conferencia', 'create') ||
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
    .select('recebimento_importados, importados_limpeza, importados_agenda, impressora_etiqueta')
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()
  if (!config?.recebimento_importados) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-300">
          O recebimento de importados está desligado. Ligue em Compras, Configuração, aba
          Recebimento.
        </p>
        <Link href={`/cockpit/compras/pedidos/${pedidoId}`} className="text-sm text-[#2BAADF]">
          Voltar ao pedido
        </Link>
      </div>
    )
  }

  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, numero, codigo_fornecedor, status')
    .eq('id', pedidoId)
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()
  if (!pedido) return <p className="text-sm text-gray-400">Pedido não encontrado.</p>

  const { data: itens } = await supabase
    .from('com_pedido_itens')
    .select('id, descricao, quantidade, unidade')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me!.empresa_id)

  const ids = (itens || []).map((item) => item.id)
  const { data: recebidos } = ids.length
    ? await supabase
        .from('com_recebimento_itens')
        .select('pedido_item_id, quantidade')
        .eq('empresa_id', me!.empresa_id)
        .in('pedido_item_id', ids)
    : { data: [] }
  const ja = new Map<string, number>()
  for (const row of recebidos || []) {
    ja.set(row.pedido_item_id, (ja.get(row.pedido_item_id) || 0) + Number(row.quantidade))
  }

  const { data: locais } = await supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome')
    .eq('empresa_id', me!.empresa_id)
    .order('codigo')
    .limit(300)

  const linhas = (itens || []).map((item) => ({
    id: item.id,
    descricao: item.descricao,
    unidade: item.unidade,
    saldo: Number(item.quantidade) - (ja.get(item.id) || 0),
  }))

  const limpezaLabel: Record<string, string> = {
    transferencia: 'Transferência de estoque',
    baixa_manual: 'Baixa manual item a item',
    baixa_agendada: `Baixa automática ${config.importados_agenda || ''}`.trim(),
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Importados</p>
          <h1 className="text-xl font-semibold text-white">{pedido.numero}</h1>
          <p className="font-mono text-sm text-[#2BAADF]">{pedido.codigo_fornecedor}</p>
        </div>
        <Link href="/cockpit/compras/importados" className="text-sm text-[#2BAADF]">
          Outra caixa
        </Link>
      </div>
      <ConferenciaImportado
        pedidoId={pedido.id}
        podeConferir={pedidoRecebivel(pedido.status)}
        itens={linhas}
        locais={locais || []}
        limpeza={limpezaLabel[config.importados_limpeza] || config.importados_limpeza}
        impressora={config.impressora_etiqueta || 'prevista'}
      />
    </div>
  )
}
