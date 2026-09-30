import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { pedidoPodeNota } from '@/lib/compras/nota-status'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import NotaForm, { type PedidoNotaOption } from './NotaForm'

export const metadata = { title: 'Nova nota de entrada | HuginFlow' }

function nomeEmbed(value: { nome?: string; documento?: string | null } | { nome?: string; documento?: string | null }[] | null) {
  if (!value) return { nome: '', documento: '' }
  const row = Array.isArray(value) ? value[0] : value
  return { nome: row?.nome || '', documento: row?.documento || '' }
}

export default async function NovaNotaPage({
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
        hasPermission(me, 'compras_notas', 'create')))

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
  const { data } = await supabase
    .from('com_pedidos')
    .select(
      'id, numero, status, fornecedor:crm_leads!fornecedor_id(nome, documento), itens:com_pedido_itens(id, sku_id, descricao, quantidade, unidade, preco_unitario)',
    )
    .eq('empresa_id', me!.empresa_id)
    .in('status', ['aprovado', 'recebido_parcial', 'recebido'])
    .order('created_at', { ascending: false })
    .limit(50)

  const pedidos: PedidoNotaOption[] = (data || [])
    .filter((row) => pedidoPodeNota(row.status))
    .map((row) => {
      const fornecedor = nomeEmbed(row.fornecedor)
      const itens = (Array.isArray(row.itens) ? row.itens : []) as {
        id: string
        sku_id: string | null
        descricao: string
        quantidade: number
        unidade: string
        preco_unitario: number
      }[]
      return {
        id: row.id,
        numero: row.numero,
        status: row.status,
        fornecedorNome: fornecedor.nome || '—',
        fornecedorDocumento: fornecedor.documento,
        itens: itens.map((item) => ({
          id: item.id,
          skuId: item.sku_id,
          descricao: item.descricao,
          quantidade: String(item.quantidade),
          unidade: item.unidade,
          preco: String(item.preco_unitario),
        })),
      }
    })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Nova nota de entrada</h1>
        <Link href="/cockpit/compras/notas" className="text-sm text-[#2BAADF]">
          Voltar
        </Link>
      </div>
      <NotaForm pedidos={pedidos} pedidoInicial={pedido} />
    </div>
  )
}
