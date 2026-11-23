import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'
import { clienteAtcLegadoAdapter } from './cliente-atc-legado.ts'
import { planilhaBufferToCsv } from '../xlsx-io.ts'
import { parseCsvToMatrix } from '../parse-csv.ts'

const ctx = { empresaId: 'emp-1', pessoasPorMatricula: new Map() }

function canonical(matrix) {
  return clienteAtcLegadoAdapter.toCanonical(matrix, ctx)
}

const HEAD = ['Requisitante', 'Material', 'Quantidade', 'Data da Requisição', 'Data']

describe('cliente ATC — agrupamento por matrícula e data', () => {
  it('mesmo funcionário e data, horários diferentes: uma requisição', () => {
    const { rows, erros } = canonical([
      HEAD,
      ['534 :: Ana', 'ATC-1 :: Luva', '1', '16/11/2026 08:15:00', '01/01/2020'],
      ['534 :: Ana', 'ATC-2 :: Capacete', '2', '16/11/2026 18:45:59', '02/02/2020'],
    ])
    assert.equal(erros.length, 0)
    assert.deepEqual(
      rows.map((r) => r.codigo_origem),
      ['ATC-534-20261116', 'ATC-534-20261116']
    )
    assert.deepEqual(
      rows.map((r) => r.sku_codigo),
      ['ATC-0001', 'ATC-0002']
    )
  })

  it('mesmo funcionário, datas diferentes: duas requisições', () => {
    const { rows } = canonical([
      HEAD,
      ['534 :: Ana', 'ATC-1 :: Luva', '1', '16/11/2026 10:00', ''],
      ['534 :: Ana', 'ATC-1 :: Luva', '1', '17/11/2026 10:00', ''],
    ])
    assert.deepEqual(
      rows.map((r) => r.codigo_origem),
      ['ATC-534-20261116', 'ATC-534-20261117']
    )
  })

  it('funcionários diferentes, mesma data: duas requisições', () => {
    const { rows } = canonical([
      HEAD,
      ['534 :: Ana', 'ATC-1 :: Luva', '1', '16/11/2026', ''],
      ['880 :: Bruno', 'ATC-1 :: Luva', '1', '16/11/2026', ''],
    ])
    assert.deepEqual(
      rows.map((r) => r.codigo_origem),
      ['ATC-534-20261116', 'ATC-880-20261116']
    )
    assert.equal(rows[0].requisitante_codigo_externo, '534')
    assert.equal(rows[1].requisitante_codigo_externo, '880')
  })

  it('formatos equivalentes geram o mesmo identificador', () => {
    const datas = ['16/11/2026', '16/11/2026 14:30:00', '2026-11-16', '2026-11-16T17:30:00.000Z', '46342']
    const { rows, erros } = canonical([
      ['Requisitante', 'Material', 'Quantidade', 'Data da Requisição'],
      ...datas.map((d) => ['534 :: Ana', 'ATC-10 :: Item', '1', d]),
    ])
    assert.equal(erros.length, 0)
    assert.ok(rows.every((r) => r.codigo_origem === 'ATC-534-20261116'))
    assert.equal(rows.length, datas.length)
  })

  it('data ausente ou inválida bloqueia a linha', () => {
    const { rows, erros } = canonical([
      ['Requisitante', 'Material', 'Quantidade', 'Data da Requisição'],
      ['534 :: Ana', 'ATC-1 :: Luva', '1', ''],
      ['534 :: Ana', 'ATC-1 :: Luva', '1', '32/13/2026'],
      ['534 :: Ana', 'ATC-1 :: Luva', '1', 'nao-e-data'],
    ])
    assert.equal(rows.length, 0)
    assert.equal(erros.length, 3)
    assert.ok(erros.every((e) => e.includes('data da requisição ausente ou inválida')))
    assert.ok(erros.every((e) => !e.includes('semdata')))
  })

  it('matrícula ausente bloqueia a linha', () => {
    const { rows, erros } = canonical([
      ['Requisitante', 'Material', 'Quantidade', 'Data da Requisição'],
      [' :: Sem codigo', 'ATC-1 :: Luva', '1', '16/11/2026'],
    ])
    assert.equal(rows.length, 0)
    assert.match(erros[0], /matrícula do requisitante ausente/)
    assert.ok(!erros.some((e) => e.includes('ATC-X')))
  })

  it('reimportação repete o mesmo identificador e sistema', () => {
    const matrix = [
      ['Requisitante', 'Material', 'Quantidade', 'Data da Requisição'],
      ['534 :: Ana', 'ATC-1 :: Luva', '1', '16/11/2026 08:00'],
      ['534 :: Ana', 'ATC-2 :: Bota', '3', '16/11/2026 09:00'],
    ]
    const a = canonical(matrix)
    const b = canonical(matrix)
    assert.deepEqual(
      a.rows.map((r) => `${r.sistema_origem}|${r.codigo_origem}`),
      b.rows.map((r) => `${r.sistema_origem}|${r.codigo_origem}`)
    )
    assert.equal(a.rows[0].sistema_origem, 'atc_suprimentos')
    assert.equal(a.rows[0].codigo_origem, 'ATC-534-20261116')
  })

  it('texto de data que o Excel entrega no CSV entra no mesmo grupo', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Requisitante', 'Material', 'Quantidade', 'Data da Requisição', 'Data'],
      ['534 :: Ana', 'ATC-1 :: Luva', 1, new Date(2026, 10, 16, 8, 0, 0), new Date(2020, 0, 1)],
      ['534 :: Ana', 'ATC-2 :: Bota', 2, new Date(2026, 10, 16, 18, 0, 0), new Date(2020, 0, 2)],
    ])
    ws.D2.z = 'dd/mm/yyyy hh:mm:ss'
    ws.D3.z = 'dd/mm/yyyy hh:mm:ss'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const csv = planilhaBufferToCsv(buf, 'atc.xlsx')
    const { rows, erros } = canonical(parseCsvToMatrix(csv))
    assert.equal(erros.length, 0)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].codigo_origem, 'ATC-534-20261116')
    assert.equal(rows[1].codigo_origem, rows[0].codigo_origem)
    assert.equal(rows[0].sistema_origem, 'atc_suprimentos')
  })
})
