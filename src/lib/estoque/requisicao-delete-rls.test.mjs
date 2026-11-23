import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const root = new URL('../../../supabase/migrations/', import.meta.url)

function sql(name) {
  return readFileSync(new URL(name, root), 'utf8')
}

describe('DELETE em est_requisicoes', () => {
  it('a policy original limita ao mesmo tenant e à permissão de excluir, sem outros papéis', () => {
    const policy = sql('202609121000_estoque_modulo_tabelas_rls.sql')
    const start = policy.indexOf('CREATE POLICY est_requisicoes_delete')
    assert.ok(start > 0)
    const body = policy.slice(start, policy.indexOf(');', start))
    assert.match(body, /check_permission\('estoque', 'delete'\)/)
    assert.match(body, /check_permission\('estoque_requisicoes', 'delete'\)/)
    assert.match(body, /u\.empresa_id = est_requisicoes\.empresa_id/)
    assert.match(body, /role_global = 'superadmin'/)
    assert.doesNotMatch(body, /estoque_aprovacao|estoque_atendimento|is_admin/)
  })

  it('a migration de criação não devolve DELETE a authenticated', () => {
    const criacao = sql('20261116195933_est_criar_requisicao.sql')
    const complemento = sql('20261116200000_est_criar_requisicao_complemento.sql')
    assert.doesNotMatch(criacao, /GRANT DELETE ON TABLE public\.est_requisicoes TO authenticated/)
    assert.doesNotMatch(complemento, /GRANT DELETE ON TABLE public\.est_requisicoes TO authenticated/)
  })

  it('revoke posterior tira DELETE de authenticated e não amplia a policy', () => {
    const revoke = sql('20261116200100_est_requisicoes_revoke_delete.sql')
    assert.match(revoke, /REVOKE DELETE ON TABLE public\.est_requisicoes FROM authenticated\s*;/)
    assert.match(revoke, /REVOKE DELETE ON TABLE public\.est_requisicao_itens FROM authenticated\s*;/)
    assert.doesNotMatch(revoke, /GRANT DELETE/i)
    assert.doesNotMatch(revoke, /CREATE POLICY/i)
    assert.doesNotMatch(revoke, /TO anon\b/)
  })
})
