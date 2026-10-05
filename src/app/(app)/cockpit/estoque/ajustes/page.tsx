import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import {
  SlidersHorizontal,
  Lock,
  Plus,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
  User,
} from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

export const metadata = { title: 'Ajustes de Estoque | HuginFlow' }

interface PageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function EstoqueAjustesPage({ searchParams }: PageProps) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_ajustes', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar ajustes de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_ajustes', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  const { q } = await searchParams
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  let query = supabase
    .from('est_ajuste_lotes')
    .select(
      `
      id,
      numero,
      status,
      observacao,
      movimento_em,
      created_at,
      usuarios (id, nome_completo),
      est_ajuste_itens (
        id,
        sinal,
        quantidade,
        justificativa,
        cad_skus (codigo, nome)
      )
    `
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (!isSuperAdmin) {
    query = query.eq('empresa_id', empresaId)
  }

  if (q && q.trim()) {
    const term = q.trim()
    query = query.or(`numero.ilike.%${term}%,observacao.ilike.%${term}%`)
  }

  const { data: lotes, error } = await query

  return (
    <div className="space-y-4 pb-20 font-sans">
      <EstoqueAreaNav />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-blue-400" />
            Ajustes e Correções de Estoque
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Inventário físico, avaria, extravio ou acertos de saldo com auditoria no Cardex.
          </p>
        </div>

        {canCreate && (
          <Link
            href="/cockpit/estoque/ajustes/novo"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus className="h-4 w-4" />
            Novo Ajuste
          </Link>
        )}
      </div>

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-4">
        <DebouncedSearchBox
          initialQuery={q || ''}
          placeholder="Buscar por lote ou observação..."
          className="relative w-full max-w-none"
          inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
        />
      </div>

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        {error ? (
          <div className="p-8 text-center text-red-400 text-xs">
            Erro ao carregar ajustes: {error.message}
          </div>
        ) : !lotes || lotes.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
              <SlidersHorizontal className="h-7 w-7 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Nenhum lote de ajuste registrado</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 mb-5">
              Não há lançamentos de ajuste de estoque cadastrados.
            </p>
            {canCreate && (
              <Link
                href="/cockpit/estoque/ajustes/novo"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all"
              >
                <Plus className="h-4 w-4" />
                Registrar Primeiro Ajuste
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0e1319] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                <tr>
                  <th className="py-3 px-4">Lote</th>
                  <th className="py-3 px-4">Itens</th>
                  <th className="py-3 px-4">Observação</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4 text-right">Cardex</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff05]">
                {lotes.map((lote) => {
                  const usuario = lote.usuarios as { id?: string; nome_completo?: string } | null
                  const itens = (lote.est_ajuste_itens || []) as unknown as Array<{
                    id: string
                    sinal: string
                    quantidade: number
                    justificativa: string
                    cad_skus: { codigo: string; nome: string } | null
                  }>

                  return (
                    <tr key={lote.id} className="hover:bg-[#ffffff03] transition-colors">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/cockpit/estoque/ajustes/${lote.id}`}
                          className="font-mono font-bold text-white inline-flex items-center gap-1.5 hover:text-blue-300"
                        >
                          <Layers className="h-3.5 w-3.5 text-blue-400" />
                          {lote.numero}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-gray-300 text-[11px]">
                          {itens.length} item(ns)
                        </span>
                        {itens[0]?.cad_skus && (
                          <span className="text-[10px] text-gray-500 block truncate max-w-xs">
                            {itens[0].cad_skus.codigo}:{' '}
                            {itens[0].sinal === 'positivo' ? '+' : '-'}
                            {itens[0].quantidade}
                            {itens[0].justificativa
                              ? ` (${itens[0].justificativa})`
                              : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-gray-400 max-w-xs truncate">
                        {lote.observacao || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {lote.status === 'concluido' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" />
                            Concluído
                          </span>
                        ) : lote.status === 'parcial' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="h-3 w-3" />
                            Parcial
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="h-3 w-3" />
                            {lote.status === 'erro' ? 'Erro' : lote.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-gray-400">
                        <div className="flex items-center gap-1 text-[11px]">
                          <User className="h-3 w-3 text-gray-500" />
                          <span>{usuario?.nome_completo || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-gray-400">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="h-3 w-3 text-gray-500" />
                          {new Date(lote.movimento_em || lote.created_at).toLocaleDateString(
                            'pt-BR'
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/cockpit/estoque/cardex?q=${encodeURIComponent(lote.numero)}`}
                          className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline font-mono"
                        >
                          Ver no Cardex
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
