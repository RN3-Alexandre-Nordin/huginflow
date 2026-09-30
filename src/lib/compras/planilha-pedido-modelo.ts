import * as XLSX from 'xlsx'

/** Cabeçalho canônico da importação de pedidos (Fase 1). */
export function buildModeloPedidoXlsx(): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['numero', 'fornecedor', 'previsao', 'tipo', 'item', 'quantidade', 'unidade', 'preco'],
    ['PC-EXEMPLO-0001', 'Nome do fornecedor cadastrado', '2026-10-15', 'produtivo', 'CODIGO-DO-ITEM', 1, 'UN', 10],
  ])
  ws['!cols'] = [
    { wch: 18 },
    { wch: 36 },
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
