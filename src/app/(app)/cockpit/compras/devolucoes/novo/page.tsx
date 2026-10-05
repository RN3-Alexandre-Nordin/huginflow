import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { carregarPedidoParaDevolucao } from '@/lib/compras/devolucao-pedidos'
import { UUID_FILTRO } from '@/lib/compras/filtros-lista'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import DevolucaoForm from './DevolucaoForm'

export const metadata = { title: 'Nova devolução | HuginFlow' }

export default async function NovaDevolucaoPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>
}) {
  const { pedido } = await searchParams
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_devolucoes', 'create')))

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
  const [{ data: fornecedores }, carregado] = await Promise.all([
    supabase
      .from('crm_leads')
      .select('id, nome')
      .eq('empresa_id', me!.empresa_id)
      .eq('ativo', true)
      .contains('papeis', ['fornecedor'])
      .order('nome')
      .limit(500),
    UUID_FILTRO.test(pedido || '')
      ? carregarPedidoParaDevolucao(supabase, me!.empresa_id, pedido!)
      : Promise.resolve(null),
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Nova devolução</h1>
        <Link href="/cockpit/compras/devolucoes" className="text-sm text-[#2BAADF]">
          Voltar
        </Link>
      </div>
      {carregado?.error ? <p className="text-sm text-amber-300">{carregado.error}</p> : null}
      <DevolucaoForm fornecedores={fornecedores || []} pedidoInicial={carregado?.pedido || null} />
    </div>
  )
}
