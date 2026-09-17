import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import UrlFilterSelect from '@/components/UrlFilterSelect'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import {
  ArrowLeftRight,
  Plus,
  ArrowRight,
  Layers,
  Calendar,
  FileText,
  User,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  BookOpen,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Transferências de Estoque | HuginFlow',
}

interface PageProps {
  searchParams: Promise<{
    q?: string
    local_origem?: string
    local_destino?: string
  }>
}

export default async function TransferenciasPage({ searchParams }: PageProps) {
  const { q, local_origem, local_destino } = await searchParams
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const empresaId = me?.empresa_id || ''
  const supabase = await createClient()

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_transferencias', 'view') ||
    hasPermission(me, 'estoque', 'view')

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_transferencias', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canView) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm">
        Sem permissão para visualizar transferências.
      </div>
    )
  }

  const { data: locais } = await supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('codigo')

  let query = supabase
    .from('est_transferencia_lotes')
    .select(
      `
      id,
      numero,
      documento,
      observacao,
      status,
      movimento_em,
      created_at,
      local_origem:cad_locais_estoque!est_transferencia_lotes_local_origem_id_fkey ( id, codigo, nome ),
      local_destino:cad_locais_estoque!est_transferencia_lotes_local_destino_id_fkey ( id, codigo, nome ),
      usuarios ( id, nome_completo ),
      est_transferencia_itens (
        id,
        quantidade,
        cad_skus ( codigo, nome, unidade_estoque )
      )
    `
    )
    .order('movimento_em', { ascending: false })
    .limit(100)

  if (!isSuperAdmin) {
    query = query.eq('empresa_id', empresaId)
  }
  if (local_origem) {
    query = query.eq('local_origem_id', local_origem)
  }
  if (local_destino) {
    query = query.eq('local_destino_id', local_destino)
  }
  if (q && q.trim()) {
    const term = q.trim()
    query = query.or(
      `numero.ilike.%${term}%,documento.ilike.%${term}%,observacao.ilike.%${term}%`
    )
  }

  const { data: lotes, error } = await query

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ffffff10] pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <ArrowLeftRight className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-white tracking-tight">
                Transferências entre Locais
              </h1>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                §7 LOTE
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Lotes de redistribuição física (N SKUs) entre almoxarifados — saldo total da empresa
              inalterado.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/cockpit/estoque/cardex?tipo=transferencia"
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-gray-300 hover:text-white bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] transition-colors flex items-center gap-2"
          >
            <BookOpen className="h-4 w-4 text-amber-400" />
            Ver no Cardex
          </Link>
          {canCreate && (
            <Link
              href="/cockpit/estoque/transferencias/novo"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Nova Transferência
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#0d121f] p-4 rounded-xl border border-[#ffffff10]">
        <DebouncedSearchBox
          initialQuery={q || ''}
          placeholder="Buscar por lote, documento ou observação..."
          preserveParams={{ local_origem, local_destino }}
          className="relative w-full max-w-none"
          inputClassName="w-full bg-[#080b11] border border-[#ffffff15] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />

        <UrlFilterSelect
          name="local_origem"
          value={local_origem || ''}
          emptyLabel="Todos os Locais de Origem"
          preserveParams={{ q, local_destino }}
          options={(locais || []).map((l) => ({
            value: l.id,
            label: `Origem: ${l.codigo} — ${l.nome}`,
          }))}
          className="w-full bg-[#080b11] border border-[#ffffff15] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
        />

        <UrlFilterSelect
          name="local_destino"
          value={local_destino || ''}
          emptyLabel="Todos os Locais de Destino"
          preserveParams={{ q, local_origem }}
          options={(locais || []).map((l) => ({
            value: l.id,
            label: `Destino: ${l.codigo} — ${l.nome}`,
          }))}
          className="w-full bg-[#080b11] border border-[#ffffff15] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
        />
      </div>

      <div className="bg-[#0b0f19] border border-[#ffffff10] rounded-2xl overflow-hidden shadow-xl">
        {error ? (
          <div className="p-8 text-center text-red-400 text-xs">
            Erro ao carregar lotes: {error.message}
          </div>
        ) : !lotes || lotes.length === 0 ? (
          <div className="py-16 text-center text-gray-400 space-y-3">
            <ArrowLeftRight className="h-10 w-10 text-gray-600 mx-auto" />
            <p className="text-sm font-medium">Nenhuma transferência encontrada</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Crie um lote para transferir um ou vários SKUs entre os mesmos locais de origem e
              destino.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#080c14] border-b border-[#ffffff10] text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Lote</th>
                  <th className="py-3 px-4 text-center">Rota</th>
                  <th className="py-3 px-4">Itens</th>
                  <th className="py-3 px-4">Documento / Obs.</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Operador</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4 text-right">Atalhos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff05]">
                {lotes.map((lote) => {
                  const origem = lote.local_origem as {
                    codigo?: string
                  } | null
                  const destino = lote.local_destino as {
                    codigo?: string
                  } | null
                  const usuario = lote.usuarios as { nome_completo?: string } | null
                  const itens = (lote.est_transferencia_itens || []) as unknown as Array<{
                    id: string
                    quantidade: number
                    cad_skus: {
                      codigo: string
                      nome: string
                      unidade_estoque: string
                    } | null
                  }>

                  return (
                    <tr key={lote.id} className="hover:bg-[#ffffff03] transition-colors">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/cockpit/estoque/transferencias/${lote.id}`}
                          className="font-mono font-bold text-white hover:text-cyan-300 inline-flex items-center gap-1.5"
                        >
                          <Layers className="h-3.5 w-3.5 text-cyan-500" />
                          {lote.numero}
                        </Link>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <span className="px-2 py-1 rounded bg-[#ffffff08] border border-[#ffffff10] font-mono text-[11px] text-gray-300 font-bold">
                            {origem?.codigo || '—'}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          <span className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/20 font-mono text-[11px] text-cyan-300 font-bold">
                            {destino?.codigo || '—'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono text-gray-300 text-[11px]">
                          {itens.length} SKU(s)
                        </span>
                        {itens[0]?.cad_skus && (
                          <span className="text-[10px] text-gray-500 block truncate max-w-[14rem]">
                            {itens[0].cad_skus.codigo}
                            {itens.length > 1 ? ` +${itens.length - 1}` : ''}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {lote.documento && (
                          <div className="flex items-center gap-1 font-mono text-[11px] text-gray-300">
                            <FileText className="h-3 w-3 text-gray-500" />
                            {lote.documento}
                          </div>
                        )}
                        <div className="text-[11px] text-gray-400 italic truncate max-w-xs">
                          {lote.observacao || '—'}
                        </div>
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
                            {lote.status || 'Erro'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-gray-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-gray-500" />
                          {usuario?.nome_completo || 'Sistema'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-gray-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-gray-500" />
                          {new Date(lote.movimento_em || lote.created_at).toLocaleDateString(
                            'pt-BR',
                            {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <Link
                            href={`/cockpit/estoque/transferencias/${lote.id}`}
                            className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:underline font-mono"
                          >
                            <Eye className="h-3 w-3" />
                            Ver lote
                          </Link>
                          <Link
                            href={`/cockpit/estoque/cardex?q=${encodeURIComponent(lote.numero)}`}
                            className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline font-mono"
                          >
                            Cardex
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
