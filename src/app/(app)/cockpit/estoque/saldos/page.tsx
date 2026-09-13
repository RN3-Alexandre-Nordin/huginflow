import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Boxes, BookOpen, Lock, Building2, MapPin, Layers } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import UrlFilterSelect from '@/components/UrlFilterSelect'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import EstoquePagination from '@/components/estoque/EstoquePagination'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { estoqueRange, parseEstoquePage } from '@/lib/estoque/listagem'

export const metadata = { title: 'Posição de Saldos | HuginFlow' }

type VisaoProprio = 'por_local' | 'total'

interface PageProps {
  searchParams: Promise<{
    aba?: string
    q?: string
    local_id?: string
    visao?: string
    page?: string
  }>
}

type SaldoProprioRow = {
  id: string
  local_id: string
  quantidade: number
  cad_skus: {
    id: string
    codigo: string
    nome: string
    unidade_estoque: string
  } | null
  cad_locais_estoque: { id: string; codigo: string; nome: string } | null
}

type SaldoConsolidadoRow = {
  sku_id: string
  sku_codigo: string
  sku_nome: string
  unidade_estoque: string
  quantidade: number
}

export default async function EstoqueSaldosPage({ searchParams }: PageProps) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_relatorios', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar saldos de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const { aba = 'proprio', q, local_id, visao: visaoParam, page: pageParam } = await searchParams
  const visao: VisaoProprio = visaoParam === 'total' ? 'total' : 'por_local'
  const { page, from, to, pageSize } = estoqueRange(parseEstoquePage(pageParam))
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  const { data: locais } = await supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('codigo')

  let saldosProprios: SaldoProprioRow[] = []
  let saldosConsolidados: SaldoConsolidadoRow[] = []
  let totalRows = 0
  let consolidadoErro: string | null = null

  let saldosTerceiros: Array<{
    quantidade: number
    cad_skus: { id: string; codigo: string; nome: string; unidade_estoque: string } | null
    crm_leads: { id: string; nome: string; documento: string | null } | null
  }> = []

  if (aba === 'proprio') {
    if (visao === 'total') {
      let query = supabase
        .from('est_vw_saldos_consolidados')
        .select('sku_id, sku_codigo, sku_nome, unidade_estoque, quantidade', {
          count: 'exact',
        })
        .order('quantidade', { ascending: false })
        .range(from, to)

      if (!isSuperAdmin) query = query.eq('empresa_id', empresaId)
      if (q?.trim()) {
        const term = q.trim()
        query = query.or(`sku_codigo.ilike.%${term}%,sku_nome.ilike.%${term}%`)
      }

      const { data, count, error: consErr } = await query
      if (consErr) consolidadoErro = consErr.message
      saldosConsolidados = (data as SaldoConsolidadoRow[]) || []
      totalRows = count ?? saldosConsolidados.length
    } else {
      let skuIds: string[] | null = null
      if (q?.trim()) {
        const term = q.trim()
        let skuQ = supabase
          .from('cad_skus')
          .select('id')
          .or(`codigo.ilike.%${term}%,nome.ilike.%${term}%`)
          .limit(200)
        if (!isSuperAdmin) skuQ = skuQ.eq('empresa_id', empresaId)
        const { data: skusMatch } = await skuQ
        skuIds = (skusMatch || []).map((s) => s.id)
      }

      let query = supabase
        .from('est_saldos')
        .select(
          `
          id,
          local_id,
          quantidade,
          cad_skus (id, codigo, nome, unidade_estoque),
          cad_locais_estoque (id, codigo, nome)
        `,
          { count: 'exact' },
        )
        .order('quantidade', { ascending: false })
        .range(from, to)

      if (!isSuperAdmin) query = query.eq('empresa_id', empresaId)
      if (local_id) query = query.eq('local_id', local_id)
      if (skuIds) {
        if (skuIds.length === 0) {
          query = query.eq('sku_id', '00000000-0000-0000-0000-000000000000')
        } else {
          query = query.in('sku_id', skuIds)
        }
      }

      const { data, count } = await query
      saldosProprios = ((data as unknown as SaldoProprioRow[]) || []).sort((a, b) => {
        const ca = a.cad_locais_estoque?.codigo || ''
        const cb = b.cad_locais_estoque?.codigo || ''
        if (ca !== cb) return ca.localeCompare(cb)
        return (a.cad_skus?.codigo || '').localeCompare(b.cad_skus?.codigo || '')
      })
      totalRows = count ?? saldosProprios.length
    }
  } else {
    let query = supabase
      .from('est_saldos_poder_terceiros')
      .select(
        `
        quantidade,
        cad_skus (id, codigo, nome, unidade_estoque),
        crm_leads (id, nome, documento)
      `,
        { count: 'exact' },
      )
      .gt('quantidade', 0)
      .order('quantidade', { ascending: false })
      .range(from, to)

    if (!isSuperAdmin) query = query.eq('empresa_id', empresaId)

    const { data, count } = await query
    saldosTerceiros = (data as unknown as typeof saldosTerceiros) || []
    totalRows = count ?? saldosTerceiros.length

    if (q?.trim()) {
      const term = q.trim().toLowerCase()
      saldosTerceiros = saldosTerceiros.filter(
        (s) =>
          s.cad_skus?.codigo.toLowerCase().includes(term) ||
          s.cad_skus?.nome.toLowerCase().includes(term) ||
          s.crm_leads?.nome.toLowerCase().includes(term),
      )
    }
  }

  const qsBase = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    Object.entries(extra).forEach(([k, v]) => {
      if (v) p.set(k, v)
    })
    return p.toString()
  }

  const pagerQuery = qsBase({
    aba,
    ...(aba === 'proprio' ? { visao } : {}),
    q,
    ...(aba === 'proprio' && visao === 'por_local' ? { local_id } : {}),
  })

  // Agrupa posição por depósito (só totalizadores por local + linhas SKU limpas)
  const gruposLocal =
    aba === 'proprio' && visao === 'por_local'
      ? (() => {
          const map = new Map<
            string,
            {
              localId: string
              label: string
              rows: SaldoProprioRow[]
            }
          >()
          for (const s of saldosProprios) {
            const key = s.local_id || 'x'
            const loc = s.cad_locais_estoque
            const label = loc ? `${loc.codigo} — ${loc.nome}` : 'Local não definido'
            const g = map.get(key)
            if (g) {
              g.rows.push(s)
            } else {
              map.set(key, {
                localId: s.local_id,
                label,
                rows: [s],
              })
            }
          }
          return [...map.values()]
        })()
      : []

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Boxes className="h-5 w-5 text-emerald-400" />
            Posição de Saldos
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Totalizadores da posição atual — não é o histórico de lançamentos (isso é o Cardex).
          </p>
        </div>

        <Link
          href="/cockpit/estoque/cardex"
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-300 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff15] rounded-xl transition-all"
        >
          <BookOpen className="h-3.5 w-3.5 text-amber-400" />
          Ver histórico no Cardex
        </Link>
      </div>

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-4 space-y-4 shadow-xl">
        <div className="flex flex-col gap-4 border-b border-[#ffffff08] pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/cockpit/estoque/saldos?${qsBase({
                  aba: 'proprio',
                  visao,
                  q,
                  ...(visao === 'por_local' ? { local_id } : {}),
                })}`}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  aba === 'proprio'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#ffffff05]'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                Estoque próprio
              </Link>
              <Link
                href={`/cockpit/estoque/saldos?${qsBase({ aba: 'terceiros', q })}`}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  aba === 'terceiros'
                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#ffffff05]'
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                Em poder de terceiros
              </Link>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-lg">
              <DebouncedSearchBox
                initialQuery={q || ''}
                placeholder="Filtrar produto..."
                preserveParams={{
                  aba,
                  ...(aba === 'proprio' ? { visao } : {}),
                  ...(aba === 'proprio' && visao === 'por_local' && local_id
                    ? { local_id }
                    : {}),
                }}
                className="relative flex-1 max-w-none"
                inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
              />
              {aba === 'proprio' && visao === 'por_local' && (
                <UrlFilterSelect
                  name="local_id"
                  value={local_id || ''}
                  emptyLabel="Todos os depósitos"
                  preserveParams={{ aba, q, visao }}
                  options={(locais || []).map((l) => ({
                    value: l.id,
                    label: l.codigo,
                  }))}
                  className="bg-[#0d1218] border border-[#ffffff10] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                />
              )}
            </div>
          </div>

          {aba === 'proprio' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-600 px-1">
                Como ver o saldo
              </span>
              <Link
                href={`/cockpit/estoque/saldos?${qsBase({
                  aba: 'proprio',
                  visao: 'por_local',
                  q,
                  local_id,
                })}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  visao === 'por_local'
                    ? 'bg-[#2BAADF]/15 text-[#2BAADF] border border-[#2BAADF]/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#ffffff05] border border-transparent'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                Saldo por depósito
              </Link>
              <Link
                href={`/cockpit/estoque/saldos?${qsBase({
                  aba: 'proprio',
                  visao: 'total',
                  q,
                })}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  visao === 'total'
                    ? 'bg-[#2BAADF]/15 text-[#2BAADF] border border-[#2BAADF]/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#ffffff05] border border-transparent'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Saldo da empresa
              </Link>
            </div>
          )}
        </div>

        {/* Orientação da visão ativa */}
        {aba === 'proprio' && (
          <p className="text-xs text-gray-500 px-0.5">
            {visao === 'total'
              ? 'Posição consolidada da empresa (depósitos somados por produto).'
              : local_id
                ? 'Posição do depósito selecionado (saldo por produto).'
                : 'Posição por depósito (saldo constante de cada produto no local).'}
          </p>
        )}

        {aba === 'proprio' ? (
          visao === 'por_local' ? (
            <div className="space-y-3">
              {gruposLocal.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs">
                  Nenhum saldo neste filtro.
                </div>
              ) : (
                gruposLocal.map((g) => (
                  <div
                    key={g.localId || g.label}
                    className="rounded-xl border border-[#ffffff0a] overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-4 py-3 bg-[#0e1319] border-b border-[#ffffff08]">
                      <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span className="text-sm font-semibold text-white truncate">
                        {g.label}
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono shrink-0">
                        {g.rows.length} produto(s)
                      </span>
                    </div>
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="text-gray-500 uppercase tracking-wider text-[10px] border-b border-[#ffffff05]">
                        <tr>
                          <th className="py-2 px-4 font-medium">Produto</th>
                          <th className="py-2 px-4 text-right font-medium">Saldo</th>
                          <th className="py-2 px-4 text-right font-medium w-28">Cardex</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ffffff05]">
                        {g.rows.map((s) => {
                          const skuId = s.cad_skus?.id
                          const cardexHref =
                            skuId && s.local_id
                              ? `/cockpit/estoque/cardex?${new URLSearchParams({
                                  sku_id: skuId,
                                  local_id: s.local_id,
                                }).toString()}`
                              : skuId
                                ? `/cockpit/estoque/cardex?sku_id=${encodeURIComponent(skuId)}`
                                : null

                          return (
                            <tr key={s.id} className="hover:bg-[#ffffff03] transition-colors">
                              <td className="py-2.5 px-4">
                                <span className="font-mono font-semibold text-white">
                                  {s.cad_skus?.codigo}
                                </span>
                                <span className="text-gray-500 mx-1.5">·</span>
                                <span className="text-gray-400">{s.cad_skus?.nome}</span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-white">
                                {s.quantidade}{' '}
                                <span className="text-gray-500 font-normal">
                                  {s.cad_skus?.unidade_estoque || 'UN'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                {cardexHref ? (
                                  <Link
                                    href={cardexHref}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 hover:underline"
                                    title="Composição no Cardex (SKU + local)"
                                  >
                                    <BookOpen className="h-3 w-3" />
                                    Ver Cardex
                                  </Link>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
              <EstoquePagination
                page={page}
                pageSize={pageSize}
                total={totalRows}
                baseQuery={pagerQuery}
              />
            </div>
          ) : (
            <div>
              {consolidadoErro && (
                <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
                  {consolidadoErro}
                </div>
              )}
              {saldosConsolidados.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs">
                  Nenhum saldo consolidado neste filtro.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#ffffff0a]">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="bg-[#0e1319] text-gray-500 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                      <tr>
                        <th className="py-3 px-4 font-medium">Produto</th>
                        <th className="py-3 px-4 text-right font-medium">
                          Saldo total (empresa)
                        </th>
                        <th className="py-3 px-4 text-right font-medium w-28">Cardex</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ffffff05]">
                      {saldosConsolidados.map((s) => {
                        const cardexHref = `/cockpit/estoque/cardex?sku_id=${encodeURIComponent(s.sku_id)}`
                        return (
                          <tr key={s.sku_id} className="hover:bg-[#ffffff03] transition-colors">
                            <td className="py-3 px-4">
                              <span className="font-mono font-semibold text-white">
                                {s.sku_codigo}
                              </span>
                              <span className="text-gray-500 mx-1.5">·</span>
                              <span className="text-gray-400">{s.sku_nome}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                              {s.quantidade}{' '}
                              <span className="text-gray-500 font-normal text-xs">
                                {s.unidade_estoque || 'UN'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Link
                                href={cardexHref}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 hover:underline"
                                title="Composição no Cardex (SKU)"
                              >
                                <BookOpen className="h-3 w-3" />
                                Ver Cardex
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <EstoquePagination
                page={page}
                pageSize={pageSize}
                total={totalRows}
                baseQuery={pagerQuery}
              />
            </div>
          )
        ) : (
          <div>
            {saldosTerceiros.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs">
                Nenhum saldo em poder de terceiros.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#ffffff0a]">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-[#0e1319] text-gray-500 uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                    <tr>
                      <th className="py-3 px-4 font-medium">Terceiro</th>
                      <th className="py-3 px-4 font-medium">Produto</th>
                      <th className="py-3 px-4 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ffffff05]">
                    {saldosTerceiros.map((st, idx) => (
                      <tr key={idx}>
                        <td className="py-3 px-4 text-white">{st.crm_leads?.nome || '—'}</td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-white">{st.cad_skus?.codigo}</span>
                          <span className="text-gray-500 mx-1">·</span>
                          <span className="text-gray-400">{st.cad_skus?.nome}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-purple-400">
                          {st.quantidade} {st.cad_skus?.unidade_estoque || 'UN'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <EstoquePagination
              page={page}
              pageSize={pageSize}
              total={totalRows}
              baseQuery={pagerQuery}
            />
          </div>
        )}
      </div>
    </div>
  )
}
