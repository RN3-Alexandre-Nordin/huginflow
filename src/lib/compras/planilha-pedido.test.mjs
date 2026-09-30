import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parsePedidoCsv } from './planilha-pedido.mjs'

describe('parsePedidoCsv', () => {
  it('lê duas linhas do mesmo pedido', () => {
    const csv = `numero,fornecedor,previsao,tipo,item,quantidade,unidade,preco
PO-1,ACME,2026-10-01,produtivo,NB-01,2,UN,3500
PO-1,ACME,2026-10-01,produtivo,MOU-1,2,UN,80`
    const { linhas, erros } = parsePedidoCsv(csv)
    assert.equal(erros.length, 0)
    assert.equal(linhas.length, 2)
    assert.equal(linhas[0].preco, 3500)
    assert.equal(linhas[1].item, 'MOU-1')
  })

  it('rejeita tipo desconhecido', () => {
    const csv = `numero,fornecedor,tipo,item,quantidade
PO-2,ACME,aluguel,X,1`
    const { linhas, erros } = parsePedidoCsv(csv)
    assert.equal(linhas.length, 0)
    assert.equal(erros.length, 1)
  })
})
