import Link from 'next/link'
import { Ban, Eye, Lock, Package, Pencil } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import {
  PEDIDO_STATUS_LABEL,
  pedidoEditavel,
  pedidoRecebivel,
} from '@/lib/compras/pedido-status'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import PedidosFiltros from './PedidosFiltros'

export const metadata = { title: 'Pedidos de compra | HuginFlow' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function diaPedido(isoDate: string) {
  const inicio = new Date(`${isoDate}T00:00:00-03:00`)
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

function nomeEmbed(value: { nome?: string } | { nome?: string }[] | null | undefined) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.nome || '' : value.nome || ''
}

function solicitanteEmbed(cotacao: unknown) {
  const cot = (Array.isArray(cotacao) ? cotacao[0] : cotacao) as
    | { solicitacao?: { solicitante?: { nome?: string } | { nome?: string }[] | null } | Array<{ solicitante?: { nome?: string } | { nome?: string }[] | null }> | null }
    | null
    | undefined
  const solRaw = cot?.solicitacao
  const sol = Array.isArray(solRaw) ? solRaw[0] : solRaw
  return sol?.solicitante
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ fornecedor?: string; data?: string; solicitante?: string; status?: string }>
}) {
  const filtros = await searchParams
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_pedidos', 'view')))

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
  const fornecedorId = UUID.test(filtros.fornecedor || '') ? filtros.fornecedor! : ''
  const solicitanteId = UUID.test(filtros.solicitante || '') ? filtros.solicitante! : ''
  const statusFiltro =
    filtros.status && filtros.status !== 'rascunho' && PEDIDO_STATUS_LABEL[filtros.status]
      ? filtros.status
      : ''
  const dataFiltro = /^\d{4}-\d{2}-\d{2}$/.test(filtros.data || '') ? filtros.data! : ''

  let cotacaoIds: string[] | null = null
  if (solicitanteId) {
    const { data: solicitacoes } = await supabase
      .from('com_solicitacoes')
      .select('id')
      .eq('empresa_id', me!.empresa_id)
      .eq('solicitante_pessoa_id', solicitanteId)
      .limit(500)
    const solIds = (solicitacoes || []).map((row) => row.id)
    if (!solIds.length) {
      cotacaoIds = []
    } else {
      const { data: cotacoes } = await supabase
        .from('com_cotacoes')
        .select('id')
        .eq('empresa_id', me!.empresa_id)
        .in('solicitacao_id', solIds)
        .limit(500)
      cotacaoIds = (cotacoes || []).map((row) => row.id)
    }
  }

  let data: Array<{
    id: string
    numero: string
    tipo: string
    status: string
    valor_total: number | string
    created_at: string
    fornecedor: { nome?: string } | { nome?: string }[] | null
    recebimentos: { id: string }[] | { id: string } | null
    cotacao: unknown
  }> | null = null
  let error: { message: string } | null = null
  if (cotacaoIds && cotacaoIds.length === 0) {
    data = []
  } else {
    let query = supabase
      .from('com_pedidos')
      .select(
        'id, numero, tipo, status, valor_total, previsao_chegada, origem, created_at, fornecedor:crm_leads!fornecedor_id(nome), recebimentos:com_recebimentos(id), cotacao:com_cotacoes!cotacao_id(solicitacao:com_solicitacoes!solicitacao_id(solicitante:crm_leads!solicitante_pessoa_id(nome)))',
      )
      .eq('empresa_id', me!.empresa_id)
      .neq('status', 'rascunho')
      .order('created_at', { ascending: false })
      .limit(50)
    if (fornecedorId) query = query.eq('fornecedor_id', fornecedorId)
    if (statusFiltro) query = query.eq('status', statusFiltro)
    if (dataFiltro) {
      const dia = diaPedido(dataFiltro)
      query = query.gte('created_at', dia.inicio).lt('created_at', dia.fim)
    }
    if (cotacaoIds) query = query.in('cotacao_id', cotacaoIds)
    const res = await query
    data = res.data as typeof data
    error = res.error
  }

  const [{ data: fornecedores }, { data: solicitantes }] = await Promise.all([
    supabase
      .from('crm_leads')
      .select('id, nome')
      .eq('empresa_id', me!.empresa_id)
      .eq('ativo', true)
      .contains('papeis', ['fornecedor'])
      .order('nome')
      .limit(500),
    supabase
      .from('crm_leads')
      .select('id, nome')
      .eq('empresa_id', me!.empresa_id)
      .eq('ativo', true)
      .contains('papeis', ['funcionario'])
      .order('nome')
      .limit(500),
  ])

  const podeImportar = isSuper || hasPermission(me, 'compras_pedidos', 'create')
  const podeEditar = isSuper || hasPermission(me, 'compras_pedidos', 'edit')
  const podeReceber =
    isSuper ||
    hasPermission(me, 'compras_conferencia', 'create') ||
    hasPermission(me, 'compras_conferencia', 'edit')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Pedidos</h1>
          <p className="text-sm text-gray-500">
            Edite ou cancele antes do recebimento. A conferência começa após a aprovação.
          </p>
        </div>
        {podeImportar ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/cockpit/compras/pedidos/novo"
              className="rounded-xl bg-[#2BAADF] px-4 py-2 text-sm font-semibold text-white"
            >
              Novo pedido
            </Link>
            <Link
              href="/cockpit/compras/pedidos/import"
              className="rounded-xl border border-[#ffffff14] px-4 py-2 text-sm font-semibold text-gray-300"
            >
              Importar planilha
            </Link>
          </div>
        ) : null}
      </div>
      <PedidosFiltros
        fornecedores={fornecedores || []}
        solicitantes={solicitantes || []}
        statusOpcoes={Object.entries(PEDIDO_STATUS_LABEL)
          .filter(([id]) => id !== 'rascunho')
          .map(([id, label]) => ({ id, label }))}
        fornecedor={fornecedorId}
        data={dataFiltro}
        solicitante={solicitanteId}
        status={statusFiltro}
      />
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Solicitante</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row) => {
              const nome = nomeEmbed(row.fornecedor)
              const solicitante = nomeEmbed(solicitanteEmbed(row.cotacao))
              const dataPedido = new Date(row.created_at).toLocaleDateString('pt-BR')
              const recebimentos = row.recebimentos as { id: string }[] | { id: string } | null
              const temRecebimento = Array.isArray(recebimentos)
                ? recebimentos.length > 0
                : Boolean(recebimentos?.id)
              const podeMexer = podeEditar && pedidoEditavel(row.status) && !temRecebimento
              const podeConferir = podeReceber && pedidoRecebivel(row.status)
              return (
                <tr key={row.id} className="group border-t border-[#ffffff08]">
                  <td className="px-4 py-3">
                    <Link className="text-[#2BAADF]" href={`/cockpit/compras/pedidos/${row.id}`}>
                      {row.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{nome || '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{solicitante || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{dataPedido}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {TIPO_COMPRA_LABEL[row.tipo as TipoCompra]}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {Number(row.valor_total).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {PEDIDO_STATUS_LABEL[row.status] || row.status}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-70 transition group-hover:opacity-100">
                      <Link
                        href={`/cockpit/compras/pedidos/${row.id}`}
                        title="Abrir"
                        className="rounded-lg p-2 text-gray-400 hover:bg-[#ffffff08] hover:text-[#2BAADF]"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      {podeMexer ? (
                        <Link
                          href={`/cockpit/compras/pedidos/${row.id}/editar`}
                          title="Editar"
                          className="rounded-lg p-2 text-gray-400 hover:bg-[#ffffff08] hover:text-[#2BAADF]"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      ) : null}
                      {podeMexer ? (
                        <Link
                          href={`/cockpit/compras/pedidos/${row.id}/cancelar`}
                          title="Cancelar"
                          className="rounded-lg p-2 text-gray-400 hover:bg-[#ffffff08] hover:text-red-400"
                        >
                          <Ban className="h-4 w-4" />
                        </Link>
                      ) : null}
                      {podeConferir ? (
                        <Link
                          href={`/cockpit/compras/pedidos/${row.id}/receber`}
                          title="Receber"
                          className="rounded-lg p-2 text-gray-400 hover:bg-[#ffffff08] hover:text-emerald-400"
                        >
                          <Package className="h-4 w-4" />
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!data?.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  {fornecedorId || dataFiltro || solicitanteId || statusFiltro
                    ? 'Nenhum pedido com esses filtros.'
                    : 'Nenhum pedido. Lance um pedido ou importe a planilha.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
