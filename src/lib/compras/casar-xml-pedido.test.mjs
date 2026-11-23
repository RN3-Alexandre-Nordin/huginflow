import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { casarXmlComPedido } from './casar-xml-pedido.ts'

function item(id, skuId, quantidade = '10', preco = '5') {
  return { id, skuId, descricao: id, quantidade, unidade: 'UN', preco }
}

function xml(linha, codigo, quantidade, preco = 9) {
  return {
    linha,
    codigo_parceiro: codigo,
    descricao: codigo,
    quantidade,
    unidade: 'UN',
    preco,
    cfop: '1102',
    n_serie: '',
    impostos: null,
    ncm: '',
    cest: '',
    codigo_barras: '',
  }
}

const formatPreco = (raw) => raw

describe('casarXmlComPedido', () => {
  it('casa pelo de-para e ignora a ordem das linhas', () => {
    const r = casarXmlComPedido(
      [item('a', 'sku-a'), item('b', 'sku-b')],
      [xml(1, 'FORN-B', 2), xml(2, 'forn-a', 3)],
      { 'FORN-B': 'sku-b', 'FORN-A': 'sku-a' },
      formatPreco,
    )
    assert.equal(r.pendencias.length, 0)
    assert.equal(r.itens[0].quantidade, '3')
    assert.equal(r.itens[1].quantidade, '2')
    assert.equal(r.itens[0].preco, '9')
  })

  it('pede cadastro quando o código não tem de-para', () => {
    const r = casarXmlComPedido([item('a', 'sku-a')], [xml(1, 'NOVO', 1)], {}, formatPreco)
    assert.equal(r.pendencias[0]?.motivo, 'sem_depara')
    assert.equal(r.itens[0].quantidade, '10')
  })

  it('recusa SKU que não está no pedido', () => {
    const r = casarXmlComPedido(
      [item('a', 'sku-a')],
      [xml(1, 'X', 1)],
      { X: 'sku-outro' },
      formatPreco,
    )
    assert.equal(r.pendencias[0]?.motivo, 'fora_do_pedido')
  })

  it('soma quantidades quando duas linhas do XML apontam o mesmo SKU', () => {
    const r = casarXmlComPedido(
      [item('a', 'sku-a')],
      [xml(1, 'A1', 4, 9), xml(2, 'A2', 6, 8)],
      { A1: 'sku-a', A2: 'sku-a' },
      formatPreco,
    )
    assert.equal(r.pendencias.length, 0)
    assert.equal(r.itens[0].quantidade, '10')
    assert.equal(r.itens[0].preco, '9')
  })
})
