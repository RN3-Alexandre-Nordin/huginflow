'use client'

import { useState, useTransition } from 'react'
import { BarChart3, Loader2, MessageSquare, Timer, TrendingUp } from 'lucide-react'
import {
  getAnalyticsReport,
  type AnalyticsFilters,
  type AnalyticsReport,
} from './actions'

type Department = { id: string; nome: string }

function nestedNumber(value: unknown, ...path: string[]): number {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== 'object') return 0
    current = (current as Record<string, unknown>)[key]
  }
  return Number(current ?? 0)
}

function MetricCard(props: {
  testId: string
  label: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <div data-testid={props.testId} className="rounded-2xl border border-white/10 bg-[#111] p-5">
      <div className="mb-3 flex items-center gap-2 text-orange-400">{props.icon}</div>
      <p className="text-2xl font-black text-white">{props.value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-gray-500">{props.label}</p>
    </div>
  )
}

export default function ReportsClient(props: {
  initial: AnalyticsReport
  initialFilters: AnalyticsFilters
  departments: Department[]
}) {
  const [report, setReport] = useState(props.initial)
  const [filters, setFilters] = useState(props.initialFilters)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const kpis = report.kpis as Record<string, unknown>
  const overview = report.overview as Record<string, unknown>
  const heatCells = report.heatmap.cells ?? []

  function refresh(next: AnalyticsFilters) {
    setFilters(next)
    setError('')
    startTransition(async () => {
      const result = await getAnalyticsReport(next)
      if (result.error || !result.data) {
        setError(result.error ?? 'Falha ao carregar analytics.')
        return
      }
      setReport(result.data)
    })
  }

  return (
    <div data-testid="reports-page" className="space-y-6 pb-20">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-[#111] p-4">
        <label className="space-y-1 text-xs text-gray-400">
          <span>Início</span>
          <input
            data-testid="reports-date-start"
            type="datetime-local"
            value={filters.start}
            onChange={(event) => refresh({ ...filters, start: event.target.value })}
            className="block rounded-lg border border-white/10 bg-black px-3 py-2 text-white"
          />
        </label>
        <label className="space-y-1 text-xs text-gray-400">
          <span>Fim</span>
          <input
            data-testid="reports-date-end"
            type="datetime-local"
            value={filters.end}
            onChange={(event) => refresh({ ...filters, end: event.target.value })}
            className="block rounded-lg border border-white/10 bg-black px-3 py-2 text-white"
          />
        </label>
        <label className="min-w-64 flex-1 space-y-1 text-xs text-gray-400">
          <span>Departamento</span>
          <select
            data-testid="reports-department-filter"
            value={filters.departmentId ?? ''}
            onChange={(event) =>
              refresh({ ...filters, departmentId: event.target.value || undefined })
            }
            className="block w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-white"
          >
            <option value="">Todos os departamentos</option>
            {props.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.nome}
              </option>
            ))}
          </select>
        </label>
        {pending && <Loader2 data-testid="reports-loading" className="h-5 w-5 animate-spin text-orange-400" />}
      </div>

      {error && (
        <p data-testid="reports-error" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          testId="reports-kpi-open"
          label="Conversas abertas"
          value={nestedNumber(overview, 'conversas', 'abertas')}
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <MetricCard
          testId="reports-kpi-unassigned"
          label="Não atribuídas"
          value={nestedNumber(overview, 'conversas', 'nao_atribuidas')}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <MetricCard
          testId="reports-kpi-first-response"
          label="1ª resposta média (s)"
          value={nestedNumber(kpis, 'kpis', 'tempo_primeira_resposta_seg', 'valor').toFixed(0)}
          icon={<Timer className="h-5 w-5" />}
        />
        <MetricCard
          testId="reports-kpi-resolution"
          label="Resolução média (s)"
          value={nestedNumber(kpis, 'kpis', 'tempo_resolucao_seg', 'valor').toFixed(0)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <div data-testid="reports-daily-chart" className="rounded-2xl border border-white/10 bg-[#111] p-5">
        <h3 className="mb-4 font-bold text-white">Conversas por dia</h3>
        <div className="space-y-2">
          {report.daily.length === 0 ? (
            <p className="text-sm text-gray-500">Sem dados no período.</p>
          ) : (
            report.daily.map((row, index) => (
              <div key={`${String(row.dia)}-${index}`} className="flex justify-between border-b border-white/5 py-2 text-sm">
                <span className="text-gray-400">{String(row.dia)}</span>
                <span className="font-mono text-white">
                  {Number(row.conversas ?? 0)} conversas · {Number(row.mensagens_recebidas ?? 0)} mensagens
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div data-testid="reports-heatmap" className="rounded-2xl border border-white/10 bg-[#111] p-5">
        <h3 className="mb-4 font-bold text-white">Mapa de tráfego</h3>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {heatCells.length === 0 ? (
            <p className="col-span-full text-sm text-gray-500">Sem mensagens no período.</p>
          ) : (
            heatCells.map((cell, index) => (
              <div
                key={`${String(cell.dow)}-${String(cell.hour)}-${index}`}
                title={`Dia ${String(cell.dow)}, ${String(cell.hour)}h: ${String(cell.count)}`}
                className="aspect-square rounded bg-orange-500/30"
                style={{
                  opacity: Math.max(
                    Number(cell.count ?? 0) / Math.max(Number(report.heatmap.max_count ?? 1), 1),
                    0.2,
                  ),
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
