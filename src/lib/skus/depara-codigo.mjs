import { normalizarCodigoEtiqueta } from '../compras/codigo-etiqueta.mjs'

export const ERRO_CODIGO_DEPARA_VAZIO = 'Código do parceiro vazio após normalização.'
export const ERRO_CONFLITO_DEPARA = 'Conflito: algum SKU/pessoa ou código do parceiro já existe.'

/**
 * Normaliza com a mesma regra de hugin_normalizar_codigo_etiqueta
 * e recusa conflito de SKU ou de código já normalizado para a mesma pessoa.
 * Não altera vínculos existentes.
 */
export function validarLinhasDepara(linhas, existentes = [], { ignorarId } = {}) {
  const preparadas = []
  const vistosSku = new Set()
  const vistosCodigo = new Set()

  for (const linha of linhas || []) {
    const codigo = normalizarCodigoEtiqueta(linha.codigo_parceiro)
    if (!codigo) return { error: ERRO_CODIGO_DEPARA_VAZIO }
    const chaveSku = `${linha.pessoa_id}:${linha.sku_id}`
    const chaveCodigo = `${linha.pessoa_id}:${codigo}`
    if (vistosSku.has(chaveSku) || vistosCodigo.has(chaveCodigo)) {
      return { error: ERRO_CONFLITO_DEPARA }
    }
    vistosSku.add(chaveSku)
    vistosCodigo.add(chaveCodigo)
    preparadas.push({ ...linha, codigo_parceiro: codigo })
  }

  const base = (existentes || []).filter((item) => item.id !== ignorarId)
  for (const linha of preparadas) {
    for (const atual of base) {
      if (atual.pessoa_id !== linha.pessoa_id) continue
      const mesmoSku = atual.sku_id === linha.sku_id
      const mesmoCodigo = normalizarCodigoEtiqueta(atual.codigo_parceiro) === linha.codigo_parceiro
      if (mesmoSku || mesmoCodigo) return { error: ERRO_CONFLITO_DEPARA }
    }
  }

  return { rows: preparadas }
}
