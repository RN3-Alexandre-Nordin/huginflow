import Link from 'next/link'
import { Eye, Lock, Plus } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { DEVOLUCAO_MOTIVO_LABEL, DEVOLUCAO_STATUS_LABEL } from '@/lib/compras/devolucao-status'
import { dataFiltroIso, diaIntervalo, textoFiltro, UUID_FILTRO } from '@/lib/compras/filtros-lista'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import PedidosFiltros from '../pedidos/PedidosFiltros'

export const metadata = { title: 'Devoluções | HuginFlow' }

function nomeEmbed(value: { nome?: string; numero?: string } | { nome?: string; numero?: string }[] | null) {
  if (!value) return ''
  const row = Array.isArray(value) ? value[0] : value
  return row?.nome || row?.numero || ''
}

export default async function DevolucoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    fornecedor?: string
    data?: string
    status?: string
    q?: string
    motivo?: string
  }>
}) {
  const filtros = await searchParams
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_devolucoes', 'view')))

  if (!permitido) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const podeCriar = isSuper || hasPermission(me, 'compras_devolucoes', 'create')
  const supabase = await createClient()
  const fornecedorId = UUID_FILTRO.test(filtros.fornecedor || '') ? filtros.fornecedor! : ''
  const statusFiltro = filtros.status && DEVOLUCAO_STATUS_LABEL[filtros.status] ? filtros.status : ''
  const motivoFiltro = filtros.motivo && DEVOLUCAO_MOTIVO_LABEL[filtros.motivo] ? filtros.motivo : ''
  const dataFiltro = dataFiltroIso(filtros.data)
  const busca = textoFiltro(filtros.q)

  let idsMotivo: string[] | null = null
  if (motivoFiltro) {
    const { data: itens } = await supabase
      .from('com_devolucao_itens')
      .select('devolucao_id')
      .eq('empresa_id', me!.empresa_id)
      .eq('motivo', motivoFiltro)
      .limit(500)
    idsMotivo = [...new Set((itens || []).map((row) => row.devolucao_id))]
  }

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

  let data: Array<{
    id: string
    numero: string
    status: string
    created_at: string
    pedido: { numero?: string } | { numero?: string }[] | null
    fornecedor: { nome?: string } | { nome?: string }[] | null
  }> | null = null
  let error: { message: string } | null = null
  if (idsMotivo && idsMotivo.length === 0) {
    data = []
  } else {
    let query = supabase
      .from('com_devolucoes')
      .select(
        'id, numero, status, created_at, pedido:com_pedidos!pedido_id(numero), fornecedor:crm_leads!fornecedor_id(nome)',
      )
      .eq('empresa_id', me!.empresa_id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (fornecedorId) query = query.eq('fornecedor_id', fornecedorId)
    if (statusFiltro) query = query.eq('status', statusFiltro)
    if (dataFiltro) {
      const dia = diaIntervalo(dataFiltro)
      query = query.gte('created_at', dia.inicio).lt('created_at', dia.fim)
    }
    if (idsMotivo) query = query.in('id', idsMotivo)
    if (busca) {
      const porPedido = pedidoIds?.length ? `,pedido_id.in.(${pedidoIds.join(',')})` : ''
      query = query.or(`numero.ilike.%${busca}%${porPedido}`)
    }
    const res = await query
    data = res.data
    error = res.error
  }

  const { data: fornecedores } = await supabase
    .from('crm_leads')
    .select('id, nome')
    .eq('empresa_id', me!.empresa_id)
    .eq('ativo', true)
    .contains('papeis', ['fornecedor'])
    .order('nome')
    .limit(500)
  const temFiltro = Boolean(fornecedorId || statusFiltro || dataFiltro || busca || motivoFiltro)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Devoluções</h1>
          <p className="text-sm text-gray-500">SKU trocado, avaria ou outro. Sem NF-e, sem título e sem movimento de estoque.</p>
        </div>
        {podeCriar ? (
          <Link
            href="/cockpit/compras/devolucoes/novo"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Nova devolução
          </Link>
        ) : null}
      </div>
      <PedidosFiltros
        fornecedores={fornecedores || []}
        statusOpcoes={Object.entries(DEVOLUCAO_STATUS_LABEL).map(([id, label]) => ({ id, label }))}
        motivoOpcoes={Object.entries(DEVOLUCAO_MOTIVO_LABEL).map(([id, label]) => ({ id, label }))}
        fornecedor={fornecedorId}
        data={dataFiltro}
        status={statusFiltro}
        busca={busca}
        motivo={motivoFiltro}
        limparHref="/cockpit/compras/devolucoes"
        rotuloData="Data da devolução"
        rotuloBusca="Documento ou pedido"
      />
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row) => (
              <tr key={row.id} className="border-t border-[#ffffff08]">
                <td className="px-4 py-3 font-mono text-[#2BAADF]">{row.numero}</td>
                <td className="px-4 py-3 text-gray-300">{nomeEmbed(row.pedido) || '—'}</td>
                <td className="px-4 py-3 text-gray-300">{nomeEmbed(row.fornecedor) || '—'}</td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(row.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {DEVOLUCAO_STATUS_LABEL[row.status] || row.status}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/cockpit/compras/devolucoes/${row.id}`}
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
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {temFiltro ? 'Nenhuma devolução com esses filtros.' : 'Nenhuma devolução.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
