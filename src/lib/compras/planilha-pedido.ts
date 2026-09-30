export { parsePedidoCsv } from './planilha-pedido.mjs'

export type LinhaPedidoPlanilha = {
  linha: number
  numero: string
  fornecedor: string
  previsao: string | null
  tipo: 'produtivo' | 'consumo' | 'servico'
  item: string
  quantidade: number
  unidade: string
  preco: number
}
