import type { LucideIcon } from 'lucide-react'
import {
  Inbox,
  Timer,
  Activity,
  Grid3X3,
  Bot,
  Radio,
  Banknote,
  Briefcase,
  Gauge,
  GitBranch,
  Clock,
  TrendingUp,
  AlertTriangle,
  Users,
} from 'lucide-react'

export type BiReportFilterKey =
  | 'periodo'
  | 'departamento'
  | 'canal'
  | 'pipeline'
  | 'responsavel'
  | 'min_cards'

export type BiReportDef = {
  slug: string
  title: string
  description: string
  wave: 1 | 2
  domain: 'omni' | 'workflow'
  icon: LucideIcon
  filters: BiReportFilterKey[]
  columns: Array<{ key: string; label: string; format?: 'money' | 'number' | 'percent' | 'seconds' }>
}

export const BI_REPORTS: BiReportDef[] = [
  // —— Onda 1 Omnichannel ——
  {
    slug: 'omni-fila',
    title: 'Fila omnichannel',
    description: 'Abertas, IA, humano, não atribuídas e não atendidas',
    wave: 1,
    domain: 'omni',
    icon: Inbox,
    filters: ['departamento', 'canal'],
    columns: [
      { key: 'metrica', label: 'Métrica' },
      { key: 'valor', label: 'Valor', format: 'number' },
    ],
  },
  {
    slug: 'omni-sla',
    title: 'SLAs de atendimento',
    description: 'FRT, espera, resolução e tendências vs período anterior',
    wave: 1,
    domain: 'omni',
    icon: Timer,
    filters: ['periodo', 'departamento', 'canal'],
    columns: [
      { key: 'metrica', label: 'KPI' },
      { key: 'valor', label: 'Atual' },
      { key: 'anterior', label: 'Anterior' },
      { key: 'tendencia_pct', label: 'Tendência %', format: 'percent' },
    ],
  },
  {
    slug: 'omni-volume',
    title: 'Volume diário',
    description: 'Conversas, mensagens e resoluções por dia',
    wave: 1,
    domain: 'omni',
    icon: Activity,
    filters: ['periodo', 'departamento', 'canal'],
    columns: [
      { key: 'dia', label: 'Dia' },
      { key: 'conversas', label: 'Conversas', format: 'number' },
      { key: 'mensagens_recebidas', label: 'Msgs recebidas', format: 'number' },
      { key: 'resolucoes', label: 'Resoluções', format: 'number' },
    ],
  },
  {
    slug: 'omni-heatmap',
    title: 'Heatmap de tráfego',
    description: 'Mensagens inbound por dia da semana × hora',
    wave: 1,
    domain: 'omni',
    icon: Grid3X3,
    filters: ['periodo', 'departamento', 'canal'],
    columns: [
      { key: 'dia_semana', label: 'Dia' },
      { key: 'hora', label: 'Hora', format: 'number' },
      { key: 'count', label: 'Msgs', format: 'number' },
    ],
  },
  {
    slug: 'omni-handover',
    title: 'Handover IA → humano',
    description: 'Volume e taxa de transbordo no período',
    wave: 1,
    domain: 'omni',
    icon: Bot,
    filters: ['periodo', 'departamento', 'canal'],
    columns: [
      { key: 'dia', label: 'Dia' },
      { key: 'handovers', label: 'Handovers', format: 'number' },
      { key: 'threads', label: 'Threads', format: 'number' },
      { key: 'taxa_pct', label: 'Taxa %', format: 'percent' },
    ],
  },
  {
    slug: 'omni-por-canal',
    title: 'Atendimento por canal',
    description: 'Volume e FRT médio por canal',
    wave: 1,
    domain: 'omni',
    icon: Radio,
    filters: ['periodo', 'departamento'],
    columns: [
      { key: 'canal', label: 'Canal' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'conversas', label: 'Conversas', format: 'number' },
      { key: 'resolucoes', label: 'Resoluções', format: 'number' },
      { key: 'frt_seg', label: 'FRT médio (s)', format: 'seconds' },
    ],
  },
  // —— Onda 2 Workflow ——
  {
    slug: 'wf-receita',
    title: 'Receita fechada',
    description: 'Cards finalizados no período: receita, ticket e tendência',
    wave: 2,
    domain: 'workflow',
    icon: Banknote,
    filters: ['periodo', 'pipeline', 'departamento'],
    columns: [
      { key: 'pipeline', label: 'Funil' },
      { key: 'fechamentos', label: 'Fechamentos', format: 'number' },
      { key: 'receita', label: 'Receita', format: 'money' },
      { key: 'ticket_medio', label: 'Ticket médio', format: 'money' },
    ],
  },
  {
    slug: 'wf-carteira',
    title: 'Carteira ativa',
    description: 'Cards abertos, atrasados e valor em aberto',
    wave: 2,
    domain: 'workflow',
    icon: Briefcase,
    filters: ['pipeline', 'departamento', 'responsavel'],
    columns: [
      { key: 'pipeline', label: 'Funil' },
      { key: 'etapa', label: 'Etapa' },
      { key: 'ativos', label: 'Ativos', format: 'number' },
      { key: 'atrasados', label: 'Atrasados', format: 'number' },
      { key: 'valor_aberto', label: 'Valor aberto', format: 'money' },
    ],
  },
  {
    slug: 'wf-velocidade',
    title: 'Velocidade do funil',
    description: 'Tempo médio criação → fechamento',
    wave: 2,
    domain: 'workflow',
    icon: Gauge,
    filters: ['periodo', 'pipeline'],
    columns: [
      { key: 'pipeline', label: 'Funil' },
      { key: 'fechamentos', label: 'Fechamentos', format: 'number' },
      { key: 'dias_medios', label: 'Dias médios', format: 'number' },
      { key: 'dias_mediana', label: 'Mediana (dias)', format: 'number' },
    ],
  },
  {
    slug: 'wf-conversao-etapas',
    title: 'Conversão por etapa',
    description: 'Volume de movimentações A→B no período',
    wave: 2,
    domain: 'workflow',
    icon: GitBranch,
    filters: ['periodo', 'pipeline'],
    columns: [
      { key: 'de_etapa', label: 'De' },
      { key: 'para_etapa', label: 'Para' },
      { key: 'movimentacoes', label: 'Movimentações', format: 'number' },
      { key: 'pct_do_funil', label: '% do funil', format: 'percent' },
    ],
  },
  {
    slug: 'wf-dwell',
    title: 'Tempo por etapa',
    description: 'Permanência média (dwell) por estágio',
    wave: 2,
    domain: 'workflow',
    icon: Clock,
    filters: ['periodo', 'pipeline'],
    columns: [
      { key: 'etapa', label: 'Etapa' },
      { key: 'saidas', label: 'Saídas', format: 'number' },
      { key: 'dias_medios', label: 'Dias médios', format: 'number' },
    ],
  },
  {
    slug: 'wf-forecast',
    title: 'Forecast ponderado',
    description: 'Pipeline aberto × probabilidade de fechamento',
    wave: 2,
    domain: 'workflow',
    icon: TrendingUp,
    filters: ['pipeline', 'departamento'],
    columns: [
      { key: 'pipeline', label: 'Funil' },
      { key: 'etapa', label: 'Etapa' },
      { key: 'cards', label: 'Cards', format: 'number' },
      { key: 'valor_bruto', label: 'Valor bruto', format: 'money' },
      { key: 'probabilidade', label: 'Prob. %', format: 'percent' },
      { key: 'valor_ponderado', label: 'Ponderado', format: 'money' },
    ],
  },
  {
    slug: 'wf-gargalos',
    title: 'Gargalos do funil',
    description: 'Etapas com mais cards ativos',
    wave: 2,
    domain: 'workflow',
    icon: AlertTriangle,
    filters: ['pipeline', 'min_cards'],
    columns: [
      { key: 'pipeline', label: 'Funil' },
      { key: 'etapa', label: 'Etapa' },
      { key: 'cards', label: 'Cards', format: 'number' },
      { key: 'valor_aberto', label: 'Valor', format: 'money' },
    ],
  },
  {
    slug: 'wf-produtividade',
    title: 'Produtividade por responsável',
    description: 'Fechamentos e movimentações no período',
    wave: 2,
    domain: 'workflow',
    icon: Users,
    filters: ['periodo', 'pipeline'],
    columns: [
      { key: 'responsavel', label: 'Responsável' },
      { key: 'movimentacoes', label: 'Movimentações', format: 'number' },
      { key: 'fechamentos', label: 'Fechamentos', format: 'number' },
      { key: 'receita', label: 'Receita', format: 'money' },
    ],
  },
]

export function getBiReportBySlug(slug: string): BiReportDef | undefined {
  return BI_REPORTS.find((r) => r.slug === slug)
}

export type BiReportFiltersInput = {
  data_inicio?: string
  data_fim?: string
  departamento_id?: string
  canal_id?: string
  pipeline_id?: string
  responsavel_id?: string
  min_cards?: number
  limit?: number
  offset?: number
}
