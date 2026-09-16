import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Lock, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import ReportFiltersForm from '@/components/estoque/relatorios/ReportFiltersForm'
import ReportExportBar from '@/components/estoque/relatorios/ReportExportBar'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { getReportBySlug } from '@/lib/estoque/relatorios/catalog'
import { PAGE_SIZE_DEFAULT, runEstoqueReport } from '@/lib/estoque/relatorios/queries'
import { formatReportCell, formatReportResumo } from '@/lib/estoque/relatorios/format'

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const def = getReportBySlug(slug)
  return { title: def ? `${def.title} | Relatórios` : 'Relatório | HuginFlow' }
}

function buildPageHref(
  slug: string,
  values: Record<string, string>,
  offset: number
): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(values)) {
    if (k === 'offset' || k === 'page') continue
    if (v != null && v !== '') params.set(k, v)
  }
  if (offset > 0) params.set('offset', String(offset))
  const qs = params.toString()
  return `/cockpit/estoque/relatorios/${slug}${qs ? `?${qs}` : ''}`
}

export default async function EstoqueRelatorioSlugPage(props: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await props.params
  const def = getReportBySlug(slug)
  if (!def) notFound()

  const me = await getMyProfile()
  const canView =
    me?.role_global === 'superadmin' ||
    me?.role_global === 'admin' ||
    hasPermission(me, 'estoque_relatorios', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <p className="text-white font-bold text-xl">Sem permissão.</p>
        <BackTextButton className="mt-6 text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) {
    return <p className="text-gray-400">Empresa não identificada.</p>
  }

  const sp = await props.searchParams
  const get = (k: string) => {
    const v = sp[k]
    return typeof v === 'string' ? v : ''
  }

  const pageSize = PAGE_SIZE_DEFAULT
  const offset = Math.max(Number(get('offset') || '0') || 0, 0)

  const filters = {
    data_inicio: get('data_inicio') || undefined,
    data_fim: get('data_fim') || undefined,
    local_id: get('local_id') || undefined,
    sku_codigo: get('sku_codigo') || undefined,
    familia_id: get('familia_id') || undefined,
    so_com_saldo: get('so_com_saldo') !== '0',
    criterio_critico: get('criterio_critico') || undefined,
    status_req: get('status_req') || undefined,
    origem_req: get('origem_req') || undefined,
    origem_saida: get('origem_saida') || undefined,
    dias_sem_movimento: get('dias_sem_movimento')
      ? Number(get('dias_sem_movimento'))
      : undefined,
    terceiro_id: get('terceiro_id') || undefined,
    status_remessa: get('status_remessa') || undefined,
    sinal_ajuste: get('sinal_ajuste') || undefined,
    limit: pageSize,
    offset,
  }

  const supabase = await createClient()

  const [locaisRes, familiasRes, terceirosRes, report] = await Promise.all([
    supabase
      .from('cad_locais_estoque')
      .select('id, codigo, nome')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('codigo'),
    supabase
      .from('cad_sku_familias')
      .select('id, codigo, nome')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('ordem')
      .order('nome'),
    supabase
      .from('crm_leads')
      .select('id, nome')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('nome')
      .limit(300),
    runEstoqueReport(slug, empresaId, filters, supabase),
  ])

  const Icon = def.icon
  const values: Record<string, string> = {}
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') values[k] = v
  }

  const displayRows = report.rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const c of def.columns) {
      out[c.key] = formatReportCell(row[c.key], c.format)
    }
    return out
  })

  const totalCount = Number(report.resumo?.total_count ?? report.rows.length) || 0
  const hasPrev = offset > 0
  const hasNext = offset + pageSize < totalCount
  const fromRow = totalCount === 0 ? 0 : offset + 1
  const toRow = Math.min(offset + pageSize, totalCount)

  return (
    <div className="space-y-6 pb-20">
      <EstoqueAreaNav />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/cockpit/estoque/relatorios"
            className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#2BAADF]"
          >
            <ArrowLeft className="h-3 w-3" />
            Relatórios
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Icon className="h-5 w-5 text-[#2BAADF]" />
            {def.title}
          </h1>
          <p className="mt-0.5 text-xs text-gray-400">{def.description}</p>
        </div>
        <ReportExportBar
          title={def.title}
          columns={def.columns}
          rows={displayRows}
          fileBase={`estoque_${slug}`}
        />
      </div>

      <ReportFiltersForm
        key={Object.keys(values)
          .filter((k) => k !== 'offset')
          .sort()
          .map((k) => `${k}=${values[k]}`)
          .join('&') || 'empty'}
        slug={slug}
        filterKeys={def.filters}
        values={values}
        locais={(locaisRes.data || []).map((l) => ({
          id: l.id,
          label: `${l.codigo} · ${l.nome}`,
        }))}
        familias={(familiasRes.data || []).map((f) => ({
          id: f.id,
          label: `${f.codigo} · ${f.nome}`,
        }))}
        terceiros={(terceirosRes.data || []).map((t) => ({
          id: t.id,
          label: t.nome || t.id,
        }))}
      />

      {report.resumo && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-300">
          {Object.entries(report.resumo).map(([k, v]) => (
            <span
              key={k}
              className="rounded-lg border border-[#ffffff10] bg-[#0A0A0A] px-3 py-1.5"
            >
              <span className="text-gray-500">{k}: </span>
              <span className="font-semibold text-white">{formatReportResumo(k, v)}</span>
            </span>
          ))}
        </div>
      )}

      {report.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {report.error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#ffffff0a] bg-[#111111]">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="border-b border-[#ffffff08] bg-[#0A0A0A] text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              {def.columns.map((c) => (
                <th key={c.key} className="px-3 py-3 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ffffff06]">
            {displayRows.length === 0 ? (
              <tr>
                <td
                  colSpan={def.columns.length}
                  className="px-4 py-10 text-center text-gray-500"
                >
                  Nenhum dado para os filtros informados.
                </td>
              </tr>
            ) : (
              displayRows.map((row, i) => (
                <tr key={i} className="hover:bg-[#ffffff04]">
                  {def.columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 whitespace-nowrap ${
                        c.format === 'money' ? 'font-mono text-emerald-200/90' : 'text-gray-200'
                      }`}
                    >
                      {String(row[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
          <span>
            {fromRow}–{toRow} de {totalCount}
          </span>
          <div className="flex gap-2">
            {hasPrev ? (
              <Link
                href={buildPageHref(slug, values, Math.max(0, offset - pageSize))}
                className="inline-flex items-center gap-1 rounded-xl border border-[#ffffff15] px-3 py-2 text-gray-200 hover:bg-[#ffffff08]"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-xl border border-[#ffffff08] px-3 py-2 opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </span>
            )}
            {hasNext ? (
              <Link
                href={buildPageHref(slug, values, offset + pageSize)}
                className="inline-flex items-center gap-1 rounded-xl border border-[#ffffff15] px-3 py-2 text-gray-200 hover:bg-[#ffffff08]"
              >
                Próxima
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-xl border border-[#ffffff08] px-3 py-2 opacity-40">
                Próxima
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
