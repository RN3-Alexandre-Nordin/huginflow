/**
 * Testes da estratégia de busca do Cardex (node:test).
 * Cobre a regressão: OR(ilike + sku_id.in) com código hifenizado (DEST-011).
 *
 * Rodar: node --test src/lib/estoque/cardex-filters.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isUnsafeCardexOrPlan,
  planCardexTextSearch,
  postgrestIlikePattern,
} from './cardex-filters.mjs'

describe('postgrestIlikePattern', () => {
  it('envolve termo com hífen em aspas (DEST-011)', () => {
    assert.equal(postgrestIlikePattern('DEST-011'), '"%DEST-011%"')
  })

  it('trim e remove aspas internas', () => {
    assert.equal(postgrestIlikePattern('  AB"C  '), '"%ABC%"')
  })

  it('vazio → null', () => {
    assert.equal(postgrestIlikePattern('   '), null)
  })
})

describe('planCardexTextSearch', () => {
  it('sem termo → none + count exact', () => {
    const plan = planCardexTextSearch({ term: '' })
    assert.equal(plan.mode, 'none')
    assert.equal(plan.countMode, 'exact')
  })

  it('termo que resolve SKU → sku_ids (não ilike em movimentos)', () => {
    const plan = planCardexTextSearch({
      term: 'DEST-011',
      skuIdsFromQ: ['8c0cdf8b-a378-42fa-8614-13f6266ad759'],
    })
    assert.equal(plan.mode, 'sku_ids')
    assert.equal(plan.countMode, 'estimated')
    assert.equal(plan.likePat, null)
    assert.deepEqual(plan.skuIds, ['8c0cdf8b-a378-42fa-8614-13f6266ad759'])
  })

  it('termo que resolve pessoa → pessoa_ids', () => {
    const plan = planCardexTextSearch({
      term: 'Ambev',
      pessoaIdsFromQ: ['194eab5a-d24c-4187-9b14-e3967e0ae4d7'],
    })
    assert.equal(plan.mode, 'pessoa_ids')
    assert.equal(plan.likePat, null)
  })

  it('SKU + pessoa → sku_or_pessoa sem ilike', () => {
    const plan = planCardexTextSearch({
      term: 'x',
      skuIdsFromQ: ['sku-1'],
      pessoaIdsFromQ: ['pes-1'],
    })
    assert.equal(plan.mode, 'sku_or_pessoa')
    assert.equal(plan.likePat, null)
  })

  it('sem match de cadastro → documento_motivo com likePat', () => {
    const plan = planCardexTextSearch({ term: 'NF-9001', skuIdsFromQ: [], pessoaIdsFromQ: [] })
    assert.equal(plan.mode, 'documento_motivo')
    assert.equal(plan.likePat, '"%NF-9001%"')
    assert.equal(plan.countMode, 'estimated')
  })

  it('sku_id já na URL → não reaplica skuIdsFromQ', () => {
    const plan = planCardexTextSearch({
      term: 'DEST-011',
      skuIdsFromQ: ['sku-1'],
      skuIdFilter: 'sku-1',
    })
    assert.equal(plan.mode, 'documento_motivo')
  })
})

describe('isUnsafeCardexOrPlan (regressão timeout)', () => {
  it('detecta plano legado perigoso OR(ilike + sku_id.in)', () => {
    assert.equal(
      isUnsafeCardexOrPlan([
        'documento.ilike."%DEST-011%"',
        'motivo.ilike."%DEST-011%"',
        'sku_id.in.(8c0cdf8b-a378-42fa-8614-13f6266ad759)',
      ]),
      true,
    )
  })

  it('plano só por IDs é seguro', () => {
    assert.equal(isUnsafeCardexOrPlan(['sku_id.in.(abc)']), false)
  })

  it('plano só ilike documento é aceitável (sem misturar ids)', () => {
    assert.equal(isUnsafeCardexOrPlan(['documento.ilike."%x%"', 'motivo.ilike."%x%"']), false)
  })
})
