import Link from 'next/link'
import { Eye, Lock, Pencil } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import ExcluirCotacaoButton from './ExcluirCotacaoButton'
import PedidosFiltros from '../pedidos/PedidosFiltros'

export const metadata = { title: 'Cotações | HuginFlow' }

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  em_cotacao: 'Em cotação',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fmtData(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = iso.length === 10 ? `${iso}T12:00:00` : iso
  return new Date(d).toLocaleDateString('pt-BR')
}

function diaLista(isoDate: string) {
  const inicio = new Date(`${isoDate}T00:00:00-03:00`)
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

type CotacaoRow = {
  id: string
  numero: string
  tipo: string
  status: string
  created_at: string
  solicitacao: unknown
  fornecedores: unknown
}

export default async function CotacoesPage({
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
        hasPermission(me, 'compras_cotacoes', 'view')))

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

  let cotacaoIdsFornecedor: string[] | null = null
  if (fornecedorId) {
    const { data: linhas } = await supabase
      .from('com_cotacao_fornecedores')
      .select('cotacao_id')
      .eq('empresa_id', me!.empresa_id)
      .eq('fornecedor_id', fornecedorId)
      .limit(500)
    cotacaoIdsFornecedor = [...new Set((linhas || []).map((row) => row.cotacao_id))]
  }

  let idsRestritos = cotacaoIdsFornecedor
  if (solicitanteId) {
    const { data: sols } = await supabase
      .from('com_solicitacoes')
      .select('id')
      .eq('empresa_id', me!.empresa_id)
      .eq('solicitante_pessoa_id', solicitanteId)
      .limit(500)
    const solIds = (sols || []).map((row) => row.id)
    let doSolicitante: string[] = []
    if (solIds.length) {
      const { data: cots } = await supabase
        .from('com_cotacoes')
        .select('id')
        .eq('empresa_id', me!.empresa_id)
        .in('solicitacao_id', solIds)
        .limit(500)
      doSolicitante = (cots || []).map((row) => row.id)
    }
    const permitidos = new Set(doSolicitante)
    idsRestritos = idsRestritos ? idsRestritos.filter((id) => permitidos.has(id)) : doSolicitante
  }

  let data: CotacaoRow[] | null = null
  let error: { message: string } | null = null
  if (idsRestritos && idsRestritos.length === 0) {
    data = []
  } else {
    let query = supabase
      .from('com_cotacoes')
      .select(
        `id, numero, tipo, status, created_at,
         solicitacao:com_solicitacoes!solicitacao_id(
           numero, created_at, data_necessidade, solicitante_pessoa_id,
           solicitante:crm_leads!solicitante_pessoa_id(nome)
         ),
         fornecedores:com_cotacao_fornecedores(
           ordem,
           lead:crm_leads!fornecedor_id(nome)
         )`,
      )
      .eq('empresa_id', me!.empresa_id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (statusFiltro) query = query.eq('status', statusFiltro)
    if (dataFiltro) {
      const dia = diaLista(dataFiltro)
      query = query.gte('created_at', dia.inicio).lt('created_at', dia.fim)
    }
    if (idsRestritos) query = query.in('id', idsRestritos)
    const res = await query
    data = (res.data || []) as CotacaoRow[]
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

  const podeCriar = isSuper || hasPermission(me, 'compras_cotacoes', 'create')
  const podeEditar = isSuper || hasPermission(me, 'compras_cotacoes', 'edit')
  const podeExcluir = isSuper || hasPermission(me, 'compras_cotacoes', 'delete')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Cotações</h1>
          <p className="text-sm text-gray-500">
            Escolha a solicitação → até 3 fornecedores → vencedor → gera pedidos.
          </p>
        </div>
        {podeCriar ? (
          <Link
            href="/cockpit/compras/cotacoes/novo"
            className="rounded-xl bg-[#2BAADF] px-4 py-2 text-sm font-semibold text-white"
          >
            Nova cotação
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
        limparHref="/cockpit/compras/cotacoes"
        rotuloData="Data da cotação"
      />
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Solicitação</th>
              <th className="px-4 py-3">Solicitante</th>
              <th className="px-4 py-3">Data solicitação</th>
              <th className="px-4 py-3">Fornecedor(es)</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row) => {
              const solRaw = row.solicitacao as
                | {
                    numero?: string
                    created_at?: string
                    data_necessidade?: string | null
                    solicitante?: { nome?: string } | { nome?: string }[] | null
                  }
                | {
                    numero?: string
                    created_at?: string
                    data_necessidade?: string | null
                    solicitante?: { nome?: string } | { nome?: string }[] | null
                  }[]
                | null
              const sol = Array.isArray(solRaw) ? solRaw[0] : solRaw
              const solNum = sol?.numero || '—'
              const solData = sol?.created_at || sol?.data_necessidade || null
              const solPessoaRaw = sol?.solicitante
              const solPessoa = Array.isArray(solPessoaRaw) ? solPessoaRaw[0] : solPessoaRaw
              const solicitanteNome = solPessoa?.nome?.trim() || '—'

              type FornEmb = {
                ordem?: number
                lead?: { nome?: string } | { nome?: string }[] | null
              }
              const fornRaw = row.fornecedores as FornEmb[] | null
              const fornNomes = (fornRaw || [])
                .slice()
                .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
                .map((f) => {
                  const lead = Array.isArray(f.lead) ? f.lead[0] : f.lead
                  return lead?.nome?.trim() || null
                })
                .filter(Boolean) as string[]
              const fornecedoresLabel = fornNomes.length ? fornNomes.join(' · ') : '—'

              const aberta = row.status === 'rascunho' || row.status === 'em_cotacao'

              return (
                <tr key={row.id} className="group border-t border-[#ffffff08]">
                  <td className="px-4 py-3">
                    <Link className="text-[#2BAADF]" href={`/cockpit/compras/cotacoes/${row.id}`}>
                      {row.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{solNum}</td>
                  <td className="px-4 py-3 text-gray-300">{solicitanteNome}</td>
                  <td className="px-4 py-3 text-gray-400">{fmtData(solData)}</td>
                  <td className="max-w-[14rem] px-4 py-3 text-gray-300" title={fornecedoresLabel}>
                    <span className="line-clamp-2">{fornecedoresLabel}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {TIPO_COMPRA_LABEL[row.tipo as TipoCompra]}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {STATUS_LABEL[row.status] || row.status}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-70 transition group-hover:opacity-100">
                      <Link
                        href={`/cockpit/compras/cotacoes/${row.id}`}
                        title="Abrir"
                        className="rounded-lg p-2 text-gray-400 hover:bg-[#ffffff08] hover:text-[#2BAADF]"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      {podeEditar && aberta ? (
                        <Link
                          href={`/cockpit/compras/cotacoes/${row.id}`}
                          title="Editar"
                          className="rounded-lg p-2 text-gray-400 hover:bg-[#ffffff08] hover:text-[#2BAADF]"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      ) : null}
                      {podeExcluir && aberta ? (
                        <ExcluirCotacaoButton cotacaoId={row.id} numero={row.numero} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!data?.length && !error ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  {fornecedorId || dataFiltro || solicitanteId || statusFiltro
                    ? 'Nenhuma cotação com esses filtros.'
                    : 'Nenhuma cotação.'}{' '}
                  {!fornecedorId && !dataFiltro && !solicitanteId && !statusFiltro && podeCriar ? (
                    <Link href="/cockpit/compras/cotacoes/novo" className="text-[#2BAADF]">
                      Nova cotação
                    </Link>
                  ) : !fornecedorId && !dataFiltro && !solicitanteId && !statusFiltro ? (
                    'Sem permissão para criar.'
                  ) : null}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
