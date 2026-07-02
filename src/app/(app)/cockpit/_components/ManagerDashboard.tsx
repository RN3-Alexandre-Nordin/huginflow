"use client";

import {
  BarChart3,
  Users,
  Target,
  Building2,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  MessageSquare,
  AlertCircle,
  Settings,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { useCockpitRealtime } from "@/hooks/useCockpitRealtime"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getManagerDashboardMetrics, getManagerDashboardChart, type ManagerChartPeriodo, type ManagerChartMetric } from "../actions"
import { formatBRL } from "@/lib/finance/format"

const CHART_METRICS: { id: ManagerChartMetric; label: string }[] = [
  { id: 'conversao', label: 'Conversão' },
  { id: 'entrada', label: 'Entrada no funil' },
  { id: 'receita', label: 'Receita fechada' },
  { id: 'whatsapp', label: 'WhatsApp' },
]

function formatChartTooltip(
  metrica: ManagerChartMetric,
  ponto: { label: string; valor: number; criados: number; concluidos: number; receita: number; threads: number },
): string {
  switch (metrica) {
    case 'entrada':
      return `${ponto.label}: ${ponto.valor} card${ponto.valor === 1 ? '' : 's'} criado${ponto.valor === 1 ? '' : 's'}`
    case 'receita':
      return `${ponto.label}: ${formatBRL(ponto.valor)}`
    case 'whatsapp':
      return `${ponto.label}: ${ponto.valor} thread${ponto.valor === 1 ? '' : 's'}`
    case 'conversao':
    default:
      return `${ponto.label}: ${ponto.valor}% (${ponto.concluidos}/${ponto.criados})`
  }
}

function formatChartLegendValue(
  unidade: 'percent' | 'count' | 'currency',
  valor: number,
): string {
  if (unidade === 'currency') return formatBRL(valor)
  if (unidade === 'percent') return `${valor}%`
  return String(valor)
}

function MetricValue({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  if (loading) {
    return <Loader2 className="w-7 h-7 animate-spin text-gray-500" />
  }
  return <>{children}</>
}

export default function ManagerDashboard({ userName, userId }: { userName: string; userId: string }) {
  const { lastEvent } = useCockpitRealtime(userId, userName)
  const [highlightStats, setHighlightStats] = useState(false)
  const [chartPeriodo, setChartPeriodo] = useState<ManagerChartPeriodo>('mes')
  const [chartMetrica, setChartMetrica] = useState<ManagerChartMetric>('conversao')

  const { data: metricsResult, isLoading } = useQuery({
    queryKey: ["manager-dashboard-metrics", userId],
    queryFn: () => getManagerDashboardMetrics(),
    refetchInterval: 30000,
  })

  const { data: chartResult, isLoading: isChartLoading } = useQuery({
    queryKey: ["manager-dashboard-chart", userId, chartPeriodo, chartMetrica],
    queryFn: () => getManagerDashboardChart(chartPeriodo, chartMetrica),
    refetchInterval: 30000,
  })

  const metrics = metricsResult?.data
  const chartData = chartResult?.data
  const chartPontos = chartData?.pontos ?? []
  const maxValor = Math.max(...chartPontos.map((p) => p.valor), 1)

  useEffect(() => {
    if (lastEvent) {
      setHighlightStats(true)
      const timer = setTimeout(() => setHighlightStats(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [lastEvent])

  const variacao = metrics?.vendasVariacaoPct
  const variacaoPositiva = variacao === null || variacao >= 0

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black tracking-tight text-white drop-shadow-sm flex items-center gap-3 italic uppercase text-orange-500">
          Cockpit do Gestor
          <span className="text-[10px] font-black py-1 px-3 bg-orange-500/10 text-orange-500 rounded-full border border-orange-500/20 tracking-widest">
            CONTROL CENTER
          </span>
        </h2>
        <p className="text-sm text-gray-400 font-medium">
          Olá, <span className="text-white font-bold">{userName}</span>. Veja abaixo a performance da sua empresa e operações em andamento.
        </p>
      </div>

      <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-4 transition-all ${highlightStats ? 'scale-[1.01]' : ''}`}>
        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-orange-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black text-[#80B828] bg-[#80B828]/10 px-2 py-1 rounded">MÊS ATUAL</span>
          </div>
          <p className="text-3xl font-black text-white min-h-[36px] flex items-center">
            <MetricValue loading={isLoading}>
              {formatBRL(metrics?.vendasMes ?? 0)}
            </MetricValue>
          </p>
          <p className="text-sm font-medium text-gray-500 mt-1">Vendas Concluídas</p>
          {!isLoading && variacao !== null && variacao !== undefined && (
            <div className={`mt-4 flex items-center gap-1.5 text-xs font-bold ${variacaoPositiva ? 'text-[#80B828]' : 'text-red-400'}`}>
              {variacaoPositiva ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {variacao > 0 ? '+' : ''}{variacao.toFixed(1)}% vs mês anterior
            </div>
          )}
          {!isLoading && (variacao === null || variacao === undefined) && (metrics?.vendasMes ?? 0) === 0 && (
            <p className="mt-4 text-xs font-medium text-gray-600">Sem vendas concluídas no período</p>
          )}
        </div>

        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-orange-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Target className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white min-h-[36px] flex items-center">
            <MetricValue loading={isLoading}>
              {metrics?.leadsNoFunil ?? 0}
            </MetricValue>
          </p>
          <p className="text-sm font-medium text-gray-500 mt-1">Cards Ativos no Funil</p>
          <Link href="/cockpit/crm/funis" className="absolute inset-0 z-10" />
        </div>

        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-orange-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white min-h-[36px] flex items-center">
            <MetricValue loading={isLoading}>
              {metrics?.chatsOperacionais ?? 0}
            </MetricValue>
          </p>
          <p className="text-sm font-medium text-gray-500 mt-1">Chats Operacionais (30 dias)</p>
          <Link href="/cockpit/crm/chat" className="absolute inset-0 z-10" />
        </div>

        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-red-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white min-h-[36px] flex items-center">
            <MetricValue loading={isLoading}>
              {metrics?.gargalos ?? 0}
            </MetricValue>
          </p>
          <p className="text-sm font-medium text-gray-500 mt-1">Etapas com Acúmulo (≥3 cards)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 relative overflow-hidden">
          <div className="flex flex-col gap-4 mb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-orange-500" />
                Painel de Indicadores
              </h3>

              <div className="flex p-1 bg-[#0A0A0A] rounded-xl border border-[#ffffff10] shrink-0">
                {([
                  { id: 'dia', label: 'Dia' },
                  { id: 'semana', label: 'Semana' },
                  { id: 'mes', label: 'Mês' },
                ] as const).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setChartPeriodo(option.id)}
                    className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      chartPeriodo === option.id
                        ? 'bg-orange-500 text-white shadow-lg'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <select
              value={chartMetrica}
              onChange={(e) => setChartMetrica(e.target.value as ManagerChartMetric)}
              className="w-full sm:w-auto bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-2.5 text-sm text-gray-200 font-semibold focus:outline-none focus:border-orange-500/50 transition-colors cursor-pointer"
            >
              {CHART_METRICS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-[11px] text-gray-500 mb-1 font-medium">
            {chartData?.titulo}
          </p>
          <p className="text-[11px] text-gray-600 mb-6 font-medium">
            {chartData?.subtitulo ?? 'Selecione um indicador para visualizar.'}
          </p>

          {isChartLoading ? (
            <div className="h-48 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
            </div>
          ) : chartPontos.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-500">
              Sem movimentação no período.
            </div>
          ) : (
            <>
              <div className="h-48 flex items-end justify-between gap-1 px-2 overflow-x-auto">
                {chartPontos.map((ponto, index) => {
                  const height = ponto.valor > 0 ? Math.max((ponto.valor / maxValor) * 100, 8) : 4
                  const metrica = chartData?.metrica ?? 'conversao'
                  const unidade = chartData?.unidade ?? 'percent'
                  return (
                    <div
                      key={`${ponto.label}-${index}`}
                      title={formatChartTooltip(metrica, ponto)}
                      className="flex-1 min-w-[6px] bg-gradient-to-t from-orange-500/10 to-orange-500/40 rounded-t-md transition-all hover:to-orange-500 hover:scale-x-105"
                      style={{ height: `${height}%` }}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between mt-4 px-1 text-[10px] text-gray-600 font-bold uppercase tracking-wider">
                <span>{chartPontos[0]?.label}</span>
                <span>
                  Pico: {formatChartLegendValue(chartData?.unidade ?? 'percent', maxValor)}
                </span>
                <span>{chartPontos[chartPontos.length - 1]?.label}</span>
              </div>
            </>
          )}
        </div>

        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 relative overflow-hidden">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
             <Settings className="w-5 h-5 text-gray-400" />
             Administração do Cockpit
          </h3>
          <div className="grid grid-cols-2 gap-4">
             <Link href="/cockpit/usuarios" className="p-4 rounded-xl bg-[#ffffff03] border border-[#ffffff0a] hover:bg-orange-500/10 hover:border-orange-500/30 transition-all flex flex-col gap-3 group">
                <Users className="w-6 h-6 text-gray-500 group-hover:text-orange-500" />
                <span className="text-sm font-bold text-gray-300">Gestão de Equipe</span>
             </Link>
             <Link href="/cockpit/departamentos" className="p-4 rounded-xl bg-[#ffffff03] border border-[#ffffff0a] hover:bg-[#2BAADF]/10 hover:border-[#2BAADF]/30 transition-all flex flex-col gap-3 group">
                <Target className="w-6 h-6 text-gray-500 group-hover:text-[#2BAADF]" />
                <span className="text-sm font-bold text-gray-300">Estrutura Interna</span>
             </Link>
             <Link href="/cockpit/grupos" className="p-4 rounded-xl bg-[#ffffff03] border border-[#ffffff0a] hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all flex flex-col gap-3 group">
                <Wallet className="w-6 h-6 text-gray-500 group-hover:text-indigo-500" />
                <span className="text-sm font-bold text-gray-300">Níveis de Acesso</span>
             </Link>
             <Link href="/cockpit/empresas" className="p-4 rounded-xl bg-[#ffffff03] border border-[#ffffff0a] hover:bg-[#80B828]/10 hover:border-[#80B828]/30 transition-all flex flex-col gap-3 group">
                <Building2 className="w-6 h-6 text-gray-500 group-hover:text-[#80B828]" />
                <span className="text-sm font-bold text-gray-300">Dados da Conta</span>
             </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
