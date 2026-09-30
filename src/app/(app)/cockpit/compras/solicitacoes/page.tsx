import Link from 'next/link'
import { Lock, Pencil } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import ExcluirSolicitacaoButton from './ExcluirSolicitacaoButton'
import { TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import PedidosFiltros from '../pedidos/PedidosFiltros'

export const metadata = { title: 'Solicitações de compra | HuginFlow' }

const STATUS_LABEL: Record<string, string> = {
  registrada: 'Em aberto',
  atendida: 'Atendida (pedido)',
  cancelada: 'Cancelada',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function diaLista(isoDate: string) {
  const inicio = new Date(`${isoDate}T00:00:00-03:00`)
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

function nomeEmbed(value: { nome?: string } | { nome?: string }[] | null | undefined) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.nome || '' : value.nome || ''
}

export default async function SolicitacoesPage({
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
        hasPermission(me, 'compras_solicitacoes', 'view')))

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
  const statusFiltro = filtros.status && STATUS_LABEL[filtros.status] ? filtros.status : ''
  const dataFiltro = /^\d{4}-\d{2}-\d{2}$/.test(filtros.data || '') ? filtros.data! : ''

  let idsFornecedor: string[] | null = null
  if (fornecedorId) {
    const { data: linhas } = await supabase
      .from('com_cotacao_fornecedores')
      .select('cotacao_id')
      .eq('empresa_id', me!.empresa_id)
      .eq('fornecedor_id', fornecedorId)
      .limit(500)
    const cotIds = [...new Set((linhas || []).map((row) => row.cotacao_id))]
    if (!cotIds.length) {
      idsFornecedor = []
    } else {
      const { data: cots } = await supabase
        .from('com_cotacoes')
        .select('solicitacao_id')
        .eq('empresa_id', me!.empresa_id)
        .in('id', cotIds)
        .limit(500)
      idsFornecedor = [
        ...new Set((cots || []).map((row) => row.solicitacao_id).filter(Boolean)),
      ] as string[]
    }
  }

  let data: Array<{
    id: string
    numero: string
    tipo: string
    status: string
    data_necessidade: string | null
    created_at: string
    solicitante: { nome?: string } | { nome?: string }[] | null
  }> | null = null
  let error: { message: string } | null = null
  if (idsFornecedor && idsFornecedor.length === 0) {
    data = []
  } else {
    let query = supabase
      .from('com_solicitacoes')
      .select(
        'id, numero, tipo, status, data_necessidade, created_at, solicitante:crm_leads!solicitante_pessoa_id(nome)',
      )
      .eq('empresa_id', me!.empresa_id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (statusFiltro) query = query.eq('status', statusFiltro)
    else query = query.neq('status', 'rascunho')
    if (solicitanteId) query = query.eq('solicitante_pessoa_id', solicitanteId)
    if (dataFiltro) {
      const dia = diaLista(dataFiltro)
      query = query.gte('created_at', dia.inicio).lt('created_at', dia.fim)
    }
    if (idsFornecedor) query = query.in('id', idsFornecedor)
    const res = await query
    data = (res.data || []) as NonNullable<typeof data>
    error = res.error
  }

  const ids = (data || []).map((r) => r.id)
  const comCotacao = new Set<string>()
  if (ids.length) {
    const { data: cots } = await supabase
      .from('com_cotacoes')
      .select('solicitacao_id')
      .eq('empresa_id', me!.empresa_id)
      .in('solicitacao_id', ids)
    for (const c of cots || []) {
      if (c.solicitacao_id) comCotacao.add(c.solicitacao_id)
    }
  }

  const podeCriar = isSuper || hasPermission(me, 'compras_solicitacoes', 'create')
  const podeEditar = isSuper || hasPermission(me, 'compras_solicitacoes', 'edit')
  const podeExcluir = isSuper || hasPermission(me, 'compras_solicitacoes', 'delete')

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Solicitações</h1>
          <p className="text-sm text-gray-500">
            Pedido interno. Na solicitação registrada, use Abrir cotação.
          </p>
        </div>
        {podeCriar ? (
          <Link
            href="/cockpit/compras/solicitacoes/novo"
            className="rounded-xl bg-[#2BAADF] px-4 py-2 text-sm font-semibold text-white"
          >
            Nova solicitação
          </Link>
        ) : null}
      </div>
      <PedidosFiltros
        fornecedores={fornecedores || []}
        solicitantes={solicitantes || []}
        statusOpcoes={Object.entries(STATUS_LABEL).map(([id, label]) => ({ id, label }))}
        fornecedor={fornecedorId}
        data={dataFiltro}
        solicitante={solicitanteId}
        status={statusFiltro}
        limparHref="/cockpit/compras/solicitacoes"
        rotuloData="Data da solicitação"
      />
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Solicitante</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Necessidade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row) => {
              const temCotacao = comCotacao.has(row.id)
              return (
                <tr key={row.id} className="group border-t border-[#ffffff08]">
                  <td className="px-4 py-3">
                    <Link className="text-[#2BAADF]" href={`/cockpit/compras/solicitacoes/${row.id}`}>
                      {row.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{nomeEmbed(row.solicitante) || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(row.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {TIPO_COMPRA_LABEL[row.tipo as TipoCompra]}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{row.data_necessidade || '—'}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {STATUS_LABEL[row.status] || row.status}
                    {temCotacao ? (
                      <span className="ml-2 text-[10px] text-gray-500">· cotação</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-70 transition group-hover:opacity-100">
                      {podeEditar && !temCotacao ? (
                        <Link
                          href={`/cockpit/compras/solicitacoes/${row.id}/editar`}
                          title="Editar"
                          className="rounded-lg p-2 text-gray-400 hover:bg-[#ffffff08] hover:text-[#2BAADF]"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      ) : null}
                      {podeExcluir && !temCotacao ? (
                        <ExcluirSolicitacaoButton
                          solicitacaoId={row.id}
                          numero={row.numero}
                          variant="icon"
                        />
                      ) : null}
                      {temCotacao && (podeEditar || podeExcluir) ? (
                        <span className="px-2 text-[10px] text-gray-600" title="Com cotação">
                          —
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!data?.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {fornecedorId || dataFiltro || solicitanteId || statusFiltro
                    ? 'Nenhuma solicitação com esses filtros.'
                    : 'Nenhuma solicitação.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
