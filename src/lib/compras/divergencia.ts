/** Quantidade recebida menos a quantidade do pedido. Negativo é falta. */
export function divergenciaQuantidade(recebida: number, pedida: number) {
  return Math.round((recebida - pedida) * 10000) / 10000
}

/** Preço unitário da nota menos o preço unitário do pedido. Positivo é nota mais cara. */
export function divergenciaPreco(precoNota: number, precoPedido: number) {
  return Math.round((precoNota - precoPedido) * 10000) / 10000
}
