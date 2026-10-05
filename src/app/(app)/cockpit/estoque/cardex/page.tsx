import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import {
  BookOpen,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  SlidersHorizontal,
  ArrowRight,
  Boxes,
  Truck,
} from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import UrlFilterSelect from '@/components/UrlFilterSelect'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import EstoquePagination from '@/components/estoque/EstoquePagination'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { estoqueRange, parseEstoquePage } from '@/lib/estoque/listagem'
import {
  planCardexTextSearch,
  postgrestIlikePattern,
} from '@/lib/estoque/cardex-filters.mjs'

export const metadata = { title: 'Cardex / Livro Razão | HuginFlow' }

interface PageProps {
  searchParams: Promise<{
    q?: string
    tipo?: string
    sku_id?: string
    local_id?: string
    pessoa_id?: string
    movimento_id?: string
    lote_remessa_id?: string
    lote?: string
    page?: string
  }>
}

export default async function EstoqueCardexPage({ searchParams }: PageProps) {
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
          Seu grupo de acesso não possui permissão para visualizar o Cardex de movimentações.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const {
    q,
    tipo,
    sku_id,
    local_id,
    pessoa_id,
    movimento_id,
    lote_remessa_id,
    lote: loteParam,
    page: pageParam,
  } = await searchParams
  const { page, from, to, pageSize } = estoqueRange(parseEstoquePage(pageParam))
  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  // Resolve texto livre → SKUs e fornecedores (Performance SaaS: filtra no banco)
  let skuIdsFromQ: string[] = []
  let pessoaIdsFromQ: string[] = []
  let loteProdutoIdsFromLote: string[] = []
  const term = (q ?? '').trim()
  const loteFilter = (loteParam ?? '').trim()

  if (term) {
    const likePat = postgrestIlikePattern(term)
    if (likePat) {
      let skuQ = supabase
        .from('cad_skus')
        .select('id')
        .or(`codigo.ilike.${likePat},nome.ilike.${likePat}`)
        .limit(50)
      let leadQ = supabase
        .from('crm_leads')
        .select('id')
        .or(`nome.ilike.${likePat},documento.ilike.${likePat}`)
        .limit(50)
      if (empresaId) {
        skuQ = skuQ.eq('empresa_id', empresaId)
        leadQ = leadQ.eq('empresa_id', empresaId)
      }
      const [{ data: skusMatch }, { data: leadsMatch }] = await Promise.all([skuQ, leadQ])
      skuIdsFromQ = (skusMatch || []).map((s) => s.id)
      pessoaIdsFromQ = (leadsMatch || []).map((l) => l.id)
    }
  }

  // Filtro por número de lote produto (`lote=` ou termo de busca)
  {
    const loteSearch = loteFilter || term
    if (loteSearch) {
      const clean = loteSearch.replace(/%/g, '').replace(/"/g, '')
      let loteQ = supabase
        .from('est_lotes_produto')
        .select('id')
        .ilike('numero_lote', `%${clean}%`)
        .limit(100)
      if (empresaId) loteQ = loteQ.eq('empresa_id', empresaId)
      const { data: lotesMatch } = await loteQ
      loteProdutoIdsFromLote = (lotesMatch || []).map((l) => l.id)
    }
  }

  const searchPlan = planCardexTextSearch({
    term,
    skuIdsFromQ,
    pessoaIdsFromQ,
    skuIdFilter: sku_id,
    pessoaIdFilter: pessoa_id,
  })

  // 1. Carrega Movimentos (paginado — Performance SaaS)
  let movQuery = supabase
    .from('est_movimentos')
    .select(
      `
      id,
      tipo,
      quantidade,
      documento,
      motivo,
      motivo_codigo,
      origem,
      ajuste_sinal,
      sku_poder_id,
      quantidade_poder,
      lote_entrada_id,
      lote_retirada_id,
      lote_ajuste_id,
      lote_remessa_id,
      lote_transferencia_id,
      lote_produto_id,
      requisicao_id,
      movimento_em,
      created_at,
      cad_skus!est_movimentos_sku_id_fkey (id, codigo, nome, unidade_estoque),
      sku_poder:cad_skus!est_movimentos_sku_poder_id_fkey (id, codigo, nome, unidade_estoque),
      local:cad_locais_estoque!est_movimentos_local_id_fkey (id, codigo, nome),
      local_destino:cad_locais_estoque!est_movimentos_local_destino_id_fkey (id, codigo, nome),
      crm_leads!est_movimentos_pessoa_id_fkey (id, nome),
      usuarios!est_movimentos_usuario_id_fkey (id, nome_completo),
      est_lotes_produto (id, numero_lote, data_validade)
    `,
      { count: searchPlan.countMode },
    )
    .order('movimento_em', { ascending: false })
    .range(from, to)

  if (empresaId) {
    movQuery = movQuery.eq('empresa_id', empresaId)
  }

  if (movimento_id) {
    movQuery = movQuery.eq('id', movimento_id)
  }

  if (lote_remessa_id) {
    movQuery = movQuery.eq('lote_remessa_id', lote_remessa_id)
  }

  if (tipo && tipo !== 'todos') {
    movQuery = movQuery.eq('tipo', tipo)
  }

  if (sku_id) {
    movQuery = movQuery.eq('sku_id', sku_id)
  }

  if (local_id) {
    movQuery = movQuery.eq('local_id', local_id)
  }

  if (pessoa_id) {
    movQuery = movQuery.eq('pessoa_id', pessoa_id)
  }

  if (loteFilter && loteProdutoIdsFromLote.length > 0) {
    movQuery = movQuery.in('lote_produto_id', loteProdutoIdsFromLote)
  } else if (loteFilter && loteProdutoIdsFromLote.length === 0) {
    movQuery = movQuery.eq('lote_produto_id', '00000000-0000-0000-0000-000000000000')
  }

  if (searchPlan.mode === 'sku_ids') {
    if (loteProdutoIdsFromLote.length > 0 && !loteFilter) {
      movQuery = movQuery.or(
        `sku_id.in.(${searchPlan.skuIds.join(',')}),lote_produto_id.in.(${loteProdutoIdsFromLote.join(',')})`,
      )
    } else {
      movQuery = movQuery.in('sku_id', searchPlan.skuIds)
    }
  } else if (searchPlan.mode === 'pessoa_ids') {
    movQuery = movQuery.in('pessoa_id', searchPlan.pessoaIds)
  } else if (searchPlan.mode === 'sku_or_pessoa') {
    const parts = [
      `sku_id.in.(${searchPlan.skuIds.join(',')})`,
      `pessoa_id.in.(${searchPlan.pessoaIds.join(',')})`,
    ]
    if (loteProdutoIdsFromLote.length > 0 && !loteFilter) {
      parts.push(`lote_produto_id.in.(${loteProdutoIdsFromLote.join(',')})`)
    }
    movQuery = movQuery.or(parts.join(','))
  } else if (
    searchPlan.mode === 'documento_motivo' &&
    searchPlan.likePat &&
    !loteFilter
  ) {
    if (loteProdutoIdsFromLote.length > 0) {
      movQuery = movQuery.or(
        `documento.ilike.${searchPlan.likePat},motivo.ilike.${searchPlan.likePat},lote_produto_id.in.(${loteProdutoIdsFromLote.join(',')})`,
      )
    } else {
      movQuery = movQuery.or(
        `documento.ilike.${searchPlan.likePat},motivo.ilike.${searchPlan.likePat}`,
      )
    }
  } else if (
    searchPlan.mode === 'none' &&
    !loteFilter &&
    loteProdutoIdsFromLote.length > 0 &&
    term
  ) {
    movQuery = movQuery.in('lote_produto_id', loteProdutoIdsFromLote)
  }

  const { data: movimentos, error, count: movCount } = await movQuery

  // 2. Filtros auxiliares (SKU, local, fornecedor)
  const [{ data: skusFilter }, { data: locaisFilter }, { data: fornecedoresFilter }] =
    await Promise.all([
      supabase
        .from('cad_skus')
        .select('id, codigo, nome')
        .eq('empresa_id', empresaId)
        .eq('controla_estoque', true)
        .order('codigo')
        .limit(150),
      supabase
        .from('cad_locais_estoque')
        .select('id, codigo, nome')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('codigo'),
      supabase
        .from('crm_leads')
        .select('id, nome, documento')
        .eq('empresa_id', empresaId)
        .contains('papeis', ['fornecedor'])
        .order('nome')
        .limit(150),
    ])

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-amber-400" />
            Cardex — Livro Razão de Estoque
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Remessa grava dois lançamentos: saída do local próprio e entrada em TERCEIROS.
            Baixa definitiva debita só TERCEIROS (e o analítico por pessoa/lote).
          </p>
        </div>

        <Link
          href="/cockpit/estoque/saldos"
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-300 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff15] rounded-xl transition-all"
        >
          <Boxes className="h-3.5 w-3.5 text-emerald-400" />
          Ver Saldos Atuais
        </Link>
      </div>

      {/* Filtros (somente leitura do Cardex — não altera saldos) */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-4 space-y-3">
        {(movimento_id || lote_remessa_id) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            <span>
              {lote_remessa_id
                ? 'Filtro ativo: todos os lançamentos deste lote de remessa (saída, TERCEIROS, retorno/baixa).'
                : 'Filtro ativo: um único movimento do Cardex.'}
            </span>
            <Link
              href="/cockpit/estoque/cardex"
              className="font-semibold uppercase tracking-wider text-amber-300 hover:text-white"
            >
              Limpar filtro
            </Link>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <DebouncedSearchBox
            initialQuery={q || ''}
            placeholder="SKU, fornecedor, documento, motivo ou lote..."
            preserveParams={{
              tipo: tipo && tipo !== 'todos' ? tipo : undefined,
              sku_id,
              local_id,
              pessoa_id,
              lote_remessa_id,
              lote: loteFilter || undefined,
            }}
            className="relative w-full max-w-none md:col-span-2 lg:col-span-1"
            inputClassName="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl pl-10 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
          />

          <UrlFilterSelect
            name="tipo"
            value={tipo && tipo !== 'todos' ? tipo : ''}
            emptyLabel="Todos os Tipos"
            preserveParams={{ q, sku_id, local_id, pessoa_id, lote_remessa_id, lote: loteFilter || undefined }}
            options={[
              { value: 'entrada', label: 'Entradas' },
              { value: 'saida', label: 'Saídas / Consumo' },
              { value: 'ajuste', label: 'Ajustes (+/-)' },
              { value: 'remessa_saida', label: 'Remessa — saída próprio' },
              { value: 'remessa_entrada_terceiros', label: 'Remessa — entrada TERCEIROS' },
              { value: 'remessa_saida_terceiros', label: 'Remessa — saída TERCEIROS' },
              { value: 'remessa_retorno', label: 'Retorno — entrada próprio' },
              { value: 'remessa_baixa', label: 'Baixa definitiva (TERCEIROS)' },
              { value: 'transferencia', label: 'Transferências' },
            ]}
            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
          />

          <UrlFilterSelect
            name="sku_id"
            value={sku_id || ''}
            emptyLabel="Todos os SKUs"
            preserveParams={{
              q,
              tipo: tipo && tipo !== 'todos' ? tipo : undefined,
              local_id,
              pessoa_id,
              lote_remessa_id,
              lote: loteFilter || undefined,
            }}
            options={(skusFilter || []).map((s) => ({
              value: s.id,
              label: `${s.codigo} - ${s.nome}`,
            }))}
            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
          />

          <UrlFilterSelect
            name="pessoa_id"
            value={pessoa_id || ''}
            emptyLabel="Todos os Fornecedores"
            preserveParams={{
              q,
              tipo: tipo && tipo !== 'todos' ? tipo : undefined,
              sku_id,
              local_id,
              lote_remessa_id,
              lote: loteFilter || undefined,
            }}
            options={(fornecedoresFilter || []).map((f) => ({
              value: f.id,
              label: f.documento ? `${f.nome} (${f.documento})` : f.nome,
            }))}
            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
          />

          <UrlFilterSelect
            name="local_id"
            value={local_id || ''}
            emptyLabel="Todos os Locais"
            preserveParams={{
              q,
              tipo: tipo && tipo !== 'todos' ? tipo : undefined,
              sku_id,
              pessoa_id,
              lote_remessa_id,
              lote: loteFilter || undefined,
            }}
            options={(locaisFilter || []).map((l) => ({
              value: l.id,
              label: `${l.codigo} - ${l.nome}`,
            }))}
            className="w-full bg-[#0d1218] border border-[#ffffff10] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
          />
        </div>
        {loteFilter && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            <span>
              Filtro de lote produto: <span className="font-mono font-semibold">{loteFilter}</span>
            </span>
            <Link
              href={`/cockpit/estoque/cardex?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(tipo && tipo !== 'todos' ? { tipo } : {}),
                ...(sku_id ? { sku_id } : {}),
                ...(pessoa_id ? { pessoa_id } : {}),
                ...(local_id ? { local_id } : {}),
              }).toString()}`}
              className="font-semibold uppercase tracking-wider text-amber-300 hover:text-white"
            >
              Limpar lote
            </Link>
          </div>
        )}
      </div>

      {/* Tabela do Cardex */}
      <div
        className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl"
        data-testid="estoque-cardex-panel"
      >
        {error ? (
          <div
            className="p-8 text-center text-red-400 text-xs"
            data-testid="estoque-cardex-error"
            role="alert"
          >
            Erro ao carregar Cardex: {error.message}
          </div>
        ) : !movimentos || movimentos.length === 0 ? (
          <div className="p-12 text-center" data-testid="estoque-cardex-empty">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
              <BookOpen className="h-7 w-7 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Nenhum movimento registrado</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
              Não há registros no Cardex com os filtros informados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="estoque-cardex-table">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0e1319] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
                <tr>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">SKU / Produto</th>
                  <th className="py-3 px-4">Lote</th>
                  <th className="py-3 px-4">Validade</th>
                  <th className="py-3 px-4">Local</th>
                  <th className="py-3 px-4 text-right">Impacto</th>
                  <th className="py-3 px-4">Documento / Motivo</th>
                  <th className="py-3 px-4 text-right">Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff05]">
                {movimentos.map((mov) => {
                  const sku = mov.cad_skus as { id?: string; codigo?: string; nome?: string; unidade_estoque?: string } | null
                  const local = mov.local as { id?: string; codigo?: string; nome?: string } | null
                  const localDestino = mov.local_destino as { id?: string; codigo?: string; nome?: string } | null
                  const pessoa = mov.crm_leads as { id?: string; nome?: string } | null

                  const skuPoder = mov.sku_poder as {
                    id?: string
                    codigo?: string
                    nome?: string
                    unidade_estoque?: string
                  } | null
                  const loteRaw = mov.est_lotes_produto as
                    | { numero_lote?: string; data_validade?: string | null }
                    | { numero_lote?: string; data_validade?: string | null }[]
                    | null
                  const loteEmbed = Array.isArray(loteRaw) ? loteRaw[0] : loteRaw
                  const isRemessa =
                    mov.tipo === 'remessa_baixa' ||
                    mov.tipo === 'remessa_saida' ||
                    mov.tipo === 'remessa_entrada_terceiros' ||
                    mov.tipo === 'remessa_saida_terceiros' ||
                    mov.tipo === 'remessa_retorno'
                  const isEntrada =
                    mov.tipo === 'entrada' ||
                    mov.tipo === 'remessa_retorno' ||
                    mov.tipo === 'remessa_entrada_terceiros' ||
                    (mov.tipo === 'ajuste' && mov.ajuste_sinal === 'positivo')
                  const um = sku?.unidade_estoque || 'UN'
                  const isTerceirosLocal =
                    local?.codigo === 'TERCEIROS' ||
                    mov.tipo === 'remessa_entrada_terceiros' ||
                    mov.tipo === 'remessa_saida_terceiros' ||
                    mov.tipo === 'remessa_baixa'

                  return (
                    <tr key={mov.id} className="hover:bg-[#ffffff03] transition-colors">
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                        <div className="text-[11px] font-mono">
                          {new Date(mov.movimento_em || mov.created_at).toLocaleString('pt-BR')}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <TipoMovimentoBadge tipo={mov.tipo} ajusteSinal={mov.ajuste_sinal} />
                      </td>
                      <td className="py-3 px-4">
                        {sku ? (
                          <div>
                            <span className="font-mono font-bold text-white block">
                              {sku.codigo}
                            </span>
                            <span className="text-[10px] text-gray-400 block truncate max-w-xs">
                              {sku.nome}
                            </span>
                            {mov.tipo === 'remessa_retorno' &&
                              skuPoder?.codigo &&
                              skuPoder.codigo !== sku.codigo && (
                                <span className="text-[10px] text-amber-400/90 block mt-0.5">
                                  fecha poder: {skuPoder.codigo}
                                </span>
                              )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {loteEmbed?.numero_lote ? (
                          <span className="font-mono text-white text-[11px]">
                            {loteEmbed.numero_lote}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                        {loteEmbed?.data_validade
                          ? (() => {
                              const iso = loteEmbed.data_validade as string
                              const [y, m, d] = iso.split('-')
                              return y && m && d ? `${d}/${m}/${y}` : iso
                            })()
                          : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-300">
                        {local && localDestino ? (
                          <span>
                            {local.codigo}
                            <ArrowRight className="inline h-2.5 w-2.5 mx-0.5 text-gray-500" />
                            {localDestino.codigo}
                          </span>
                        ) : local ? (
                          <div>
                            <span className={isTerceirosLocal ? 'text-purple-300' : undefined}>
                              {local.codigo}
                            </span>
                            {pessoa?.nome && isRemessa && (
                              <span className="block text-[10px] text-purple-400/80 truncate max-w-[9rem]">
                                {pessoa.nome}
                              </span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-0.5 ${
                            isEntrada ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {isEntrada ? '+' : '−'}
                          {mov.quantidade} {um}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="truncate text-white font-medium">
                          {mov.motivo || '—'}
                        </div>
                        {mov.documento && (
                          <span className="text-[10px] text-gray-500 font-mono block">
                            Doc: {mov.documento}
                          </span>
                        )}
                        {pessoa && !isRemessa && (
                          <span className="text-[10px] text-purple-400 block truncate">
                            {pessoa.nome}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {mov.lote_entrada_id && (
                          <Link
                            href={`/cockpit/estoque/entradas/${mov.lote_entrada_id}`}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 hover:underline"
                          >
                            Entrada
                            <ArrowRight className="h-2.5 w-2.5" />
                          </Link>
                        )}
                        {mov.lote_retirada_id && (
                          <Link
                            href={`/cockpit/estoque/retiradas/${mov.lote_retirada_id}`}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-red-400 hover:underline"
                          >
                            Retirada
                            <ArrowRight className="h-2.5 w-2.5" />
                          </Link>
                        )}
                        {mov.lote_ajuste_id && (
                          <Link
                            href={`/cockpit/estoque/ajustes/${mov.lote_ajuste_id}`}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-blue-400 hover:underline"
                          >
                            Ajuste
                            <ArrowRight className="h-2.5 w-2.5" />
                          </Link>
                        )}
                        {mov.lote_transferencia_id && (
                          <Link
                            href={`/cockpit/estoque/transferencias/${mov.lote_transferencia_id}`}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:underline"
                          >
                            Transferência
                            <ArrowRight className="h-2.5 w-2.5" />
                          </Link>
                        )}
                        {mov.requisicao_id && (
                          <Link
                            href={`/cockpit/estoque/requisicoes/${mov.requisicao_id}`}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-purple-400 hover:underline"
                          >
                            Requisição
                            <ArrowRight className="h-2.5 w-2.5" />
                          </Link>
                        )}
                        {mov.lote_remessa_id && (
                          <Link
                            href={`/cockpit/estoque/remessas/${mov.lote_remessa_id}`}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-blue-400 hover:underline"
                          >
                            Remessa
                            <ArrowRight className="h-2.5 w-2.5" />
                          </Link>
                        )}
                        {!mov.lote_entrada_id &&
                          !mov.lote_retirada_id &&
                          !mov.lote_ajuste_id &&
                          !mov.lote_transferencia_id &&
                          !mov.requisicao_id &&
                          !mov.lote_remessa_id && (
                          <span className="text-[10px] text-gray-500 font-mono">
                            {mov.origem || 'manual'}
                          </span>
                        )}
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
            total={movCount ?? movimentos?.length ?? 0}
            baseQuery={new URLSearchParams({
              ...(q ? { q } : {}),
              ...(tipo && tipo !== 'todos' ? { tipo } : {}),
              ...(sku_id ? { sku_id } : {}),
              ...(pessoa_id ? { pessoa_id } : {}),
              ...(local_id ? { local_id } : {}),
              ...(lote_remessa_id ? { lote_remessa_id } : {}),
              ...(movimento_id ? { movimento_id } : {}),
              ...(loteFilter ? { lote: loteFilter } : {}),
            }).toString()}
          />
        </div>
      </div>
    </div>
  )
}

function TipoMovimentoBadge({
  tipo,
  ajusteSinal,
}: {
  tipo: string
  ajusteSinal?: string | null
}) {
  if (tipo === 'entrada') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <ArrowDownLeft className="h-3 w-3" />
        Entrada
      </span>
    )
  }
  if (tipo === 'saida') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
        <ArrowUpRight className="h-3 w-3" />
        Saída
      </span>
    )
  }
  if (tipo === 'ajuste') {
    const isPos = ajusteSinal === 'positivo'
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
          isPos
            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        }`}
      >
        <SlidersHorizontal className="h-3 w-3" />
        Ajuste ({isPos ? '+' : '-'})
      </span>
    )
  }
  if (tipo === 'remessa_saida') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
        <Truck className="h-3 w-3" />
        Saída remessa
      </span>
    )
  }
  if (tipo === 'remessa_entrada_terceiros') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
        <Truck className="h-3 w-3" />
        Entrada TERCEIROS
      </span>
    )
  }
  if (tipo === 'remessa_saida_terceiros') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
        <Truck className="h-3 w-3" />
        Saída TERCEIROS
      </span>
    )
  }
  if (tipo === 'remessa_retorno') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <Truck className="h-3 w-3" />
        Retorno remessa
      </span>
    )
  }
  if (tipo === 'remessa_baixa') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Truck className="h-3 w-3" />
        Baixa TERCEIROS
      </span>
    )
  }
  if (tipo === 'transferencia') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
        <RefreshCw className="h-3 w-3" />
        Transferência
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
      {tipo}
    </span>
  )
}
