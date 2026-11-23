import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calcularDiscrepanciaValor,
  dentroDaTolerancia,
} from './discrepancia-valor.ts'

describe('calcularDiscrepanciaValor', () => {
  it('mede o percentual sobre o valor do pedido na mesma quantidade', () => {
    const d = calcularDiscrepanciaValor([
      { quantidade: 10, preco_unitario: 11, preco_pedido: 10 },
    ])
    assert.equal(d.semReferencia, false)
    assert.equal(d.valorNota, 110)
    assert.equal(d.valorPedido, 100)
    assert.equal(d.percentual, 10)
    assert.equal(dentroDaTolerancia(d, 10), true)
    assert.equal(dentroDaTolerancia(d, 9.99), false)
  })

  it('ignora linha sem preço de pedido', () => {
    const d = calcularDiscrepanciaValor([
      { quantidade: 2, preco_unitario: 50, preco_pedido: null },
    ])
    assert.equal(d.semReferencia, true)
    assert.equal(dentroDaTolerancia(d, 0), true)
  })

  it('suspende quando o pedido está zerado e a nota tem valor', () => {
    const d = calcularDiscrepanciaValor([
      { quantidade: 1, preco_unitario: 20, preco_pedido: 0 },
    ])
    assert.equal(d.percentual, null)
    assert.equal(d.semReferencia, false)
    assert.equal(dentroDaTolerancia(d, 100), false)
  })
})
