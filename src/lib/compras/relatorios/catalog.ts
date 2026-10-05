import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  ShieldCheck,
  Truck,
  GitCompare,
  BadgeDollarSign,
  Undo2,
  Banknote,
  Hourglass,
  Hash,
} from 'lucide-react'

export type ComprasReportFilterKey = 'periodo' | 'tipo' | 'sku_codigo' | 'situacao' | 'status'

export type ComprasReportDef = {
  slug: string
  title: string
  description: string
  icon: LucideIcon
  filters: ComprasReportFilterKey[]
  columns: Array<{ key: string; label: string; format?: 'money' | 'number' }>
}

export const COMPRAS_REPORTS: ComprasReportDef[] = [
  {
    slug: 'compras-por-tipo',
    title: 'Compras por tipo',
    description: 'Pedidos do período, separados em material, consumo e serviço',
    icon: BarChart3,
    filters: ['periodo', 'tipo'],
    columns: [
      { key: 'data', label: 'Data' },
      { key: 'numero', label: 'Pedido' },
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'status', label: 'Status' },
      { key: 'valor', label: 'Valor', format: 'money' },
    ],
  },
  {
    slug: 'quem-liberou',
    title: 'Quem liberou',
    description: 'Quem aprovou ou recusou cada nível do pedido',
    icon: ShieldCheck,
    filters: ['periodo'],
    columns: [
      { key: 'pedido', label: 'Pedido' },
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'nivel', label: 'Nível' },
      { key: 'quem', label: 'Quem' },
      { key: 'decisao', label: 'Decisão' },
      { key: 'motivo', label: 'Motivo' },
      { key: 'quando', label: 'Quando' },
    ],
  },
  {
    slug: 'a-chegar',
    title: 'A chegar',
    description: 'Material produtivo aprovado e ainda não recebido',
    icon: Truck,
    filters: [],
    columns: [
      { key: 'numero', label: 'Pedido' },
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'previsao', label: 'Previsão' },
      { key: 'valor', label: 'Valor', format: 'money' },
    ],
  },
  {
    slug: 'divergencias',
    title: 'Divergências',
    description: 'Quantidade recebida diferente da quantidade do pedido',
    icon: GitCompare,
    filters: ['periodo', 'sku_codigo'],
    columns: [
      { key: 'data', label: 'Data' },
      { key: 'pedido', label: 'Pedido' },
      { key: 'item', label: 'Item' },
      { key: 'qtd_pedido', label: 'Qtd pedido', format: 'number' },
      { key: 'divergencia', label: 'Diferença', format: 'number' },
    ],
  },
  {
    slug: 'preco-divergente',
    title: 'Preço divergente',
    description: 'Preço da nota diferente do preço do pedido',
    icon: BadgeDollarSign,
    filters: ['periodo', 'sku_codigo'],
    columns: [
      { key: 'nota', label: 'Nota' },
      { key: 'pedido', label: 'Pedido' },
      { key: 'item', label: 'Item' },
      { key: 'preco_pedido', label: 'Preço pedido', format: 'money' },
      { key: 'preco_nota', label: 'Preço nota', format: 'money' },
      { key: 'diferenca', label: 'Diferença', format: 'money' },
    ],
  },
  {
    slug: 'devolucoes',
    title: 'Devoluções',
    description: 'O que voltou ao fornecedor, com o motivo',
    icon: Undo2,
    filters: ['periodo', 'status'],
    columns: [
      { key: 'data', label: 'Data' },
      { key: 'numero', label: 'Devolução' },
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'item', label: 'Item' },
      { key: 'quantidade', label: 'Qtd', format: 'number' },
      { key: 'motivo', label: 'Motivo' },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    slug: 'custo-ultima-compra',
    title: 'Custo da última compra',
    description: 'Item mais frete rateado da última nota confirmada',
    icon: Banknote,
    filters: ['sku_codigo'],
    columns: [
      { key: 'sku', label: 'SKU' },
      { key: 'nome', label: 'Nome' },
      { key: 'valor', label: 'Custo', format: 'money' },
      { key: 'nota', label: 'Nota' },
      { key: 'atualizado', label: 'Atualizado' },
    ],
  },
  {
    slug: 'pre-titulos-parados',
    title: 'Pré-títulos parados',
    description: 'Notas confirmadas que ainda aguardam o contas a pagar',
    icon: Hourglass,
    filters: [],
    columns: [
      { key: 'numero', label: 'Pré-título' },
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'nota', label: 'Nota' },
      { key: 'valor', label: 'Valor', format: 'money' },
      { key: 'vencimento', label: 'Vencimento' },
      { key: 'dias', label: 'Dias' },
    ],
  },
  {
    slug: 'onde-esta-serie',
    title: 'Onde está a série',
    description: 'Cada peça em estoque, em terceiro ou baixada',
    icon: Hash,
    filters: ['sku_codigo', 'situacao'],
    columns: [
      { key: 'sku', label: 'SKU' },
      { key: 'nome', label: 'Nome' },
      { key: 'numero', label: 'Série' },
      { key: 'situacao', label: 'Situação' },
      { key: 'onde', label: 'Onde' },
    ],
  },
]

export function getComprasReportBySlug(slug: string): ComprasReportDef | undefined {
  return COMPRAS_REPORTS.find((r) => r.slug === slug)
}

export const COMPRAS_RESUMO_LABEL: Record<string, string> = {
  total_count: 'Linhas',
  total_valor: 'Valor',
  aprovados: 'Aprovados',
  recusados: 'Recusados',
  faltas: 'Faltas',
  sobras: 'Sobras',
  total_quantidade: 'Quantidade',
}
