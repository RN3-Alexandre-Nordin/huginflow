import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import {
  ArrowUpRight,
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
import UrlFilterSelect from '@/components/UrlFilterSelect'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

export const metadata = { title: 'Retiradas de Estoque | HuginFlow' }

interface PageProps {
  searchParams: Promise<{ q?: string; sku_id?: string; pessoa_id?: string }>
}

export default async function EstoqueRetiradasPage({ searchParams }: PageProps) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_retiradas', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar retiradas de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_retiradas', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  const { q, sku_id, pessoa_id } = await searchParams
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  // Lotes que batem SKU / fornecedor (via Cardex vinculado) ou texto livre
  let loteIdsFromFilters: string[] | null = null

  if (sku_id) {
    let itensQ = supabase
      .from('est_retirada_itens')
      .select('lote_id')
      .eq('sku_id', sku_id)
    if (!isSuperAdmin) itensQ = itensQ.eq('empresa_id', empresaId)
    const { data: itensSku } = await itensQ
    loteIdsFromFilters = [
      ...new Set(
        (itensSku || [])
          .map((i) => i.lote_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
  }

  if (pessoa_id) {
    // Fornecedor: lotes cujo Cardex (movimento) aponta pessoa_id — raro em retirada,
    // mas cobre vínculo se existir; senão cruza SKUs já comprados desse fornecedor no Cardex.
    let movQ = supabase
      .from('est_movimentos')
      .select('lote_retirada_id')
      .eq('tipo', 'saida')
      .eq('pessoa_id', pessoa_id)
      .not('lote_retirada_id', 'is', null)
    if (!isSuperAdmin) movQ = movQ.eq('empresa_id', empresaId)
    const { data: movs } = await movQ
    const fromMov = [
      ...new Set(
        (movs || [])
          .map((m) => m.lote_retirada_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ]

    // Fallback: SKUs que tiveram entrada desse fornecedor → lotes de retirada com esses SKUs
    let entQ = supabase
      .from('est_movimentos')
      .select('sku_id')
      .eq('tipo', 'entrada')
      .eq('pessoa_id', pessoa_id)
    if (!isSuperAdmin) entQ = entQ.eq('empresa_id', empresaId)
    const { data: entSkus } = await entQ
    const skuIdsForn = [
      ...new Set(
        (entSkus || [])
          .map((e) => e.sku_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    let fromSkuForn: string[] = []
    if (skuIdsForn.length > 0) {
      let itensForn = supabase
        .from('est_retirada_itens')
        .select('lote_id')
        .in('sku_id', skuIdsForn.slice(0, 200))
      if (!isSuperAdmin) itensForn = itensForn.eq('empresa_id', empresaId)
      const { data: itensF } = await itensForn
      fromSkuForn = [
        ...new Set(
          (itensF || [])
            .map((i) => i.lote_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      ]
    }

    const idsForn = [...new Set([...fromMov, ...fromSkuForn])]
    loteIdsFromFilters =
      loteIdsFromFilters === null
        ? idsForn
        : loteIdsFromFilters.filter((id) => idsForn.includes(id))
  }

  let query = supabase
    .from('est_retirada_lotes')
    .select(
      `
      id,
      numero,
      status,
      observacao,
      movimento_em,
      created_at,
      usuarios (id, nome_completo),
      est_retirada_itens (
        id,
        quantidade,
        justificativa,
        cad_skus (codigo, nome),
        cad_locais_estoque (codigo)
      )
    `
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (!isSuperAdmin) {
    query = query.eq('empresa_id', empresaId)
  }

  if (loteIdsFromFilters !== null) {
    if (loteIdsFromFilters.length === 0) {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    } else {
      query = query.in('id', loteIdsFromFilters)
    }
  }

  if (q && q.trim()) {
    const term = q.trim()
    const orParts = [`numero.ilike.%${term}%`, `observacao.ilike.%${term}%`]

    let skuQuery = supabase
      .from('cad_skus')
      .select('id')
      .or(`codigo.ilike.%${term}%,nome.ilike.%${term}%`)
      .limit(80)
    if (!isSuperAdmin) skuQuery = skuQuery.eq('empresa_id', empresaId)
    const { data: skusMatch } = await skuQuery

    if (skusMatch && skusMatch.length > 0) {
      let itensQuery = supabase
        .from('est_retirada_itens')
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

    // Texto livre também tenta fornecedor → lotes com SKUs daquele fornecedor
    let leadQuery = supabase
      .from('crm_leads')
      .select('id')
      .or(`nome.ilike.%${term}%,documento.ilike.%${term}%`)
      .limit(40)
    if (!isSuperAdmin) leadQuery = leadQuery.eq('empresa_id', empresaId)
    const { data: leadsMatch } = await leadQuery
    if (leadsMatch && leadsMatch.length > 0) {
      let entQ = supabase
        .from('est_movimentos')
        .select('sku_id')
        .eq('tipo', 'entrada')
        .in(
          'pessoa_id',
          leadsMatch.map((l) => l.id),
        )
      if (!isSuperAdmin) entQ = entQ.eq('empresa_id', empresaId)
      const { data: entSkus } = await entQ
      const skuIds = [
        ...new Set(
          (entSkus || [])
            .map((e) => e.sku_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      ].slice(0, 200)
      if (skuIds.length > 0) {
        let itensQ = supabase
          .from('est_retirada_itens')
          .select('lote_id')
          .in('sku_id', skuIds)
        if (!isSuperAdmin) itensQ = itensQ.eq('empresa_id', empresaId)
        const { data: itensF } = await itensQ
        const loteIds = [
          ...new Set(
            (itensF || [])
              .map((i) => i.lote_id as string | null)
              .filter((id): id is string => Boolean(id)),
          ),
        ]
        if (loteIds.length > 0) {
          orParts.push(`id.in.(${loteIds.join(',')})`)
        }
      }
    }

    query = query.or(orParts.join(','))
  }

  const [{ data: lotes, error }, { data: skusFilter }, { data: fornecedoresFilter }] =
    await Promise.all([
      query,
      supabase
        .from('cad_skus')
        .select('id, codigo, nome')
        .eq('empresa_id', empresaId)
        .eq('controla_estoque', true)
        .eq('ativo', true)
        .order('codigo')
        .limit(150),
      supabase
        .from('crm_leads')
        .select('id, nome')
        .eq('empresa_id', empresaId)
        .contains('papeis', ['fornecedor'])
        .order('nome')
        .limit(150),
    ])

  return (
    <div className="space-y-4 pb-20 font-sans">
      <EstoqueAreaNav />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-red-400" />
            Retiradas Manuais de Estoque
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Lançamento direto de consumo interno ou saída operacional sem requisição formal.
          </p>
        </div>

        {canCreate && (
          <Link
            href="/cockpit/estoque/retiradas/novo"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-lg shadow-red-500/20 transition-all"
          >
            <Plus className="h-4 w-4" />
            Nova Retirada
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#121820] border border-[#ffffff0a] rounded-2xl p-4">
        <DebouncedSearchBox
          initialQuery={q || ''}
          placeholder="Buscar por lote, SKU ou fornecedor..."
          preserveParams={{ sku_id, pessoa_id }}
          className="relative w-full max-w-none"
          inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50"
        />
        <UrlFilterSelect
          name="sku_id"
          value={sku_id || ''}
          emptyLabel="Todos os SKUs"
          preserveParams={{ q, pessoa_id }}
          options={(skusFilter || []).map((s) => ({
            value: s.id,
            label: `${s.codigo} — ${s.nome}`,
          }))}
          className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500/50"
        />
        <UrlFilterSelect
          name="pessoa_id"
          value={pessoa_id || ''}
          emptyLabel="Todos os Fornecedores"
          preserveParams={{ q, sku_id }}
          options={(fornecedoresFilter || []).map((f) => ({
            value: f.id,
            label: f.nome,
          }))}
          className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500/50"
        />
      </div>

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        {error ? (
          <div className="p-8 text-center text-red-400 text-xs">
            Erro ao carregar retiradas: {error.message}
          </div>
        ) : !lotes || lotes.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-3">
              <ArrowUpRight className="h-7 w-7 text-red-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Nenhuma retirada registrada</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 mb-5">
              Não há lotes de retirada com os filtros informados.
            </p>
            {canCreate && (
              <Link
                href="/cockpit/estoque/retiradas/novo"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-all"
              >
                <Plus className="h-4 w-4" />
                Registrar Retirada
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
                  const itens = (lote.est_retirada_itens || []) as unknown as Array<{
                    id: string
                    quantidade: number
                    justificativa: string
                    cad_skus: { codigo: string; nome: string } | null
                    cad_locais_estoque: { codigo: string } | null
                  }>

                  return (
                    <tr key={lote.id} className="hover:bg-[#ffffff03] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white flex items-center gap-1.5">
                        <Link
                          href={`/cockpit/estoque/retiradas/${lote.id}`}
                          className="inline-flex items-center gap-1.5 hover:text-red-300"
                        >
                          <Layers className="h-3.5 w-3.5 text-gray-500" />
                          {lote.numero}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-gray-300 text-[11px]">
                          {itens.length} item(ns)
                        </span>
                        {itens[0]?.cad_skus && (
                          <span className="text-[10px] text-gray-500 block truncate max-w-xs">
                            {itens[0].cad_skus.codigo}: -{itens[0].quantidade} (
                            {itens[0].justificativa})
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
                            Erro
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
                          href={`/cockpit/estoque/cardex?q=${lote.numero}`}
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
