import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  AlertTriangle,
  Percent,
  Activity,
  RefreshCw,
  Clock,
  TrendingUp,
  Truck,
  GitCompare,
  Timer,
  SlidersHorizontal,
} from 'lucide-react'

export type ReportFilterKey =
  | 'periodo'
  | 'local'
  | 'sku_codigo'
  | 'familia'
  | 'so_com_saldo'
  | 'criterio_critico'
  | 'status_req'
  | 'origem_req'
  | 'origem_saida'
  | 'dias_sem_movimento'
  | 'terceiro'
  | 'status_remessa'
  | 'sinal_ajuste'

export type ReportDef = {
  slug: string
  title: string
  description: string
  wave: 1 | 2
  icon: LucideIcon
  filters: ReportFilterKey[]
  columns: Array<{ key: string; label: string; format?: 'money' | 'number' }>
}

export const ESTOQUE_REPORTS: ReportDef[] = [
  {
    slug: 'valor-estoque',
    title: 'Valor do estoque',
    description: 'Posição valorizada (saldo × custo) por SKU e local',
    wave: 1,
    icon: Banknote,
    filters: ['local', 'sku_codigo', 'familia', 'so_com_saldo'],
    columns: [
      { key: 'sku_codigo', label: 'SKU' },
      { key: 'sku_nome', label: 'Nome' },
      { key: 'familia', label: 'Família' },
      { key: 'local', label: 'Local' },
      { key: 'quantidade', label: 'Qtd' },
      { key: 'preco_custo', label: 'Custo unit.', format: 'money' },
      { key: 'valor', label: 'Valor', format: 'money' },
    ],
  },
  {
    slug: 'skus-criticos',
    title: 'SKUs críticos',
    description: 'Abaixo do mínimo, ponto de reposição ou zerados',
    wave: 1,
    icon: AlertTriangle,
    filters: ['local', 'sku_codigo', 'familia', 'criterio_critico'],
    columns: [
      { key: 'sku_codigo', label: 'SKU' },
      { key: 'sku_nome', label: 'Nome' },
      { key: 'familia', label: 'Família' },
      { key: 'local', label: 'Local' },
      { key: 'quantidade', label: 'Saldo' },
      { key: 'estoque_minimo', label: 'Mínimo' },
      { key: 'ponto_reposicao', label: 'Ponto rep.' },
      { key: 'motivo', label: 'Motivo' },
    ],
  },
  {
    slug: 'fill-rate-requisicoes',
    title: 'Fill rate de requisições',
    description: 'Atendido vs pedido e pendências no período',
    wave: 1,
    icon: Percent,
    filters: ['periodo', 'sku_codigo', 'familia', 'status_req', 'origem_req'],
    columns: [
      { key: 'numero', label: 'Nº' },
      { key: 'sku_codigo', label: 'SKU' },
      { key: 'familia', label: 'Família' },
      { key: 'pedida', label: 'Pedida' },
      { key: 'atendida', label: 'Atendida' },
      { key: 'pendente', label: 'Pendente' },
      { key: 'fill_rate', label: 'Fill %' },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    slug: 'consumo-doh',
    title: 'Consumo e DOH',
    description: 'Saídas no período e dias de cobertura',
    wave: 1,
    icon: Activity,
    filters: ['periodo', 'local', 'sku_codigo', 'familia', 'origem_saida'],
    columns: [
      { key: 'sku_codigo', label: 'SKU' },
      { key: 'sku_nome', label: 'Nome' },
      { key: 'familia', label: 'Família' },
      { key: 'saldo', label: 'Saldo' },
      { key: 'consumo', label: 'Consumo' },
      { key: 'consumo_dia', label: 'Média/dia' },
      { key: 'doh', label: 'DOH (dias)' },
      { key: 'valor_consumo', label: 'Consumo', format: 'money' },
    ],
  },
  {
    slug: 'giro-estoque',
    title: 'Giro de estoque',
    description: 'Turns = consumo a custo ÷ estoque médio valorizado',
    wave: 1,
    icon: RefreshCw,
    filters: ['periodo', 'local', 'familia'],
    columns: [
      { key: 'sku_codigo', label: 'SKU' },
      { key: 'sku_nome', label: 'Nome' },
      { key: 'familia', label: 'Família' },
      { key: 'consumo_custo', label: 'Consumo', format: 'money' },
      { key: 'estoque_valor', label: 'Estoque', format: 'money' },
      { key: 'turns', label: 'Giro' },
    ],
  },
  {
    slug: 'estoque-sem-movimento',
    title: 'Estoque sem movimento',
    description: 'Saldo positivo sem saída há N dias',
    wave: 2,
    icon: Clock,
    filters: ['dias_sem_movimento', 'local', 'sku_codigo', 'familia'],
    columns: [
      { key: 'sku_codigo', label: 'SKU' },
      { key: 'sku_nome', label: 'Nome' },
      { key: 'familia', label: 'Família' },
      { key: 'local', label: 'Local' },
      { key: 'quantidade', label: 'Saldo' },
      { key: 'valor', label: 'Valor', format: 'money' },
      { key: 'ultima_saida', label: 'Última saída' },
      { key: 'dias', label: 'Dias parados' },
    ],
  },
  {
    slug: 'excesso-maximo',
    title: 'Excesso vs máximo',
    description: 'Saldo acima do estoque máximo cadastrado',
    wave: 2,
    icon: TrendingUp,
    filters: ['local', 'sku_codigo', 'familia'],
    columns: [
      { key: 'sku_codigo', label: 'SKU' },
      { key: 'sku_nome', label: 'Nome' },
      { key: 'familia', label: 'Família' },
      { key: 'local', label: 'Local' },
      { key: 'quantidade', label: 'Saldo' },
      { key: 'estoque_maximo', label: 'Máximo' },
      { key: 'excesso', label: 'Excesso' },
      { key: 'valor_excesso', label: 'Excesso', format: 'money' },
    ],
  },
  {
    slug: 'poder-terceiros',
    title: 'Poder de terceiros',
    description: 'Estoque próprio em poder de terceiros valorizado',
    wave: 2,
    icon: Truck,
    filters: ['terceiro', 'sku_codigo', 'familia'],
    columns: [
      { key: 'terceiro', label: 'Terceiro' },
      { key: 'sku_codigo', label: 'SKU' },
      { key: 'sku_nome', label: 'Nome' },
      { key: 'familia', label: 'Família' },
      { key: 'quantidade', label: 'Qtd' },
      { key: 'valor', label: 'Valor', format: 'money' },
    ],
  },
  {
    slug: 'remessa-retorno-baixa',
    title: 'Retorno / baixa de remessa',
    description: 'Taxas de retorno e baixa definitiva por remessa',
    wave: 2,
    icon: GitCompare,
    filters: ['periodo', 'terceiro', 'status_remessa'],
    columns: [
      { key: 'numero', label: 'Remessa' },
      { key: 'terceiro', label: 'Terceiro' },
      { key: 'status', label: 'Status' },
      { key: 'enviada', label: 'Enviada' },
      { key: 'retornada', label: 'Retornada' },
      { key: 'baixada', label: 'Baixada' },
      { key: 'taxa_retorno', label: 'Retorno %' },
      { key: 'taxa_baixa', label: 'Baixa %' },
    ],
  },
  {
    slug: 'lead-time-req',
    title: 'Lead time de requisição',
    description: 'Tempo da criação à aprovação / 1ª baixa',
    wave: 2,
    icon: Timer,
    filters: ['periodo', 'status_req', 'origem_req'],
    columns: [
      { key: 'numero', label: 'Nº' },
      { key: 'status', label: 'Status' },
      { key: 'origem', label: 'Origem' },
      { key: 'created_at', label: 'Criada em' },
      { key: 'aprovado_em', label: 'Aprovada em' },
      { key: 'horas_aprovacao', label: 'Horas até aprov.' },
      { key: 'horas_primeira_baixa', label: 'Horas até baixa' },
    ],
  },
  {
    slug: 'ajustes-shrinkage',
    title: 'Ajustes (shrinkage)',
    description: 'Volume e valor de ajustes no período',
    wave: 2,
    icon: SlidersHorizontal,
    filters: ['periodo', 'local', 'sku_codigo', 'familia', 'sinal_ajuste'],
    columns: [
      { key: 'movimento_em', label: 'Data' },
      { key: 'sku_codigo', label: 'SKU' },
      { key: 'familia', label: 'Família' },
      { key: 'local', label: 'Local' },
      { key: 'sinal', label: 'Sinal' },
      { key: 'quantidade', label: 'Qtd' },
      { key: 'valor', label: 'Valor', format: 'money' },
      { key: 'motivo', label: 'Motivo' },
    ],
  },
]

export function getReportBySlug(slug: string): ReportDef | undefined {
  return ESTOQUE_REPORTS.find((r) => r.slug === slug)
}

export type ReportFiltersInput = {
  data_inicio?: string
  data_fim?: string
  local_id?: string
  sku_codigo?: string
  familia_id?: string
  so_com_saldo?: boolean
  criterio_critico?: string
  status_req?: string
  origem_req?: string
  origem_saida?: string
  dias_sem_movimento?: number
  terceiro_id?: string
  status_remessa?: string
  sinal_ajuste?: string
  /** page size (default 50, max 200) — agregado no Postgres via est_rpc_relatorio */
  limit?: number
  offset?: number
}
