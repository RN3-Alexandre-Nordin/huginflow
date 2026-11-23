import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clienteAtcLegadoAdapter } from './adapters/cliente-atc-legado.ts'
import { huginPadraoAdapter } from './adapters/hugin-padrao.ts'
import { gruposParaCriacao, validarEAgruparCanonical } from './importar.ts'
import { motivoRejeicaoIntegralPlanilha } from './rejeicao-integral.ts'
import { criarRequisicao } from '../processar-requisicao.ts'

const HEAD_ATC = ['Requisitante', 'Material', 'Quantidade', 'Data da Requisição']
const PESSOAS = new Map([
  ['534', { documento: '12345678900', nome: 'Ana' }],
  ['535', { documento: '98765432100', nome: 'Bia' }],
])

function atlas(matrix) {
  return clienteAtcLegadoAdapter.toCanonical(matrix, {
    empresaId: 'emp-1',
    pessoasPorMatricula: PESSOAS,
  })
}

function fakeAgrupar() {
  return {
    from(table) {
      const data =
        table === 'crm_leads'
          ? [
              {
                id: 'p1',
                nome: 'Ana',
                documento: '12345678900',
                ativo: true,
                papeis: ['funcionario'],
                codigo_externo: '534',
              },
            ]
          : table === 'cad_skus'
            ? [
                {
                  id: 's1',
                  codigo: 'ATC-0001',
                  nome: 'Luva',
                  controla_estoque: true,
                  ativo: true,
                },
              ]
            : []
      const b = {
        select() {
          return b
        },
        eq() {
          return b
        },
        in() {
          return b
        },
        limit() {
          return b
        },
        then(resolve, reject) {
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }
}

function fakeCriar({ requisicoes = [] } = {}) {
  const inserts = []
  const rpcs = []
  return {
    inserts,
    rpcs,
    rpc(fn, args) {
      rpcs.push({ fn, args })
      return Promise.resolve({
        data: {
          sucesso: true,
          requisicao_id: 'req-nova',
          numero: 'REQ-20261116-0001',
          status: args.p_status,
        },
        error: null,
      })
    },
    from(table) {
      const b = {
        filters: {},
        head: false,
        inserted: false,
        select(_cols, opts) {
          b.head = Boolean(opts?.head)
          return b
        },
        eq(col, val) {
          b.filters[col] = val
          return b
        },
        in() {
          return b
        },
        ilike() {
          return b
        },
        order() {
          return b
        },
        limit() {
          return b
        },
        insert(payload) {
          b.inserted = true
          inserts.push({ table, payload })
          return b
        },
        maybeSingle: async () => {
          if (table === 'crm_leads') {
            return {
              data: {
                id: 'p1',
                nome: 'Ana',
                ativo: true,
                papeis: ['funcionario'],
              },
              error: null,
            }
          }
          if (table === 'est_config') return { data: null, error: null }
          if (table === 'est_requisicoes') {
            const hit = requisicoes.find(
              (r) =>
                r.sistema_origem === b.filters.sistema_origem &&
                r.codigo_origem === b.filters.codigo_origem
            )
            return { data: hit || null, error: null }
          }
          return { data: null, error: null }
        },
        single: async () => ({ data: { id: 'req-nova' }, error: null }),
        then(resolve, reject) {
          if (b.inserted) {
            return Promise.resolve({ error: null }).then(resolve, reject)
          }
          if (table === 'cad_skus') {
            return Promise.resolve({
              data: [
                {
                  id: 's1',
                  codigo: 'MAT-1',
                  nome: 'Luva',
                  controla_estoque: true,
                  ativo: true,
                  preco_custo: 2,
                },
              ],
              error: null,
            }).then(resolve, reject)
          }
          if (table === 'est_requisicoes' && b.head) {
            return Promise.resolve({ count, error: null }).then(resolve, reject)
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }
}

const baseInput = {
  empresa_id: 'emp-1',
  requisitante_pessoa_id: 'p1',
  origem: 'planilha',
  itens: [{ sku_id: 's1', quantidade_pedida: 1 }],
}

describe('Pacote 2.1 — rejeição integral Atlas', () => {
  it('Atlas com todas as linhas identificáveis permite efetivação', () => {
    const { rows, erros } = atlas([
      HEAD_ATC,
      ['534 :: Ana', 'ATC-1 :: Luva', '1', '16/11/2026'],
      ['534 :: Ana', 'ATC-2 :: Capacete', '2', '16/11/2026'],
    ])
    assert.equal(erros.length, 0)
    assert.equal(rows.length, 2)
    assert.equal(motivoRejeicaoIntegralPlanilha('cliente_atc_legado', erros), null)
  })

  it('Atlas com uma linha sem matrícula bloqueia a planilha inteira', () => {
    const { erros } = atlas([
      HEAD_ATC,
      [':: Ana', 'ATC-1 :: Luva', '1', '16/11/2026'],
    ])
    const motivo = motivoRejeicaoIntegralPlanilha('cliente_atc_legado', erros)
    assert.match(motivo, /matrícula/)
    assert.match(motivo, /Linha 2/)
  })

  it('Atlas com uma linha sem data bloqueia a planilha inteira', () => {
    const { erros } = atlas([
      HEAD_ATC,
      ['534 :: Ana', 'ATC-1 :: Luva', '1', ''],
    ])
    const motivo = motivoRejeicaoIntegralPlanilha('cliente_atc_legado', erros)
    assert.match(motivo, /data da requisição/i)
    assert.match(motivo, /Linha 2/)
  })

  it('Atlas com várias linhas inválidas devolve todas as inconsistências', () => {
    const { erros } = atlas([
      HEAD_ATC,
      [':: Ana', 'ATC-1 :: Luva', '1', ''],
      ['535 :: Bia', 'ATC-1 :: Luva', '1', 'data-ruim'],
      ['534 :: Ana', 'ATC-1 :: Luva', '1', '16/11/2026'],
    ])
    assert.equal(erros.length, 3)
    assert.match(erros[0], /Linha 2:.*matrícula/)
    assert.match(erros[1], /Linha 2:.*data/)
    assert.match(erros[2], /Linha 3:.*data/)
    const motivo = motivoRejeicaoIntegralPlanilha('cliente_atc_legado', erros)
    for (const e of erros) assert.ok(motivo.includes(e))
  })

  it('Atlas com linhas inválidas e grupos válidos não grava requisição', async () => {
    const { rows, erros } = atlas([
      HEAD_ATC,
      ['534 :: Ana', 'ATC-1 :: Luva', '2', '16/11/2026'],
      [':: Sem Matricula', 'ATC-1 :: Luva', '1', '16/11/2026'],
    ])
    assert.ok(rows.length > 0)
    assert.ok(erros.length > 0)
    const { grupos } = await validarEAgruparCanonical(rows, 'emp-1', fakeAgrupar())
    assert.ok(gruposParaCriacao(grupos).length > 0)
    const motivo = motivoRejeicaoIntegralPlanilha('cliente_atc_legado', erros)
    const aGravar = motivo ? [] : gruposParaCriacao(grupos)
    assert.ok(motivo)
    assert.equal(aGravar.length, 0)
  })

  it('Hugin padrão não aplica a rejeição integral', () => {
    const { rows, erros } = huginPadraoAdapter.toCanonical(
      [
        [
          'requisitante_documento',
          'sku_codigo',
          'quantidade',
          'codigo_origem',
          'sistema_origem',
        ],
        ['12345678900', 'MAT-1', '1', 'ORIG-1', 'planilha'],
      ],
      { empresaId: 'emp-1' }
    )
    assert.equal(erros.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(
      motivoRejeicaoIntegralPlanilha('hugin_padrao', [
        'Linha 9: requisição bloqueada — matrícula do requisitante ausente.',
      ]),
      null
    )
  })
})

describe('Pacote 2.1 — número interno e código de origem', () => {
  it('importação gera numero pelo Hugin e não usa codigo_origem', async () => {
    const client = fakeCriar({ count: 3 })
    const res = await criarRequisicao(
      {
        ...baseInput,
        codigo_origem: 'ATC-534-20261116',
        sistema_origem: 'atc_suprimentos',
      },
      client
    )
    assert.equal(res.sucesso, true)
    assert.match(res.numero, /^REQ-\d{8}-\d{4}$/)
    assert.notEqual(res.numero, 'ATC-534-20261116')
    const rpc = client.rpcs.find((r) => r.fn === 'est_criar_requisicao')
    assert.equal(rpc.args.p_codigo_origem, 'ATC-534-20261116')
    assert.equal(rpc.fn, 'est_criar_requisicao')
    assert.equal(
      client.inserts.some((i) => i.table === 'est_requisicoes'),
      false
    )
  })

  it('preserva codigo_origem e sistema_origem', async () => {
    const client = fakeCriar()
    const res = await criarRequisicao(
      {
        ...baseInput,
        codigo_origem: 'ATC-534-20261116',
        sistema_origem: 'atc_suprimentos',
        requisitante_nome_origem: 'Ana',
      },
      client
    )
    assert.equal(res.sucesso, true)
    const rpc = client.rpcs.find((r) => r.fn === 'est_criar_requisicao')
    assert.equal(rpc.args.p_codigo_origem, 'ATC-534-20261116')
    assert.equal(rpc.args.p_sistema_origem, 'atc_suprimentos')
    assert.equal(rpc.args.p_requisitante_nome_origem, 'Ana')
  })

  it('reimportação continua impedida pela origem', async () => {
    const client = fakeCriar({
      requisicoes: [
        {
          id: 'ja',
          numero: 'REQ-20261116-0001',
          sistema_origem: 'atc_suprimentos',
          codigo_origem: 'ATC-534-20261116',
        },
      ],
    })
    const res = await criarRequisicao(
      {
        ...baseInput,
        codigo_origem: 'ATC-534-20261116',
        sistema_origem: 'atc_suprimentos',
      },
      client
    )
    assert.equal(res.sucesso, false)
    assert.equal(res.codigo, 'REQUISICAO_ORIGEM_DUPLICADA')
    assert.equal(res.numero, 'REQ-20261116-0001')
    assert.equal(client.inserts.length, 0)
  })

  it('cadastro manual continua com número gerado e sem origem', async () => {
    const client = fakeCriar({ count: 0 })
    const res = await criarRequisicao(
      { ...baseInput, origem: 'manual' },
      client
    )
    assert.equal(res.sucesso, true)
    assert.match(res.numero, /^REQ-\d{8}-\d{4}$/)
    const rpc = client.rpcs.find((r) => r.fn === 'est_criar_requisicao')
    assert.equal(rpc.args.p_origem, 'manual')
    assert.equal(rpc.args.p_codigo_origem, null)
    assert.equal(rpc.args.p_sistema_origem, null)
  })
})
