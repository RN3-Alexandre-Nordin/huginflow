import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import {
  Truck,
  Lock,
  Plus,
  Calendar,
  CheckCircle2,
  XCircle,
  Building2,
  Eye,
  Layers,
  ArrowDownLeft,
} from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { MOTIVOS_REMESSA } from '@/lib/estoque/operacoes-avancadas'

export const metadata = { title: 'Remessas para Terceiros | HuginFlow' }

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string }>
}

export default async function EstoqueRemessasPage({ searchParams }: PageProps) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar remessas de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  const canEdit =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'edit') ||
    hasPermission(me, 'estoque', 'edit')

  const { q, status } = await searchParams
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  let query = supabase
    .from('est_remessa_lotes')
    .select(
      `
      id,
      numero,
      status,
      motivo_codigo,
      motivo_texto,
      documento,
      previsao_retorno_em,
      enviado_em,
      created_at,
      crm_leads (id, nome, documento, papeis),
      cad_locais_estoque (id, codigo, nome),
      est_remessa_itens (
        id,
        quantidade_enviada,
        quantidade_retornada,
        status_item
      )
    `
    )
    .order('created_at', { ascending: false })

  if (!isSuperAdmin) {
    query = query.eq('empresa_id', empresaId)
  }

  if (status && status !== 'todos') {
    query = query.eq('status', status)
  }

  if (q && q.trim()) {
    const term = q.trim()
    query = query.or(`numero.ilike.%${term}%,documento.ilike.%${term}%,motivo_texto.ilike.%${term}%`)
  }

  const { data: remessas, error } = await query

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Truck className="h-5 w-5 text-purple-400" />
            Remessas (Estoque em Poder de Terceiros)
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Controle de materiais próprios enviados para conserto, locação, comodato, demonstração ou industrialização.
          </p>
        </div>

        {canCreate && (
          <Link
            href="/cockpit/estoque/remessas/novo"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-500/20 transition-all"
          >
            <Plus className="h-4 w-4" />
            Nova Remessa
          </Link>
        )}
      </div>

      {/* Filtros e Busca */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <DebouncedSearchBox
          initialQuery={q || ''}
          placeholder="Buscar por lote, documento ou motivo..."
          preserveParams={{ status }}
          className="relative flex-1 w-full max-w-none"
          inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
        />

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {[
            { id: 'todos', label: 'Todas' },
            { id: 'aberta', label: 'Abertas (Em poder)' },
            { id: 'parcial', label: 'Parciais' },
            { id: 'fechada', label: 'Retornadas (Fechadas)' },
            { id: 'cancelada', label: 'Canceladas' },
          ].map((st) => {
            const isSelected = (!status && st.id === 'todos') || status === st.id
            return (
              <Link
                key={st.id}
                href={`/cockpit/estoque/remessas?${new URLSearchParams({
                  ...(q ? { q } : {}),
                  status: st.id,
                }).toString()}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#ffffff05]'
                }`}
              >
                {st.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Tabela de Remessas */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        {error ? (
          <div className="p-8 text-center text-red-400 text-xs">
            Erro ao carregar remessas: {error.message}
          </div>
        ) : !remessas || remessas.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
              <Truck className="h-7 w-7 text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Nenhuma remessa encontrada</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 mb-5">
              Não há remessas em poder de terceiros registradas com os filtros atuais.
            </p>
            {canCreate && (
              <Link
                href="/cockpit/estoque/remessas/novo"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all"
              >
                <Plus className="h-4 w-4" />
                Criar Primeira Remessa
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0e1319] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                <tr>
                  <th className="py-3 px-4">Lote</th>
                  <th className="py-3 px-4">Terceiro / Destinatário</th>
                  <th className="py-3 px-4">Finalidade / Motivo</th>
                  <th className="py-3 px-4">Local Origem</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Envio</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff05]">
                {remessas.map((rem) => {
                  const terceiro = rem.crm_leads as {
                    id?: string
                    nome?: string
                    documento?: string | null
                    papeis?: string[] | null
                  } | null
                  const local = rem.cad_locais_estoque as { id?: string; codigo?: string } | null
                  const motivoLabel = MOTIVOS_REMESSA.find((m) => m.codigo === rem.motivo_codigo)?.label || rem.motivo_codigo

                  return (
                    <tr key={rem.id} className="hover:bg-[#ffffff03] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        <Link
                          href={`/cockpit/estoque/remessas/${rem.id}`}
                          className="hover:text-purple-300 transition-colors flex items-center gap-1.5"
                        >
                          <Layers className="h-3.5 w-3.5 text-purple-400" />
                          {rem.numero}
                        </Link>
                        {rem.documento && (
                          <span className="text-[10px] text-gray-500 font-normal font-sans block mt-0.5">
                            Doc: {rem.documento}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-white font-medium">
                          <Building2 className="h-3 w-3 text-purple-400" />
                          <span>{terceiro?.nome || '—'}</span>
                        </div>
                        {(terceiro?.documento || (terceiro?.papeis && terceiro.papeis.length > 0)) && (
                          <span className="text-[10px] text-gray-500 block mt-0.5">
                            {[terceiro.documento, ...(terceiro.papeis || [])]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-gray-300 block">{motivoLabel}</span>
                        {rem.motivo_texto && (
                          <span className="text-[10px] text-gray-500 block truncate max-w-xs">
                            {rem.motivo_texto}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-gray-300">
                        {local?.codigo || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {rem.status === 'aberta' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Em Poder
                          </span>
                        ) : rem.status === 'parcial' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Retorno Parcial
                          </span>
                        ) : rem.status === 'fechada' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" />
                            Fechada / Retornada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="h-3 w-3" />
                            Cancelada
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-gray-400">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="h-3 w-3 text-gray-500" />
                          {new Date(rem.enviado_em || rem.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {(rem.status === 'aberta' || rem.status === 'parcial') && canEdit && (
                            <Link
                              href={`/cockpit/estoque/remessas/${rem.id}/retorno`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all"
                            >
                              <ArrowDownLeft className="h-3 w-3" />
                              Retornar
                            </Link>
                          )}
                          <Link
                            href={`/cockpit/estoque/remessas/${rem.id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-300 hover:text-white bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-lg transition-all"
                          >
                            <Eye className="h-3 w-3" />
                            Detalhes
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
