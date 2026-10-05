/**
 * Contrato rastro NF-e (nLote / dVal / dFab) → numero_lote + datas ISO.
 * Espelha extractRastro / nfeDate de parser-nfe-xml.ts (sem transpile TS).
 * Rodar: node --test src/lib/estoque/parser-nfe-xml.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { XMLParser } from 'fast-xml-parser'

function str(v) {
  if (v == null) return ''
  return String(v).trim()
}

function nfeDate(v) {
  const raw = str(v)
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function extractRastro(prod) {
  const raw = prod?.rastro
  if (!raw) {
    return { numero_lote: null, data_validade: null, data_fabricacao: null }
  }
  const list = Array.isArray(raw) ? raw : [raw]
  const first = list[0] || {}
  return {
    numero_lote: str(first.nLote) || null,
    data_validade: nfeDate(first.dVal),
    data_fabricacao: nfeDate(first.dFab),
  }
}

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe>
      <det nItem="1">
        <prod>
          <cProd>SKU-Rastro</cProd>
          <rastro>
            <nLote>LOTE-XYZ</nLote>
            <dFab>20260101</dFab>
            <dVal>20261231</dVal>
          </rastro>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`

describe('nfeDate', () => {
  it('normaliza AAAAMMDD e AAAA-MM-DD', () => {
    assert.equal(nfeDate('20261231'), '2026-12-31')
    assert.equal(nfeDate('2026-01-15'), '2026-01-15')
    assert.equal(nfeDate(''), null)
  })
})

describe('extractRastro / parse NF-e', () => {
  it('extrai numero_lote, data_validade e data_fabricacao do rastro', () => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseTagValue: false,
    })
    const parsed = parser.parse(SAMPLE)
    const det = parsed?.nfeProc?.NFe?.infNFe?.det
    const prod = Array.isArray(det) ? det[0]?.prod : det?.prod
    const rastro = extractRastro(prod)
    assert.equal(rastro.numero_lote, 'LOTE-XYZ')
    assert.equal(rastro.data_validade, '2026-12-31')
    assert.equal(rastro.data_fabricacao, '2026-01-01')
  })

  it('sem rastro → nulls', () => {
    assert.deepEqual(extractRastro({ cProd: 'X' }), {
      numero_lote: null,
      data_validade: null,
      data_fabricacao: null,
    })
  })
})
