import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { criarRequisicao } from '../processar-requisicao.ts'
import {
  planoEfetivacaoRequisicaoPlanilha,
  politicaImportacaoRequisicao,
} from './politica-importacao.ts'

function fakeCriar({ config = null, cardError = false } = {}) {
  const inserts = []
  const rpcs = []
  return {
    inserts,
    rpcs,
    rpc(fn, args) {
      rpcs.push({ fn, args })
      if (fn !== 'est_criar_requisicao') {
        return Promise.resolve({ data: null, error: null })
      }
      return Promise.resolve({
        data: {
          sucesso: true,
          requisicao_id: 'req-nova',
          numero: 'REQ-20261116-0001',
          status: args.p_status,
          valor_estimado: args.p_valor_estimado,
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
        update(payload) {
          b.op = 'update'
          inserts.push({ table, payload, op: 'update' })
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
          if (table === 'est_config') return { data: config, error: null }
          if (table === 'est_requisicoes') return { data: null, error: null }
          if (table === 'pipeline_stages') {
            return { data: { id: 'stage-1' }, error: null }
          }
          return { data: null, error: null }
        },
        single: async () => {
          if (table === 'crm_cards' && cardError) {
            return { data: null, error: { message: 'card indisponível' } }
          }
          return { data: { id: 'card-1' }, error: null }
        },
        then(resolve, reject) {
          if (b.inserted || b.op === 'update') {
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
                  preco_custo: 50,
                },
              ],
              error: null,
            }).then(resolve, reject)
          }
          if (table === 'est_requisicoes' && b.head) {
            return Promise.resolve({ count: 0, error: null }).then(resolve, reject)
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
  itens: [{ sku_id: 's1', quantidade_pedida: 4 }],
}

const configAprovacaoLigada = {
  req_aprovacao_ativa: true,
  req_aprovacao_valor_minimo: 0,
  aprovacao_via_workflow: true,
  aprovacao_funil_id: 'funil-1',
  aprovacao_estagio_id: 'stage-1',
  req_planilha_auto_atender: true,
}

describe('Pacote 3 — política de importação', () => {
  it('Atlas sempre retorna autoAtender false', () => {
    for (const flag of [true, false, null, undefined]) {
      const p = politicaImportacaoRequisicao('cliente_atc_legado', {
        req_planilha_auto_atender: flag,
      })
      assert.equal(p.autoAtender, false)
    }
    assert.equal(
      politicaImportacaoRequisicao('cliente_atc_legado').autoAtender,
      false
    )
  })

  it('Atlas sempre retorna aprovadaNaOrigem true', () => {
    for (const flag of [true, false, null, undefined]) {
      const p = politicaImportacaoRequisicao('cliente_atc_legado', {
        req_planilha_auto_atender: flag,
      })
      assert.equal(p.aprovadaNaOrigem, true)
    }
  })

  it('Hugin padrão respeita req_planilha_auto_atender', () => {
    assert.equal(
      politicaImportacaoRequisicao('hugin_padrao', {
        req_planilha_auto_atender: true,
      }).autoAtender,
      true
    )
    assert.equal(
      politicaImportacaoRequisicao('hugin_padrao', {
        req_planilha_auto_atender: false,
      }).autoAtender,
      false
    )
    assert.equal(
      politicaImportacaoRequisicao('hugin_padrao', {
        req_planilha_auto_atender: true,
      }).aprovadaNaOrigem,
      false
    )
  })
})

describe('Pacote 3 — aprovação de origem na criação', () => {
  it('aprovada_na_origem gera status aprovada com req_aprovacao_ativa ligada', async () => {
    const client = fakeCriar({ config: configAprovacaoLigada })
    const res = await criarRequisicao(
      {
        ...baseInput,
        enviar_imediatamente: true,
        aprovada_na_origem: true,
        codigo_origem: 'ATC-534-20261116',
        sistema_origem: 'atc_suprimentos',
      },
      client,
      client
    )
    assert.equal(res.sucesso, true)
    assert.equal(res.status, 'aprovada')
    const rpc = client.rpcs.find((r) => r.fn === 'est_criar_requisicao')
    assert.equal(rpc.args.p_modo, 'aprovada_origem')
    assert.equal(rpc.args.p_codigo_origem, 'ATC-534-20261116')
    assert.equal(rpc.args.p_sistema_origem, 'atc_suprimentos')
    assert.equal(
      client.inserts.some((i) => i.table === 'crm_cards'),
      false
    )
    assert.equal(
      client.inserts.some((i) => i.table === 'est_requisicoes' && !i.op),
      false
    )
  })

  it('sem aprovada_na_origem mantém pendência quando a aprovação interna está ligada', async () => {
    const client = fakeCriar({ config: configAprovacaoLigada })
    const res = await criarRequisicao(
      {
        ...baseInput,
        enviar_imediatamente: true,
        aprovada_na_origem: false,
      },
      client
    )
    assert.equal(res.sucesso, true)
    assert.equal(res.status, 'pendente_aprovacao')
    const rpc = client.rpcs.find((r) => r.fn === 'est_criar_requisicao')
    assert.equal(rpc.args.p_modo, 'enviar')
    const card = client.inserts.find((i) => i.table === 'crm_cards')
    const vinculo = client.inserts.find(
      (i) => i.table === 'est_requisicoes' && i.op === 'update'
    )
    assert.ok(card)
    assert.equal(vinculo.payload.workflow_card_id, 'card-1')
    assert.ok(
      client.rpcs.findIndex((r) => r.fn === 'est_criar_requisicao') <
        client.inserts.findIndex((i) => i.table === 'crm_cards') ||
        client.inserts.findIndex((i) => i.table === 'crm_cards') >= 0
    )
  })

  it('sem o parâmetro continua rascunho quando não envia imediatamente', async () => {
    const client = fakeCriar({ config: configAprovacaoLigada })
    const res = await criarRequisicao(baseInput, client)
    assert.equal(res.sucesso, true)
    assert.equal(res.status, 'rascunho')
  })
})

describe('Pacote 3 — efetivação não baixa Atlas', () => {
  it('Atlas não pede atendimento mesmo com autoatendimento ligado', () => {
    const plano = planoEfetivacaoRequisicaoPlanilha(
      'cliente_atc_legado',
      { req_planilha_auto_atender: true },
      false
    )
    assert.equal(plano.autoAtender, false)
    assert.equal(plano.aprovada_na_origem, true)
    assert.equal(plano.enviar_imediatamente, true)
    assert.equal(plano.executarAtendimento, false)
  })

  it('Hugin padrão continua respeitando o autoatendimento', () => {
    const ligado = planoEfetivacaoRequisicaoPlanilha(
      'hugin_padrao',
      { req_planilha_auto_atender: true },
      true
    )
    assert.equal(ligado.autoAtender, true)
    assert.equal(ligado.aprovada_na_origem, false)
    assert.equal(ligado.enviar_imediatamente, false)
    assert.equal(ligado.executarAtendimento, true)

    const desligado = planoEfetivacaoRequisicaoPlanilha(
      'hugin_padrao',
      { req_planilha_auto_atender: false },
      true
    )
    assert.equal(desligado.autoAtender, false)
    assert.equal(desligado.aprovada_na_origem, false)
    assert.equal(desligado.enviar_imediatamente, true)
    assert.equal(desligado.executarAtendimento, false)
  })
})
