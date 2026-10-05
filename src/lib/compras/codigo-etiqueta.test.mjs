import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  codigoCasaItem,
  extrairCodigoEtiqueta,
  normalizarCodigoEtiqueta,
} from './codigo-etiqueta.mjs'

describe('codigo da etiqueta de importado', () => {
  it('remove a máscara do número impresso', () => {
    assert.equal(normalizarCodigoEtiqueta('1625 - 0055 - 40'), '1625005540')
    assert.equal(normalizarCodigoEtiqueta('1625-0055-40'), '1625005540')
  })

  it('extrai o número no meio do texto do OCR', () => {
    const texto = 'MPV KIT Genuine Spare Parts 1625 - 0055 - 40 Packed by MR2555'
    assert.equal(extrairCodigoEtiqueta(texto), '1625005540')
  })

  it('casa com a linha do pedido importado', () => {
    assert.equal(codigoCasaItem('1625005540', '1625-0055-40', null), true)
    assert.equal(codigoCasaItem('1625005540', '1625-0055-40 — Kit', '1625-0055-40'), true)
    assert.equal(codigoCasaItem('1625005540', '9999-0000-01', null), false)
  })
})
