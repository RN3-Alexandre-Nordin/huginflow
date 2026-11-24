import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  gruposParaCriacao,
  validarEAgruparCanonical,
} from './importar.ts'
import { motivoBloqueioGrupo } from './types.ts'

const EMPRESA = 'emp-1'

function fakeClient({ pessoas = [], skus = [], requisicoes = [] }) {
  const porTabela = {
    crm_leads: pessoas,
    cad_skus: skus,
    est_requisicoes: requisicoes,
  }
  return {
    from(table) {
      const data = porTabela[table] || []
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
        not() {
          return b
        },
        limit() {
          return b
        },
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        then(resolve, reject) {
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }
}

const pessoa = {
  id: 'p1',
  nome: 'Ana',
  documento: '12345678900',
  ativo: true,
  papeis: ['funcionario'],
  codigo_externo: null,
}

const sku = {
  id: 's1',
  codigo: 'MAT-1',
  nome: 'Parafuso',
  controla_estoque: true,
  ativo: true,
}

const sku2 = {
  id: 's2',
  codigo: 'MAT-2',
  nome: 'Porca',
  controla_estoque: true,
  ativo: true,
}

function linha(over = {}) {
  return {
    linha: 2,
    requisitante_documento: '123.456.789-00',
    sku_codigo: 'MAT-1',
    quantidade: 3,
    codigo_origem: 'REQ-A',
    sistema_origem: 'planilha',
    ...over,
  }
}

async function validar(rows, extras = {}) {
  const client = fakeClient({
    pessoas: [pessoa],
    skus: [sku, sku2],
    ...extras,
  })
  return validarEAgruparCanonical(rows, EMPRESA, client)
}

describe('bloqueio de grupo na importação de requisição', () => {
  it('cria o grupo quando cabeçalho e todos os itens são válidos', async () => {
    const { grupos } = await validar([
      linha(),
      linha({ linha: 3, sku_codigo: 'MAT-2', quantidade: 1 }),
    ])
    const criacao = gruposParaCriacao(grupos)
    assert.equal(criacao.length, 1)
    assert.equal(criacao[0].itens.length, 2)
    assert.equal(motivoBloqueioGrupo(grupos[0]), null)
  })

  it('grava o grupo quando o SKU não existe, para cadastrar depois', async () => {
    const { grupos } = await validar([linha({ sku_codigo: 'NAO-EXISTE' })])
    const criacao = gruposParaCriacao(grupos)
    assert.equal(motivoBloqueioGrupo(grupos[0]), null)
    assert.equal(criacao.length, 1)
    assert.equal(criacao[0].itens[0].sku_codigo_informado, 'NAO-EXISTE')
    assert.equal(criacao[0].itens[0].sku_id, undefined)
  })

  it('bloqueia o grupo quando o material está vazio', async () => {
    const { grupos } = await validar([linha({ sku_codigo: '   ' })])
    assert.equal(gruposParaCriacao(grupos).length, 0)
    assert.match(motivoBloqueioGrupo(grupos[0]), /linha 2 · \(material vazio\)/)
  })

  it('bloqueia o grupo quando a quantidade é inválida', async () => {
    const { grupos } = await validar([linha({ quantidade: 0 })])
    assert.equal(gruposParaCriacao(grupos).length, 0)
    assert.match(motivoBloqueioGrupo(grupos[0]), /linha 2 · MAT-1/)
    assert.match(grupos[0].itens[0].erro, /maior que zero/)
  })

  it('bloqueia o grupo quando o requisitante não existe', async () => {
    const { grupos } = await validar([
      linha({ requisitante_documento: '00000000000' }),
    ])
    assert.equal(gruposParaCriacao(grupos).length, 0)
    assert.match(motivoBloqueioGrupo(grupos[0]), /não cadastrado/)
  })

  it('não descarta o item válido quando o mesmo grupo tem item inválido', async () => {
    const { grupos } = await validar([
      linha({ linha: 2, sku_codigo: 'MAT-1' }),
      linha({ linha: 3, sku_codigo: 'SUMIU' }),
    ])
    assert.equal(grupos.length, 1)
    assert.equal(motivoBloqueioGrupo(grupos[0]), null)
    const criacao = gruposParaCriacao(grupos)
    assert.equal(criacao.length, 1)
    assert.equal(criacao[0].itens.length, 2)
    assert.equal(criacao[0].itens[1].sku_codigo_informado, 'SUMIU')
    assert.equal(grupos[0].itens.filter((i) => !i.erro).length, 1)
  })

  it('grava o grupo com SKU ausente junto com o grupo válido', async () => {
    const { grupos } = await validar([
      linha({ codigo_origem: 'REQ-OK', sku_codigo: 'MAT-1' }),
      linha({
        linha: 4,
        codigo_origem: 'REQ-RUIM',
        sku_codigo: 'SUMIU',
      }),
    ])
    const criacao = gruposParaCriacao(grupos)
    assert.equal(grupos.length, 2)
    assert.equal(criacao.length, 2)
    const ruim = criacao.find((g) => g.codigo_origem === 'REQ-RUIM')
    assert.equal(ruim.itens[0].sku_codigo_informado, 'SUMIU')
  })

  it('se o SKU sumir depois da pré-visualização, a requisição ainda é gravada como pendente', async () => {
    const rows = [linha()]
    const previa = await validar(rows)
    assert.equal(gruposParaCriacao(previa.grupos).length, 1)

    const efetivacao = await validar(rows, { skus: [] })
    const criacao = gruposParaCriacao(efetivacao.grupos)
    assert.equal(criacao.length, 1)
    assert.equal(criacao[0].itens[0].sku_codigo_informado, 'MAT-1')
  })
})
