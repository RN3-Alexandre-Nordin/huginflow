import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  codigoCasaItem,
  codigoConfirmadoPeloOperador,
  deveOferecerVinculo,
  extrairCodigoEtiqueta,
  extrairCodigosEtiqueta,
  normalizarCodigoEtiqueta,
  resolverCodigoEtiqueta,
  resolverCodigosEtiqueta,
} from './codigo-etiqueta.mjs'

const SKU_A = { id: 'sku-a', codigo: '001234', codigo_barras: '789100000001', nome: 'Filtro' }
const SKU_B = { id: 'sku-b', codigo: '998877', nome: 'Correia' }
const ITENS = [
  { id: 'item-a', sku_id: 'sku-a', descricao: 'Filtro de ar', saldo: 4 },
  { id: 'item-b', sku_id: 'sku-b', descricao: 'Correia', saldo: 2 },
]

describe('codigo da etiqueta de importado', () => {
  it('remove a máscara do número impresso', () => {
    assert.equal(normalizarCodigoEtiqueta('1625 - 0055 - 40'), '1625005540')
    assert.equal(normalizarCodigoEtiqueta('1625-0055-40'), '1625005540')
  })

  it('extrai o número no meio do texto do OCR', () => {
    const texto = 'MPV KIT Genuine Spare Parts 1625 - 0055 - 40 Packed by MR2555'
    assert.equal(extrairCodigoEtiqueta(texto), '1625005540')
  })

  it('só casa texto idêntico, sem trecho da descrição', () => {
    assert.equal(codigoCasaItem('1625005540', '1625-0055-40', null), true)
    assert.equal(codigoCasaItem('1625005540', '1625-0055-40 — Kit', '1625-0055-40'), true)
    assert.equal(codigoCasaItem('1625', '1625-0055-40 — Kit', '1625-0055-40'), false)
    assert.equal(codigoCasaItem('1625005540', '9999-0000-01', null), false)
  })

  it('não junta códigos diferentes por ponto ou outro caractere', () => {
    assert.equal(normalizarCodigoEtiqueta('ab\u00a0cd'), 'ABCD')
    assert.equal(normalizarCodigoEtiqueta('ab-cd'), 'ABCD')
    assert.equal(normalizarCodigoEtiqueta('ab.cd'), 'AB.CD')
    assert.notEqual(normalizarCodigoEtiqueta('ab.cd'), normalizarCodigoEtiqueta('ABCD'))
  })

  it('catálogo incompleto não vira identificação única', () => {
    const achado = resolverCodigosEtiqueta({
      codigos: ['001234'],
      skus: [SKU_A],
      deparas: [],
      itens: ITENS,
      catalogoCompleto: false,
    })
    assert.equal(achado.status, 'inconclusivo')
  })

  it('preserva zeros à esquerda e não trata o código como número', () => {
    assert.equal(normalizarCodigoEtiqueta('001234'), '001234')
    assert.notEqual(normalizarCodigoEtiqueta('001234'), normalizarCodigoEtiqueta('1234'))
    const achado = resolverCodigoEtiqueta({
      codigo: '001234',
      skus: [SKU_A],
      deparas: [],
      itens: ITENS,
    })
    assert.equal(achado.status, 'unico')
    assert.equal(achado.origem, 'sku')
    assert.equal(achado.pedido_item_id, 'item-a')
    assert.equal(
      resolverCodigoEtiqueta({ codigo: '1234', skus: [SKU_A], deparas: [], itens: ITENS }).status,
      'nenhum',
    )
  })

  it('aceita código de fornecedor diferente do SKU quando a associação é única', () => {
    const achado = resolverCodigoEtiqueta({
      codigo: 'FORN-77',
      skus: [SKU_A, SKU_B],
      deparas: [{ sku_id: 'sku-a', codigo_parceiro: 'FORN-77' }],
      itens: ITENS,
    })
    assert.equal(achado.status, 'unico')
    assert.equal(achado.origem, 'alternativo')
    assert.equal(achado.sku_id, 'sku-a')
  })

  it('não escolhe sozinho quando o código aponta para dois produtos', () => {
    const achado = resolverCodigoEtiqueta({
      codigo: 'REP-1',
      skus: [SKU_A, SKU_B],
      deparas: [
        { sku_id: 'sku-a', codigo_parceiro: 'REP-1' },
        { sku_id: 'sku-b', codigo_parceiro: 'REP-1' },
      ],
      itens: ITENS,
    })
    assert.equal(achado.status, 'ambiguo')
    assert.equal(achado.candidatos.length, 2)
  })

  it('devolve nenhum quando o código não existe', () => {
    const achado = resolverCodigoEtiqueta({
      codigo: '0000',
      skus: [SKU_A],
      deparas: [],
      itens: ITENS,
    })
    assert.equal(achado.status, 'nenhum')
  })

  it('marca SKU de fora do pedido sem escolher outra linha', () => {
    const achado = resolverCodigoEtiqueta({
      codigo: '001234',
      skus: [SKU_A],
      deparas: [],
      itens: [{ id: 'item-b', sku_id: 'sku-b', descricao: 'Correia', saldo: 2 }],
    })
    assert.equal(achado.status, 'fora_do_pedido')
    assert.equal(achado.candidatos[0].pedido_item_id, null)
  })

  it('OCR com vários números só confirma quando todos apontam o mesmo item', () => {
    const texto = 'lote 001234 nota 998877'
    const codigos = extrairCodigosEtiqueta(texto)
    assert.deepEqual(codigos, ['001234', '998877'])
    const varios = resolverCodigosEtiqueta({
      codigos,
      skus: [SKU_A, SKU_B],
      deparas: [],
      itens: ITENS,
      porOcr: true,
    })
    assert.equal(varios.status, 'ambiguo')
    const um = resolverCodigosEtiqueta({
      codigos: ['001234', '5555'],
      skus: [SKU_A, SKU_B],
      deparas: [],
      itens: ITENS,
      porOcr: true,
    })
    assert.equal(um.status, 'unico')
    assert.equal(um.origem, 'ocr')
    assert.equal(um.pedido_item_id, 'item-a')
  })

  it('OCR sem número não inventa identificação', () => {
    assert.deepEqual(extrairCodigosEtiqueta('Genuine Spare Parts'), [])
    const achado = resolverCodigosEtiqueta({
      codigos: extrairCodigosEtiqueta('Genuine Spare Parts'),
      skus: [SKU_A],
      deparas: [],
      itens: ITENS,
      porOcr: true,
    })
    assert.equal(achado.status, 'nenhum')
  })

  it('OCR pede vínculo só do código escolhido e a recusa não cadastra', () => {
    const texto = 'lote 001234 nota 998877'
    const codigos = extrairCodigosEtiqueta(texto)
    const escolhido = codigoConfirmadoPeloOperador(codigos, '998877')
    assert.equal(escolhido, '998877')
    assert.equal(codigoConfirmadoPeloOperador(codigos, '001234'), '001234')
    assert.equal(codigoConfirmadoPeloOperador(codigos, '0000'), '')
    assert.equal(deveOferecerVinculo('manual', false), true)
    assert.equal(deveOferecerVinculo('sku', true), false)
    assert.equal(deveOferecerVinculo('alternativo', true), false)
    assert.equal(deveOferecerVinculo('ocr', true), false)
    const recusou = false
    assert.equal(recusou && deveOferecerVinculo('manual', false), false)
  })
})
