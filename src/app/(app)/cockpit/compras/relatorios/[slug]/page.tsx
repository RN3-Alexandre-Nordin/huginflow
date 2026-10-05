import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import ReportExportBar from '@/components/estoque/relatorios/ReportExportBar'
import ComprasReportFiltersForm from '@/components/compras/relatorios/ReportFiltersForm'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import {
  COMPRAS_RESUMO_LABEL,
  getComprasReportBySlug,
} from '@/lib/compras/relatorios/catalog'
import { PAGE_SIZE_DEFAULT, runComprasReport } from '@/lib/compras/relatorios/queries'
import { formatReportCell, formatReportResumo } from '@/lib/estoque/relatorios/format'

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const def = getComprasReportBySlug(slug)
  return { title: def ? `${def.title} | Compras` : 'Relatório | HuginFlow' }
}

function buildPageHref(slug: string, values: Record<string, string>, offset: number): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(values)) {
    if (k === 'offset' || k === 'page') continue
    if (v) params.set(k, v)
  }
  if (offset > 0) params.set('offset', String(offset))
  const qs = params.toString()
  return `/cockpit/compras/relatorios/${slug}${qs ? `?${qs}` : ''}`
}

export default async function ComprasRelatorioSlugPage(props: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await props.params
  const def = getComprasReportBySlug(slug)
  if (!def) notFound()

  const me = await getMyProfile()
  const canView =
    me?.role_global === 'superadmin' ||
    me?.role_global === 'admin' ||
    hasPermission(me, 'compras_relatorios', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <p className="text-xl font-bold text-white">Sem permissão.</p>
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
  const offset = Math.max(Number(get('offset') || '0') || 0, 0)
  const pageSize = PAGE_SIZE_DEFAULT

  const supabase = await createClient()
  const report = await runComprasReport(
    slug,
    empresaId,
    {
      data_inicio: get('data_inicio') || undefined,
      data_fim: get('data_fim') || undefined,
      tipo: get('tipo') || undefined,
      sku_codigo: get('sku_codigo') || undefined,
      situacao: get('situacao') || undefined,
      status: get('status') || undefined,
      limit: pageSize,
      offset,
    },
    supabase,
  )

  const Icon = def.icon
  const values: Record<string, string> = {}
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') values[k] = v
  }

  const displayRows = report.rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const c of def.columns) out[c.key] = formatReportCell(row[c.key], c.format)
    return out
  })

  const totalCount = Number(report.resumo?.total_count ?? report.rows.length) || 0
  const hasPrev = offset > 0
  const hasNext = offset + pageSize < totalCount
  const fromRow = totalCount === 0 ? 0 : offset + 1
  const toRow = Math.min(offset + pageSize, totalCount)

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/cockpit/compras/relatorios"
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
          fileBase={`compras_${slug}`}
        />
      </div>

      <ComprasReportFiltersForm slug={slug} filterKeys={def.filters} values={values} />

      {report.resumo && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-300">
          {Object.entries(report.resumo).map(([k, v]) => (
            <span
              key={k}
              className="rounded-lg border border-[#ffffff10] bg-[#0A0A0A] px-3 py-1.5"
            >
              <span className="text-gray-500">{COMPRAS_RESUMO_LABEL[k] || k}: </span>
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
                <th key={c.key} className="whitespace-nowrap px-3 py-3">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ffffff06]">
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={def.columns.length} className="px-4 py-10 text-center text-gray-500">
                  Nenhum dado para os filtros informados.
                </td>
              </tr>
            ) : (
              displayRows.map((row, i) => (
                <tr key={i} className="hover:bg-[#ffffff04]">
                  {def.columns.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-3 py-2.5 ${
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
