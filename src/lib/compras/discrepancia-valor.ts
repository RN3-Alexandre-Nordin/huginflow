export type LinhaValorNota = {
  quantidade: number
  preco_unitario: number
  preco_pedido: number | null
}

export type DiscrepanciaValor = {
  valorNota: number
  valorPedido: number
  percentual: number | null
  semReferencia: boolean
}

function dinheiro(n: number) {
  return Math.round(n * 100) / 100
}

/** Diferença percentual entre o valor da nota e o valor do pedido, na mesma quantidade. */
export function calcularDiscrepanciaValor(linhas: LinhaValorNota[]): DiscrepanciaValor {
  let valorNota = 0
  let valorPedido = 0
  let comReferencia = false

  for (const linha of linhas) {
    const qtd = Number(linha.quantidade)
    const preco = Number(linha.preco_unitario)
    const pedido = linha.preco_pedido == null ? null : Number(linha.preco_pedido)
    if (!(qtd > 0) || !Number.isFinite(preco) || pedido == null || !Number.isFinite(pedido)) continue
    comReferencia = true
    valorNota += qtd * preco
    valorPedido += qtd * pedido
  }

  if (!comReferencia) {
    return { valorNota: 0, valorPedido: 0, percentual: null, semReferencia: true }
  }

  const nota = dinheiro(valorNota)
  const base = dinheiro(valorPedido)
  if (base <= 0) {
    return {
      valorNota: nota,
      valorPedido: base,
      percentual: nota === 0 ? 0 : null,
      semReferencia: false,
    }
  }

  const percentual = Math.round((Math.abs(nota - base) / base) * 100 * 10000) / 10000
  return { valorNota: nota, valorPedido: base, percentual, semReferencia: false }
}

export function dentroDaTolerancia(discrepancia: DiscrepanciaValor, limitePercentual: number) {
  if (discrepancia.semReferencia) return true
  if (discrepancia.percentual == null) return false
  return discrepancia.percentual <= limitePercentual
}

export function mensagemSuspensao(discrepancia: DiscrepanciaValor, limitePercentual: number) {
  const limite = limitePercentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  if (discrepancia.percentual == null) {
    return `A nota tem valor e o pedido dessas linhas está zerado. O limite é ${limite}%. O recebimento ficou suspenso para aprovação humana.`
  }
  const pct = discrepancia.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  const sentido = discrepancia.valorNota > discrepancia.valorPedido ? 'acima' : 'abaixo'
  return `A nota está ${pct}% ${sentido} do valor do pedido. O limite é ${limite}%. O recebimento ficou suspenso para aprovação humana.`
}
