import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { podeAprovarRequisicao } from './aprovacao-requisicao.ts'

const empresa = 'emp-1'
const config = { req_aprovador_usuario_id: 'aprovador-config' }

describe('podeAprovarRequisicao', () => {
  it('reconhece administrador de grupo vinculado à mesma empresa', () => {
    assert.equal(
      podeAprovarRequisicao(
        {
          id: 'u1',
          empresa_id: empresa,
          role_global: 'operador',
          grupos_acesso: { is_admin: true, empresa_id: empresa },
        },
        config,
      ),
      true,
    )
  })

  it('aceita o grupo quando o embed vem em array', () => {
    assert.equal(
      podeAprovarRequisicao(
        {
          id: 'u1',
          empresa_id: empresa,
          role_global: 'operador',
          grupos_acesso: [{ is_admin: true, empresa_id: empresa }],
        },
        null,
      ),
      true,
    )
  })

  it('recusa administrador de grupo de outra empresa', () => {
    assert.equal(
      podeAprovarRequisicao(
        {
          id: 'u1',
          empresa_id: empresa,
          role_global: 'operador',
          grupos_acesso: { is_admin: true, empresa_id: 'emp-2' },
        },
        config,
      ),
      false,
    )
  })

  it('recusa is_admin sem empresa_id no grupo', () => {
    assert.equal(
      podeAprovarRequisicao(
        {
          id: 'u1',
          empresa_id: empresa,
          role_global: 'operador',
          grupos_acesso: { is_admin: true },
        },
        config,
      ),
      false,
    )
  })

  it('mantém aprovador configurado, admin e superadmin', () => {
    assert.equal(
      podeAprovarRequisicao({ id: 'aprovador-config', empresa_id: empresa, role_global: 'operador' }, config),
      true,
    )
    assert.equal(
      podeAprovarRequisicao({ id: 'u2', empresa_id: empresa, role_global: 'admin' }, null),
      true,
    )
    assert.equal(
      podeAprovarRequisicao({ id: 'u3', role_global: 'superadmin' }, null),
      true,
    )
  })

  it('recusa operador sem grupo administrador e sem ser o aprovador', () => {
    assert.equal(
      podeAprovarRequisicao(
        {
          id: 'u4',
          empresa_id: empresa,
          role_global: 'operador',
          grupos_acesso: { is_admin: false, empresa_id: empresa },
        },
        config,
      ),
      false,
    )
    assert.equal(podeAprovarRequisicao(null, config), false)
    assert.equal(podeAprovarRequisicao({ empresa_id: empresa, role_global: 'admin' }, config), false)
  })
})
