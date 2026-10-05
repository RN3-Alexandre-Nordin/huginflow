/** Tira espaços e hífens. `1625 - 0055 - 40` vira `1625005540`. */
export function normalizarCodigoEtiqueta(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s-]+/g, '')
}

/** Acha o número impresso acima do código de barras no texto do OCR. */
export function extrairCodigoEtiqueta(texto) {
  const fonte = String(texto || '')
  const mascarados = fonte.match(/\d{2,}(?:\s*-\s*\d{2,})+/g) || []
  const mascarado = mascarados.sort(
    (a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length,
  )[0]
  if (mascarado) return normalizarCodigoEtiqueta(mascarado)
  const longo = (fonte.match(/\d{6,}/g) || []).sort((a, b) => b.length - a.length)[0]
  return longo ? normalizarCodigoEtiqueta(longo) : ''
}

export function codigoCasaItem(codigo, descricao, skuCodigo) {
  const alvo = normalizarCodigoEtiqueta(codigo)
  if (alvo.length < 4) return false
  return [descricao, skuCodigo].filter(Boolean).some((valor) => {
    const chave = normalizarCodigoEtiqueta(valor)
    if (chave === alvo) return true
    return chave.startsWith(alvo) && /[^0-9]/.test(chave.charAt(alvo.length))
  })
}
