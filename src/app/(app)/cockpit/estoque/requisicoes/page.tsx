import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import {
  ClipboardList,
  Lock,
  Plus,
  Eye,
  User,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Layers,
  Send,
  FileSpreadsheet,
} from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

export const metadata = { title: 'Requisições de Materiais | HuginFlow' }

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string }>
}

export default async function EstoqueRequisicoesPage({ searchParams }: PageProps) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_requisicoes', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar requisições de materiais.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_requisicoes', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  const { q, status } = await searchParams
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  let query = supabase
    .from('est_requisicoes')
    .select(
      `
      id,
      numero,
      status,
      origem,
      observacao,
      valor_estimado,
      aprovado_em,
      aprovacao_resultado,
      created_at,
      crm_leads!est_requisicoes_requisitante_pessoa_id_fkey (id, nome),
      usuarios!est_requisicoes_solicitante_usuario_id_fkey (id, nome_completo),
      aprovador:usuarios!est_requisicoes_aprovador_usuario_id_fkey (id, nome_completo),
      est_requisicao_itens (
        id,
        quantidade_pedida,
        quantidade_atendida,
        quantidade_pendente,
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
    query = query.or(`numero.ilike.%${term}%,observacao.ilike.%${term}%`)
  }

  const { data: requisicoes, error } = await query

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-purple-400" />
            Requisições de Materiais
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Solicitações de materiais com fluxo de aprovação e atendimento automatizado respeitando saldos de estoque.
          </p>
        </div>

        {canCreate && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/cockpit/estoque/requisicoes/import"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-200 bg-[#ffffff08] hover:bg-[#ffffff12] border border-[#ffffff12] rounded-xl transition-all"
            >
              <FileSpreadsheet className="h-4 w-4 text-purple-400" />
              Importar planilha
            </Link>
            <Link
              href="/cockpit/estoque/requisicoes/novo"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl shadow-lg shadow-purple-500/20 transition-all"
            >
              <Plus className="h-4 w-4" />
              Nova Requisição
            </Link>
          </div>
        )}
      </div>

      {/* Filtros e Busca */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <DebouncedSearchBox
          initialQuery={q || ''}
          placeholder="Buscar por número ou observação..."
          preserveParams={{ status }}
          className="relative flex-1 w-full max-w-none"
          inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
        />

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {[
            { id: 'todos', label: 'Todas' },
            { id: 'pendente_aprovacao', label: 'Em aprovação' },
            { id: 'aprovada', label: 'Aprovadas' },
            { id: 'atendida_parcial', label: 'Parciais' },
            { id: 'atendida_total', label: 'Atendidas' },
            { id: 'rascunho', label: 'Rascunhos' },
            { id: 'rejeitada', label: 'Rejeitadas' },
            { id: 'cancelada', label: 'Canceladas' },
          ].map((st) => {
            const isSelected = (!status && st.id === 'todos') || status === st.id
            return (
              <Link
                key={st.id}
                href={`/cockpit/estoque/requisicoes?${new URLSearchParams({
                  ...(q ? { q } : {}),
                  status: st.id,
                }).toString()}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#ffffff05]'
                }`}
              >
                {st.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Tabela de Requisições */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        {error ? (
          <div className="p-8 text-center text-red-400 text-xs">
            Erro ao carregar requisições: {error.message}
          </div>
        ) : !requisicoes || requisicoes.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="h-7 w-7 text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Nenhuma requisição encontrada</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 mb-5">
              Não foram encontradas requisições de materiais para os filtros informados.
            </p>
            {canCreate && (
              <Link
                href="/cockpit/estoque/requisicoes/novo"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition-all"
              >
                <Plus className="h-4 w-4" />
                Criar Primeira Requisição
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0e1319] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                <tr>
                  <th className="py-3 px-4">Número</th>
                  <th className="py-3 px-4">Requisitante</th>
                  <th className="py-3 px-4">Solicitante</th>
                  <th className="py-3 px-4">Valor est.</th>
                  <th className="py-3 px-4">Itens / Atendimento</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff05]">
                {requisicoes.map((req) => {
                  const requisitante = req.crm_leads as { id?: string; nome?: string } | null
                  const solicitante = req.usuarios as { id?: string; nome_completo?: string } | null
                  const aprovador = req.aprovador as { id?: string; nome_completo?: string } | null
                  const itensList = (req.est_requisicao_itens || []) as Array<{
                    id: string
                    quantidade_pedida: number
                    quantidade_atendida: number
                    quantidade_pendente: number
                  }>

                  const totalItens = itensList.length
                  const totalPedida = itensList.reduce((acc, i) => acc + Number(i.quantidade_pedida), 0)
                  const totalAtendida = itensList.reduce((acc, i) => acc + Number(i.quantidade_atendida), 0)
                  const percAtendido = totalPedida > 0 ? Math.round((totalAtendida / totalPedida) * 100) : 0
                  const valorEst = Number(req.valor_estimado || 0)

                  return (
                    <tr key={req.id} className="hover:bg-[#ffffff03] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        <Link
                          href={`/cockpit/estoque/requisicoes/${req.id}`}
                          className="hover:text-purple-400 transition-colors flex items-center gap-1.5"
                        >
                          <Layers className="h-3.5 w-3.5 text-gray-500" />
                          {req.numero}
                        </Link>
                        {req.origem === 'planilha' && (
                          <span className="text-[9px] text-gray-500 font-sans block mt-0.5">
                            Via Planilha
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-white font-medium block">
                          {requisitante?.nome || '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 text-gray-400">
                          <User className="h-3 w-3 text-gray-500" />
                          <span>{solicitante?.nome_completo || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-gray-300">
                        {valorEst.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-gray-400">{totalItens} item(ns)</span>
                            <span className="text-gray-300 font-bold">{percAtendido}%</span>
                          </div>
                          <div className="w-24 bg-[#ffffff10] h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-purple-500 h-full rounded-full transition-all"
                              style={{ width: `${percAtendido}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={req.status} />
                        {aprovador?.nome_completo && req.aprovado_em && (
                          <span className="mt-1 block text-[10px] text-gray-500">
                            {req.aprovacao_resultado === 'rejeitada' ? 'Rejeitado' : 'Aprovado'} por{' '}
                            {aprovador.nome_completo} ·{' '}
                            {new Date(req.aprovado_em).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-gray-400">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="h-3 w-3 text-gray-500" />
                          {new Date(req.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/cockpit/estoque/requisicoes/${req.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-300 hover:text-white bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-lg transition-all"
                        >
                          <Eye className="h-3 w-3" />
                          Ver
                        </Link>
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

function StatusBadge({ status }: { status: string }) {
  if (status === 'atendida_total' || status === 'atendida') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" />
        Atendida
      </span>
    )
  }
  if (status === 'atendida_parcial' || status === 'parcialmente_atendida') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <AlertTriangle className="h-3 w-3" />
        Parcial
      </span>
    )
  }
  if (status === 'aprovada') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <CheckCircle2 className="h-3 w-3" />
        Aprovada
      </span>
    )
  }
  if (status === 'pendente_aprovacao' || status === 'enviada') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
        <Send className="h-3 w-3" />
        Em aprovação
      </span>
    )
  }
  if (status === 'rejeitada') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
        <XCircle className="h-3 w-3" />
        Rejeitada
      </span>
    )
  }
  if (status === 'cancelada') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
        <XCircle className="h-3 w-3" />
        Cancelada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
      Rascunho
    </span>
  )
}
