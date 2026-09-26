/**
 * Testes unitários do alocador FEFO (ordenação + split de quantidade).
 * Rodar: node --test src/lib/estoque/alocar-lotes-fefo.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/** Espelha a ordenação FEFO usada em alocar-lotes-fefo.ts (sem I/O). */
function ordenarFefo(lista) {
  return [...lista].sort((a, b) => {
    const va = a.data_validade
    const vb = b.data_validade
    if (va == null && vb == null) return a.numero_lote.localeCompare(b.numero_lote)
    if (va == null) return 1
    if (vb == null) return -1
    if (va !== vb) return va < vb ? -1 : 1
    return a.numero_lote.localeCompare(b.numero_lote)
  })
}

function alocar(lista, quantidade, { bloquearVencidos = false, hoje = '2026-09-18' } = {}) {
  const filtrada = lista.filter((x) => {
    if (!bloquearVencidos) return true
    if (!x.data_validade) return true
    return x.data_validade >= hoje
  })
  const ordenada = ordenarFefo(filtrada)
  let restante = quantidade
  const alocacoes = []
  for (const pos of ordenada) {
    if (restante <= 0) break
    const take = Math.min(pos.saldo, restante)
    if (take <= 0) continue
    alocacoes.push({
      lote_produto_id: pos.lote_produto_id,
      numero_lote: pos.numero_lote,
      data_validade: pos.data_validade,
      quantidade: take,
    })
    restante -= take
  }
  return {
    alocacoes,
    quantidade_alocada: quantidade - restante,
    quantidade_faltante: Math.max(0, restante),
  }
}

describe('FEFO ordenação', () => {
  it('validade ASC, NULLS LAST, depois numero_lote', () => {
    const ordenada = ordenarFefo([
      { lote_produto_id: '3', numero_lote: 'C', data_validade: null, saldo: 1 },
      { lote_produto_id: '1', numero_lote: 'B', data_validade: '2026-12-01', saldo: 1 },
      { lote_produto_id: '2', numero_lote: 'A', data_validade: '2026-10-01', saldo: 1 },
      { lote_produto_id: '4', numero_lote: 'D', data_validade: '2026-10-01', saldo: 1 },
    ])
    assert.deepEqual(
      ordenada.map((x) => x.numero_lote),
      ['A', 'D', 'B', 'C'],
    )
  })
})

describe('FEFO alocação', () => {
  const base = [
    { lote_produto_id: 'l1', numero_lote: 'L1', data_validade: '2026-10-01', saldo: 5 },
    { lote_produto_id: 'l2', numero_lote: 'L2', data_validade: '2026-11-01', saldo: 10 },
    { lote_produto_id: 'l0', numero_lote: 'L0', data_validade: '2025-01-01', saldo: 8 },
  ]

  it('parte o pedido entre lotes FEFO', () => {
    const r = alocar(base, 7)
    assert.equal(r.quantidade_alocada, 7)
    assert.equal(r.quantidade_faltante, 0)
    assert.equal(r.alocacoes[0].numero_lote, 'L0')
    assert.equal(r.alocacoes[0].quantidade, 7)
  })

  it('bloqueia vencidos quando pedido', () => {
    const r = alocar(base, 7, { bloquearVencidos: true, hoje: '2026-09-18' })
    assert.equal(r.alocacoes[0].numero_lote, 'L1')
    assert.equal(r.alocacoes[0].quantidade, 5)
    assert.equal(r.alocacoes[1].numero_lote, 'L2')
    assert.equal(r.alocacoes[1].quantidade, 2)
  })

  it('reporta faltante se saldo insuficiente', () => {
    const r = alocar(base.slice(0, 1), 20)
    assert.equal(r.quantidade_alocada, 5)
    assert.equal(r.quantidade_faltante, 15)
  })
})
