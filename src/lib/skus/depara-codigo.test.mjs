import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ERRO_CODIGO_DEPARA_VAZIO, ERRO_CONFLITO_DEPARA, validarLinhasDepara } from './depara-codigo.mjs'

const PESSOA = 'pessoa-1'
const OUTRA = 'pessoa-2'
const SKU_A = 'sku-a'
const SKU_B = 'sku-b'

describe('cadastro manual de de-para', () => {
  it('normaliza hífen, espaço, tab, quebra e NBSP e preserva zero e ponto', () => {
    const lote = validarLinhasDepara([
      { sku_id: SKU_A, pessoa_id: PESSOA, codigo_parceiro: '  0012 -\t34.50\u00A0' },
      { sku_id: SKU_B, pessoa_id: OUTRA, codigo_parceiro: 'ab\ncd' },
    ])
    assert.equal(lote.rows[0].codigo_parceiro, '001234.50')
    assert.equal(lote.rows[1].codigo_parceiro, 'ABCD')
  })

  it('rejeita código vazio depois da normalização', () => {
    const vazio = validarLinhasDepara([{ sku_id: SKU_A, pessoa_id: PESSOA, codigo_parceiro: ' - \n\t' }])
    assert.equal(vazio.error, ERRO_CODIGO_DEPARA_VAZIO)
  })

  it('bloqueia conflito de código ou SKU no lote e na edição, sem substituir o vínculo', () => {
    const lote = validarLinhasDepara([
      { sku_id: SKU_A, pessoa_id: PESSOA, codigo_parceiro: 'abc-1' },
      { sku_id: SKU_B, pessoa_id: PESSOA, codigo_parceiro: 'ABC 1' },
    ])
    assert.equal(lote.error, ERRO_CONFLITO_DEPARA)

    const mesmoSku = validarLinhasDepara([
      { sku_id: SKU_A, pessoa_id: PESSOA, codigo_parceiro: '111' },
      { sku_id: SKU_A, pessoa_id: PESSOA, codigo_parceiro: '222' },
    ])
    assert.equal(mesmoSku.error, ERRO_CONFLITO_DEPARA)

    const existentes = [{ id: 'id-1', sku_id: SKU_A, pessoa_id: PESSOA, codigo_parceiro: '0012-34' }]
    const edicao = validarLinhasDepara(
      [{ sku_id: SKU_A, pessoa_id: PESSOA, codigo_parceiro: '001234' }],
      existentes,
      { ignorarId: 'id-1' },
    )
    assert.equal(edicao.rows[0].codigo_parceiro, '001234')

    const conflitoCodigo = validarLinhasDepara(
      [{ sku_id: SKU_B, pessoa_id: PESSOA, codigo_parceiro: '001234' }],
      existentes,
    )
    assert.equal(conflitoCodigo.error, ERRO_CONFLITO_DEPARA)

    const conflitoSku = validarLinhasDepara(
      [{ sku_id: SKU_A, pessoa_id: PESSOA, codigo_parceiro: '999' }],
      existentes,
    )
    assert.equal(conflitoSku.error, ERRO_CONFLITO_DEPARA)
    assert.equal(existentes[0].codigo_parceiro, '0012-34')
  })
})
