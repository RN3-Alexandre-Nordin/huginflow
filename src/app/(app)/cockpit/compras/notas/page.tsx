import Link from 'next/link'
import { Eye, Lock, Plus } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { dataFiltroIso, textoFiltro, UUID_FILTRO } from '@/lib/compras/filtros-lista'
import { NOTA_STATUS_LABEL } from '@/lib/compras/nota-status'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import PedidosFiltros from '../pedidos/PedidosFiltros'

export const metadata = { title: 'Notas de entrada | HuginFlow' }

function nomeEmbed(value: { nome?: string; numero?: string } | { nome?: string; numero?: string }[] | null) {
  if (!value) return ''
  const row = Array.isArray(value) ? value[0] : value
  return row?.nome || row?.numero || ''
}

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ fornecedor?: string; data?: string; status?: string; q?: string }>
}) {
  const filtros = await searchParams
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_notas', 'view')))

  if (!permitido) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const podeLancar = isSuper || hasPermission(me, 'compras_notas', 'create')
  const supabase = await createClient()
  const fornecedorId = UUID_FILTRO.test(filtros.fornecedor || '') ? filtros.fornecedor! : ''
  const statusFiltro = filtros.status && NOTA_STATUS_LABEL[filtros.status] ? filtros.status : ''
  const dataFiltro = dataFiltroIso(filtros.data)
  const busca = textoFiltro(filtros.q)

  let pedidoIds: string[] | null = null
  if (busca) {
    const { data: pedidos } = await supabase
      .from('com_pedidos')
      .select('id')
      .eq('empresa_id', me!.empresa_id)
      .ilike('numero', `%${busca}%`)
      .limit(50)
    pedidoIds = (pedidos || []).map((row) => row.id)
  }

  let query = supabase
    .from('com_notas')
    .select(
      'id, numero, serie, data_emissao, valor_total, status, pedido:com_pedidos!pedido_id(numero), fornecedor:crm_leads!fornecedor_id(nome)',
    )
    .eq('empresa_id', me!.empresa_id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (fornecedorId) query = query.eq('fornecedor_id', fornecedorId)
  if (statusFiltro) query = query.eq('status', statusFiltro)
  if (dataFiltro) query = query.eq('data_emissao', dataFiltro)
  if (busca) {
    const porPedido = pedidoIds?.length ? `,pedido_id.in.(${pedidoIds.join(',')})` : ''
    query = query.or(`numero.ilike.%${busca}%${porPedido}`)
  }
  const { data, error } = await query

  const { data: fornecedores } = await supabase
    .from('crm_leads')
    .select('id, nome')
    .eq('empresa_id', me!.empresa_id)
    .eq('ativo', true)
    .contains('papeis', ['fornecedor'])
    .order('nome')
    .limit(500)
  const temFiltro = Boolean(fornecedorId || statusFiltro || dataFiltro || busca)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Notas de entrada</h1>
          <p className="text-sm text-gray-500">Confirmar a nota não movimenta o estoque.</p>
        </div>
        {podeLancar ? (
          <Link
            href="/cockpit/compras/notas/novo"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Lançar nota
          </Link>
        ) : null}
      </div>
      <PedidosFiltros
        fornecedores={fornecedores || []}
        statusOpcoes={Object.entries(NOTA_STATUS_LABEL).map(([id, label]) => ({ id, label }))}
        fornecedor={fornecedorId}
        data={dataFiltro}
        status={statusFiltro}
        busca={busca}
        limparHref="/cockpit/compras/notas"
        rotuloData="Emissão"
        rotuloBusca="Nota ou pedido"
      />
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Nota</th>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Emissão</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row) => (
              <tr key={row.id} className="border-t border-[#ffffff08]">
                <td className="px-4 py-3">
                  <Link className="text-[#2BAADF]" href={`/cockpit/compras/notas/${row.id}`}>
                    {row.numero}/{row.serie}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-300">{nomeEmbed(row.pedido) || '—'}</td>
                <td className="px-4 py-3 text-gray-300">{nomeEmbed(row.fornecedor) || '—'}</td>
                <td className="px-4 py-3 text-gray-400">
                  {row.data_emissao
                    ? new Date(`${row.data_emissao}T12:00:00`).toLocaleDateString('pt-BR')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {Number(row.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-4 py-3 text-gray-300">{NOTA_STATUS_LABEL[row.status] || row.status}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/cockpit/compras/notas/${row.id}`}
                    title="Abrir"
                    className="inline-flex rounded-lg p-2 text-gray-400 hover:bg-[#ffffff08] hover:text-[#2BAADF]"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
            {!data?.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  {temFiltro ? 'Nenhuma nota com esses filtros.' : 'Nenhuma nota lançada.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
