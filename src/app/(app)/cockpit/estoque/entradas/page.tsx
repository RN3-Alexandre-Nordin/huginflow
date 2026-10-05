import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import {
  ArrowDownToLine,
  FileSpreadsheet,
  FileCode,
  Lock,
  Plus,
  Eye,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
} from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import EstoquePagination from '@/components/estoque/EstoquePagination'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { estoqueRange, parseEstoquePage } from '@/lib/estoque/listagem'

export const metadata = { title: 'Entradas de Estoque | HuginFlow' }

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}

export default async function EstoqueEntradasPage({ searchParams }: PageProps) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_entradas', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar as entradas de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_entradas', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  const { q, status, page: pageParam } = await searchParams
  const { page, from, to, pageSize } = estoqueRange(parseEstoquePage(pageParam))
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  let query = supabase
    .from('est_entrada_lotes')
    .select(
      `
      id,
      numero,
      origem,
      status,
      documento,
      nfe_chave,
      erro_resumo,
      movimento_em,
      created_at,
      crm_leads (id, nome),
      cad_locais_estoque (id, codigo, nome),
      est_entrada_itens (count)
    `,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  if (!isSuperAdmin) {
    query = query.eq('empresa_id', empresaId)
  }

  if (status && status !== 'todos') {
    query = query.eq('status', status)
  }

  if (q && q.trim()) {
    const term = q.trim()
    const orParts = [
      `numero.ilike.%${term}%`,
      `documento.ilike.%${term}%`,
      `nfe_chave.ilike.%${term}%`,
    ]

    // Busca também por SKU (código/nome) e fornecedor — a lista é de lotes, então resolve IDs
    let skuQuery = supabase
      .from('cad_skus')
      .select('id')
      .or(`codigo.ilike.%${term}%,nome.ilike.%${term}%`)
      .limit(80)
    if (!isSuperAdmin) skuQuery = skuQuery.eq('empresa_id', empresaId)
    const { data: skusMatch } = await skuQuery

    if (skusMatch && skusMatch.length > 0) {
      let itensQuery = supabase
        .from('est_entrada_itens')
        .select('lote_id')
        .in(
          'sku_id',
          skusMatch.map((s) => s.id),
        )
      if (!isSuperAdmin) itensQuery = itensQuery.eq('empresa_id', empresaId)
      const { data: itensMatch } = await itensQuery
      const loteIds = [
        ...new Set(
          (itensMatch || [])
            .map((i) => i.lote_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      ]
      if (loteIds.length > 0) {
        orParts.push(`id.in.(${loteIds.join(',')})`)
      }
    }

    let leadQuery = supabase
      .from('crm_leads')
      .select('id')
      .or(`nome.ilike.%${term}%,documento.ilike.%${term}%`)
      .limit(80)
    if (!isSuperAdmin) leadQuery = leadQuery.eq('empresa_id', empresaId)
    const { data: leadsMatch } = await leadQuery
    if (leadsMatch && leadsMatch.length > 0) {
      orParts.push(`pessoa_id.in.(${leadsMatch.map((l) => l.id).join(',')})`)
    }

    query = query.or(orParts.join(','))
  }

  const { data: lotes, error, count: lotesCount } = await query

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-emerald-400" />
            Entradas de Estoque
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Lotes recebidos via digitação manual na tela, importação de planilhas ou notas fiscais XML.
          </p>
        </div>

        {canCreate && (
          <div className="flex items-center gap-2">
            <Link
              href="/cockpit/estoque/entradas/xml"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-300 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff15] rounded-xl transition-all"
            >
              <FileCode className="h-3.5 w-3.5 text-amber-400" />
              Importar XML NF-e
            </Link>
            <Link
              href="/cockpit/estoque/entradas/import"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-300 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff15] rounded-xl transition-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-blue-400" />
              Importar Planilha
            </Link>
            <Link
              href="/cockpit/estoque/entradas/novo"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Plus className="h-4 w-4" />
              Nova Entrada Manual
            </Link>
          </div>
        )}
      </div>

      {/* Filtros e Busca */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <DebouncedSearchBox
          initialQuery={q || ''}
          placeholder="Buscar por lote, documento, NFe, SKU ou fornecedor..."
          preserveParams={{ status }}
          className="relative flex-1 w-full max-w-none"
          inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
        />

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'concluido', label: 'Concluídos' },
            { id: 'parcial', label: 'Parciais' },
            { id: 'erro', label: 'Com Erro' },
            { id: 'rascunho', label: 'Rascunhos' },
          ].map((st) => {
            const isSelected = (!status && st.id === 'todos') || status === st.id
            return (
              <Link
                key={st.id}
                href={`/cockpit/estoque/entradas?${new URLSearchParams({
                  ...(q ? { q } : {}),
                  status: st.id,
                }).toString()}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#ffffff05]'
                }`}
              >
                {st.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Tabela de Lotes */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        {error ? (
          <div className="p-8 text-center text-red-400 text-xs">
            Erro ao carregar entradas: {error.message}
          </div>
        ) : !lotes || lotes.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <ArrowDownToLine className="h-7 w-7 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Nenhuma entrada encontrada</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 mb-5">
              Não foram encontrados lotes de entrada de mercadorias com os filtros aplicados.
            </p>
            {canCreate && (
              <Link
                href="/cockpit/estoque/entradas/novo"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all"
              >
                <Plus className="h-4 w-4" />
                Registrar Primeira Entrada
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0e1319] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                <tr>
                  <th className="py-3 px-4">Lote / Número</th>
                  <th className="py-3 px-4">Origem</th>
                  <th className="py-3 px-4">Fornecedor</th>
                  <th className="py-3 px-4">Destino</th>
                  <th className="py-3 px-4">Documento</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff05]">
                {lotes.map((lote) => {
                  const fornecedor = lote.crm_leads as { id?: string; nome?: string } | null
                  const local = lote.cad_locais_estoque as { id?: string; codigo?: string; nome?: string } | null
                  const itensCount = Array.isArray(lote.est_entrada_itens)
                    ? lote.est_entrada_itens[0]?.count ?? 0
                    : 0

                  return (
                    <tr key={lote.id} className="hover:bg-[#ffffff03] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        <Link
                          href={`/cockpit/estoque/entradas/${lote.id}`}
                          className="hover:text-emerald-400 transition-colors flex items-center gap-1.5"
                        >
                          <Layers className="h-3.5 w-3.5 text-gray-500" />
                          {lote.numero}
                        </Link>
                        {itensCount > 0 && (
                          <span className="text-[10px] text-gray-500 font-sans font-normal block mt-0.5">
                            {itensCount} item(ns)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#ffffff05] border border-[#ffffff0a] text-gray-300">
                          {lote.origem === 'lote_tela' && 'Manual Tela'}
                          {lote.origem === 'planilha' && 'Planilha CSV'}
                          {lote.origem === 'nfe_xml' && 'XML NFe'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-white font-medium max-w-[200px] truncate">
                          <Building2 className="h-3 w-3 text-gray-500 shrink-0" />
                          <span className="truncate">{fornecedor?.nome || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-gray-300 text-[11px]">
                          {local ? `${local.codigo} - ${local.nome}` : '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-gray-300 font-mono text-[11px]">
                          {lote.documento || '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={lote.status} erroResumo={lote.erro_resumo} />
                      </td>
                      <td className="py-3.5 px-4 text-gray-400">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="h-3 w-3 text-gray-500" />
                          {new Date(lote.movimento_em || lote.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/cockpit/estoque/entradas/${lote.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-300 hover:text-white bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-lg transition-all"
                        >
                          <Eye className="h-3 w-3" />
                          Detalhes
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 pb-4">
          <EstoquePagination
            page={page}
            pageSize={pageSize}
            total={lotesCount ?? lotes?.length ?? 0}
            baseQuery={new URLSearchParams({
              ...(q ? { q } : {}),
              ...(status && status !== 'todos' ? { status } : {}),
            }).toString()}
          />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status, erroResumo }: { status: string; erroResumo?: string | null }) {
  if (status === 'concluido') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" />
        Concluído
      </span>
    )
  }
  if (status === 'parcial') {
    return (
      <span
        title={erroResumo || undefined}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-help"
      >
        <AlertTriangle className="h-3 w-3" />
        Parcial
      </span>
    )
  }
  if (status === 'erro') {
    return (
      <span
        title={erroResumo || undefined}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 cursor-help"
      >
        <XCircle className="h-3 w-3" />
        Erro
      </span>
    )
  }
  if (status === 'processando') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <Clock className="h-3 w-3 animate-spin" />
        Processando
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
      Rascunho
    </span>
  )
}
