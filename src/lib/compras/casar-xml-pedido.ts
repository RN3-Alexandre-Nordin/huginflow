export type ItemPedidoXml = {
  id: string
  skuId: string | null
  descricao: string
  quantidade: string
  unidade: string
  preco: string
  precoPedido?: string
  cfop?: string
  centroCusto?: string
  nSerie?: string
  impostos?: Record<string, number> | null
}

export type LinhaXmlNota = {
  linha: number
  codigo_parceiro: string
  descricao: string
  quantidade: number
  unidade: string
  preco: number
  cfop: string
  n_serie: string
  impostos: Record<string, number> | null
  ncm: string
  cest: string
  codigo_barras: string
}

export type PendenciaXml =
  | { linha: LinhaXmlNota; motivo: 'sem_depara' }
  | { linha: LinhaXmlNota; motivo: 'fora_do_pedido'; skuId: string }

function chave(codigo: string) {
  return codigo.trim().toUpperCase()
}

/** Casa cada linha do XML com um item do pedido pelo SKU do de-para. Não usa a ordem das linhas. */
export function casarXmlComPedido(
  itens: ItemPedidoXml[],
  xmlItens: LinhaXmlNota[],
  depara: Record<string, string>,
  formatPreco: (raw: string) => string,
): { itens: ItemPedidoXml[]; pendencias: PendenciaXml[] } {
  const usados = new Set<string>()
  const atualizados = new Map<string, ItemPedidoXml>()
  const pendencias: PendenciaXml[] = []

  for (const xml of xmlItens) {
    const skuId = depara[chave(xml.codigo_parceiro)]
    if (!skuId) {
      pendencias.push({ linha: xml, motivo: 'sem_depara' })
      continue
    }
    const livre = itens.find((item) => item.skuId === skuId && !usados.has(item.id))
    if (!livre) {
      const ja = [...atualizados.values()].find((item) => item.skuId === skuId)
      if (!ja) {
        pendencias.push({ linha: xml, motivo: 'fora_do_pedido', skuId })
        continue
      }
      const qtd = Number(ja.quantidade)
      const soma = (Number.isFinite(qtd) ? qtd : 0) + xml.quantidade
      atualizados.set(ja.id, {
        ...ja,
        quantidade: String(soma),
        nSerie: [ja.nSerie, xml.n_serie].filter(Boolean).join(', '),
      })
      continue
    }
    usados.add(livre.id)
    atualizados.set(livre.id, {
      ...livre,
      quantidade: String(xml.quantidade),
      unidade: xml.unidade || livre.unidade,
      preco: formatPreco(String(xml.preco)),
      cfop: xml.cfop,
      nSerie: xml.n_serie,
      impostos: xml.impostos,
    })
  }

  return {
    itens: itens.map((item) => atualizados.get(item.id) || item),
    pendencias,
  }
}
