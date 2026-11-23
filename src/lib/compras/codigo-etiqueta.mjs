/** Texto, sem conversão numérica. Zeros à esquerda permanecem. */
export function normalizarCodigoEtiqueta(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[\t\n\r \u00A0-]+/g, '')
}

/** Todos os números impressos que o OCR pode ter lido. Nenhum deles é identidade sozinho. */
export function extrairCodigosEtiqueta(texto) {
  const fonte = String(texto || '')
  const achados = []
  for (const item of fonte.match(/\d{2,}(?:\s*-\s*\d{2,})+/g) || []) {
    achados.push(normalizarCodigoEtiqueta(item))
  }
  for (const item of fonte.match(/\d{4,}/g) || []) {
    achados.push(item)
  }
  const vistos = new Set()
  const unicos = []
  for (const codigo of achados) {
    if (codigo.length < 4 || vistos.has(codigo)) continue
    vistos.add(codigo)
    unicos.push(codigo)
  }
  return unicos
}

export function extrairCodigoEtiqueta(texto) {
  return extrairCodigosEtiqueta(texto)[0] || ''
}

/** O vínculo usa só o código que o operador escolheu. Os demais candidatos do OCR ficam de fora. */
export function codigoConfirmadoPeloOperador(codigos, escolhido) {
  const alvo = normalizarCodigoEtiqueta(escolhido)
  if (!alvo) return ''
  const lista = Array.isArray(codigos) ? codigos : []
  if (!lista.length) return String(escolhido ?? '').trim()
  const achado = lista.find((codigo) => normalizarCodigoEtiqueta(codigo) === alvo)
  return achado ? String(achado).trim() : ''
}

/** Código novo, ainda sem cadastro. Código já resolvido não pede confirmação. */
export function deveOferecerVinculo(origem, codigoConhecido) {
  return origem === 'manual' && !codigoConhecido
}

export function codigoCasaItem(codigo, descricao, skuCodigo) {
  const alvo = normalizarCodigoEtiqueta(codigo)
  if (alvo.length < 4) return false
  return [descricao, skuCodigo].filter(Boolean).some((valor) => normalizarCodigoEtiqueta(valor) === alvo)
}

function coincidencias(codigo, skus, deparas) {
  const alvo = normalizarCodigoEtiqueta(codigo)
  const porSku = new Map()
  if (!alvo) return { alvo, porSku }
  for (const sku of skus || []) {
    const oficial =
      normalizarCodigoEtiqueta(sku.codigo) === alvo ||
      (sku.codigo_barras && normalizarCodigoEtiqueta(sku.codigo_barras) === alvo)
    if (oficial) porSku.set(sku.id, 'sku')
  }
  for (const dep of deparas || []) {
    if (normalizarCodigoEtiqueta(dep.codigo_parceiro) !== alvo) continue
    if (!porSku.has(dep.sku_id)) porSku.set(dep.sku_id, 'alternativo')
  }
  return { alvo, porSku }
}

/**
 * O SKU da empresa é a identidade. De-para do fornecedor só confirma se houver um único SKU.
 * Descrição não entra na confirmação automática.
 */
export function resolverCodigoEtiqueta({ codigo, skus, deparas, itens }) {
  const { alvo, porSku } = coincidencias(codigo, skus, deparas)
  if (!alvo) return { status: 'vazio', codigo: '', candidatos: [] }

  const linhas = (itens || []).filter((item) => item.saldo == null || Number(item.saldo) > 0)
  const candidatos = []
  for (const [skuId, origem] of porSku) {
    const sku = (skus || []).find((item) => item.id === skuId)
    const doPedido = linhas.filter((item) => item.sku_id === skuId)
    if (!doPedido.length) {
      candidatos.push({
        sku_id: skuId,
        pedido_item_id: null,
        descricao: sku?.nome || sku?.codigo || '',
        origem,
        codigo: alvo,
        fora_do_pedido: true,
      })
      continue
    }
    for (const item of doPedido) {
      candidatos.push({
        sku_id: skuId,
        pedido_item_id: item.id,
        descricao: item.descricao || sku?.nome || '',
        origem,
        codigo: alvo,
        saldo: item.saldo,
        fora_do_pedido: false,
      })
    }
  }

  const noPedido = candidatos.filter((item) => !item.fora_do_pedido)
  if (noPedido.length === 1 && porSku.size === 1) {
    return { status: 'unico', ...noPedido[0] }
  }
  if (!candidatos.length) return { status: 'nenhum', codigo: alvo, candidatos: [] }
  if (!noPedido.length) return { status: 'fora_do_pedido', codigo: alvo, candidatos }
  return { status: 'ambiguo', codigo: alvo, candidatos: noPedido }
}

/** Vários números de OCR. Só há identificação se todos os que casam apontam o mesmo item. */
export function resolverCodigosEtiqueta({ codigos, skus, deparas, itens, porOcr = false, catalogoCompleto = true }) {
  if (catalogoCompleto === false) {
    return { status: 'inconclusivo', codigo: '', candidatos: [] }
  }
  const resolvidos = []
  for (const codigo of codigos || []) {
    const resultado = resolverCodigoEtiqueta({ codigo, skus, deparas, itens })
    if (resultado.status === 'vazio' || resultado.status === 'nenhum') continue
    resolvidos.push(resultado)
  }
  if (!resolvidos.length) return { status: 'nenhum', codigo: '', candidatos: [] }

  const unicos = resolvidos.filter((item) => item.status === 'unico')
  const mesmoItem =
    unicos.length === resolvidos.length &&
    new Set(unicos.map((item) => item.pedido_item_id)).size === 1
  if (mesmoItem) {
    return { ...unicos[0], origem: porOcr ? 'ocr' : unicos[0].origem }
  }

  const candidatos = []
  const vistos = new Set()
  for (const resultado of resolvidos) {
    const lista = resultado.candidatos?.length ? resultado.candidatos : [resultado]
    for (const item of lista) {
      const chave = `${item.pedido_item_id || ''}:${item.sku_id || ''}:${item.codigo || ''}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      candidatos.push(porOcr && item.origem !== 'manual' ? { ...item, origem: item.fora_do_pedido ? item.origem : 'ocr' } : item)
    }
  }
  const noPedido = candidatos.filter((item) => !item.fora_do_pedido)
  if (!noPedido.length) return { status: 'fora_do_pedido', codigo: '', candidatos }
  return { status: 'ambiguo', codigo: '', candidatos: noPedido }
}
