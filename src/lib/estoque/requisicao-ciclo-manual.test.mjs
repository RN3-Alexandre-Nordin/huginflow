import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, realpathSync } from 'node:fs'
import { describe, it, before, after } from 'node:test'
import { criarRequisicao } from './processar-requisicao.ts'

const EMP = '11111111-1111-4111-8111-111111111111'
const AUTH_ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AUTH_APROV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AUTH_OPER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const USER_ADMIN = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
const USER_APROV = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'
const USER_OPER = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'
const PESSOA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const PESSOA_CLIENTE = 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0'
const PESSOA_SEM_PAPEL = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'
const SKU = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const REQ_RASC = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd21'
const REQ_PEND = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd22'
const REQ_CANC = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd23'

function fakeClient(overrides = {}) {
  const calls = []
  const writes = []
  return {
    calls,
    writes,
    rpc(fn, args) {
      calls.push({ fn, args })
      if (overrides.rpc) return overrides.rpc(fn, args)
      return Promise.resolve({
        data: {
          sucesso: true,
          requisicao_id: 'req-1',
          numero: 'REQ-20261117-0001',
          status: 'pendente_aprovacao',
        },
        error: null,
      })
    },
    from(table) {
      const b = {
        select() { return b },
        eq() { return b },
        in() { return b },
        order() { return b },
        limit() { return b },
        insert(payload) {
          writes.push({ table, op: 'insert', payload })
          return b
        },
        update(payload) {
          writes.push({ table, op: 'update', payload })
          return b
        },
        maybeSingle: async () => {
          if (table === 'crm_leads') {
            return { data: { id: 'p1', nome: 'Ana', ativo: true, papeis: ['funcionario'] }, error: null }
          }
          if (table === 'est_config') return { data: null, error: null }
          if (table === 'est_requisicoes') return { data: null, error: null }
          return { data: null, error: null }
        },
        then(resolve, reject) {
          if (table === 'cad_skus') {
            return Promise.resolve({
              data: [{ id: 's1', codigo: 'MAT-1', nome: 'Luva', controla_estoque: true, ativo: true, preco_custo: 10 }],
              error: null,
            }).then(resolve, reject)
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }
}

describe('Pacote 5.1 — contrato da criação manual', () => {
  it('enviar imediatamente passa empresa, solicitante, itens e modo enviar', async () => {
    const client = fakeClient()
    const res = await criarRequisicao(
      {
        empresa_id: 'emp-1',
        requisitante_pessoa_id: 'p1',
        solicitante_usuario_id: 'u-sol',
        origem: 'manual',
        enviar_imediatamente: true,
        itens: [{ sku_id: 's1', quantidade_pedida: 3, local_id: 'loc-1' }],
      },
      client,
    )
    assert.equal(res.sucesso, true)
    assert.equal(client.calls.length, 1)
    const args = client.calls[0].args
    assert.equal(client.calls[0].fn, 'est_criar_requisicao')
    assert.equal(args.p_empresa_id, 'emp-1')
    assert.equal(args.p_solicitante_usuario_id, 'u-sol')
    assert.equal(args.p_origem, 'manual')
    assert.equal(args.p_modo, 'enviar')
    assert.deepEqual(args.p_itens, [{ sku_id: 's1', quantidade_pedida: 3, local_id: 'loc-1' }])
    assert.equal(client.writes.some((w) => w.table === 'est_requisicoes' && w.op === 'insert'), false)
    assert.equal(client.writes.some((w) => w.table === 'est_requisicao_itens'), false)
  })

  it('falha da RPC chega como mensagem de criação, sem gravar tabelas', async () => {
    const client = fakeClient({
      rpc: async () => ({ data: null, error: { message: 'timeout' } }),
    })
    const res = await criarRequisicao(
      {
        empresa_id: 'emp-1',
        requisitante_pessoa_id: 'p1',
        origem: 'manual',
        itens: [{ sku_id: 's1', quantidade_pedida: 1 }],
      },
      client,
    )
    assert.equal(res.sucesso, false)
    assert.match(res.mensagem, /Erro ao criar requisição: timeout/)
    assert.equal(client.writes.length, 0)
  })

  it('a action de transição usa a RPC e não faz INSERT nas tabelas da requisição', () => {
    const src = readFileSync(
      new URL('../../app/(app)/cockpit/estoque/requisicoes/actions.ts', import.meta.url),
      'utf8',
    )
    assert.match(src, /rpc\('est_transicionar_requisicao'/)
    assert.match(src, /pendente_aprovacao: 'enviar'/)
    assert.match(src, /aprovada: 'aprovar'/)
    assert.match(src, /rejeitada: 'rejeitar'/)
    assert.doesNotMatch(src, /from\('est_requisicoes'\)/)
    assert.doesNotMatch(src, /from\('est_requisicao_itens'\)/)
  })
})

const PG_MODULES = realpathSync(process.env.HUGIN_PG_MODULES
  || join(homedir(), 'AppData', 'Local', 'Temp', 'hugin-pgtest', 'node_modules'))

let pgServer
let client
let dir
let psql
let pgSkip = ''

function transicao(uid, req, intencao) {
  return `
    WITH cfg AS (
      SELECT set_config('hugin.test_uid', '${uid}', true) AS uid
    )
    SELECT est_transicionar_requisicao('${EMP}'::uuid, '${req}'::uuid, '${intencao}')::text
    FROM cfg`
}

describe('Pacote 5.1 — ciclo manual no Postgres', () => {
  before(async () => {
    let embedded
    let pg
    try {
      embedded = await import(pathToFileURL(join(PG_MODULES, 'embedded-postgres', 'dist', 'index.js')).href)
      pg = await import(pathToFileURL(join(PG_MODULES, 'pg', 'lib', 'index.js')).href)
    } catch (err) {
      pgSkip = err instanceof Error ? err.message : String(err)
      return
    }
    const Client = pg.Client || pg.default?.Client
    dir = await mkdtemp(join(tmpdir(), 'hugin-req-p51-'))
    pgServer = new embedded.default({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port: 55451,
      persistent: false,
      autoRehydrateSymlinks: true,
    })
    await pgServer.initialise()
    await pgServer.start()
    client = new Client({
      host: '127.0.0.1', port: 55451, user: 'postgres', password: 'postgres', database: 'postgres',
    })
    await client.connect()
    psql = async (sql) => {
      const result = await client.query(sql)
      const row = result.rows?.[0]
      if (!row) return ''
      const value = Object.values(row)[0]
      return value == null ? '' : String(value)
    }

    await psql(`
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('hugin.test_uid', true), '')::uuid
      $$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE AS $$ SELECT 'authenticated' $$;
      CREATE TABLE public.usuarios (
        id uuid PRIMARY KEY, auth_user_id uuid, empresa_id uuid,
        role_global text, ativo boolean DEFAULT true, grupo_id uuid
      );
      CREATE TABLE public.grupos_acesso (
        id uuid PRIMARY KEY, empresa_id uuid, is_admin boolean, permissoes jsonb
      );
      CREATE OR REPLACE FUNCTION public.check_permission(slug text, action text)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT COALESCE((
          SELECT u.role_global IN ('superadmin', 'admin')
            OR COALESCE(g.is_admin, false)
            OR COALESCE((g.permissoes -> slug) ? action, false)
          FROM public.usuarios u
          LEFT JOIN public.grupos_acesso g ON g.id = u.grupo_id AND g.empresa_id = u.empresa_id
          WHERE u.auth_user_id = auth.uid() AND COALESCE(u.ativo, true)
          LIMIT 1
        ), false);
      $$;
      CREATE TABLE public.cad_skus (
        id uuid PRIMARY KEY, empresa_id uuid NOT NULL, ativo boolean DEFAULT true,
        controla_estoque boolean DEFAULT true, preco_custo numeric DEFAULT 0
      );
      CREATE TABLE public.cad_locais_estoque (
        id uuid PRIMARY KEY, empresa_id uuid NOT NULL, ativo boolean DEFAULT true
      );
      CREATE TABLE public.crm_leads (
        id uuid PRIMARY KEY, empresa_id uuid NOT NULL, ativo boolean DEFAULT true, papeis text[]
      );
      CREATE TABLE public.departamentos (id uuid PRIMARY KEY, empresa_id uuid NOT NULL);
      CREATE TABLE public.est_config (
        empresa_id uuid PRIMARY KEY,
        req_aprovacao_ativa boolean,
        req_aprovacao_valor_minimo numeric,
        req_aprovador_usuario_id uuid,
        req_planilha_auto_atender boolean NOT NULL DEFAULT false
      );
      CREATE TABLE public.addon_registry (codigo text PRIMARY KEY, ativo boolean NOT NULL DEFAULT true);
      CREATE TABLE public.empresa_addons (
        empresa_id uuid, addon_codigo text, enabled boolean, commercial_status text,
        starts_at timestamptz, ends_at timestamptz
      );
      CREATE TABLE public.est_requisicoes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL, numero text NOT NULL,
        requisitante_pessoa_id uuid NOT NULL, solicitante_usuario_id uuid,
        departamento_id uuid, status text NOT NULL, origem text NOT NULL,
        codigo_origem text, sistema_origem text, requisitante_nome_origem text,
        workflow_card_id uuid, observacao text,
        valor_estimado numeric(18,2) NOT NULL DEFAULT 0,
        aprovador_usuario_id uuid, aprovado_em timestamptz, aprovacao_resultado text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.est_requisicao_itens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL,
        requisicao_id uuid NOT NULL REFERENCES public.est_requisicoes(id) ON DELETE CASCADE,
        sku_id uuid NOT NULL, quantidade_pedida numeric NOT NULL,
        quantidade_atendida numeric NOT NULL DEFAULT 0,
        quantidade_pendente numeric NOT NULL DEFAULT 0,
        local_id uuid, status_item text NOT NULL DEFAULT 'pendente',
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)
    const root = new URL('../../../supabase/migrations/', import.meta.url)
    await psql(readFileSync(new URL('20261116195933_est_criar_requisicao.sql', root), 'utf8'))
    await psql(readFileSync(new URL('20261116200000_est_criar_requisicao_complemento.sql', root), 'utf8'))
    await psql(readFileSync(new URL('20261117121500_est_criar_requisicao_papeis_text.sql', root), 'utf8'))
    await psql(`
      INSERT INTO public.usuarios (id, auth_user_id, empresa_id, role_global) VALUES
        ('${USER_ADMIN}', '${AUTH_ADMIN}', '${EMP}', 'admin'),
        ('${USER_APROV}', '${AUTH_APROV}', '${EMP}', 'operador'),
        ('${USER_OPER}', '${AUTH_OPER}', '${EMP}', 'operador');
      INSERT INTO public.crm_leads (id, empresa_id, ativo, papeis)
      VALUES
        ('${PESSOA}', '${EMP}', true, ARRAY['funcionario']::text[]),
        ('${PESSOA_CLIENTE}', '${EMP}', true, ARRAY['cliente']::text[]),
        ('${PESSOA_SEM_PAPEL}', '${EMP}', true, NULL);
      INSERT INTO public.cad_skus (id, empresa_id, preco_custo) VALUES ('${SKU}', '${EMP}', 12);
      INSERT INTO public.est_config (
        empresa_id, req_aprovacao_ativa, req_aprovacao_valor_minimo, req_aprovador_usuario_id
      ) VALUES ('${EMP}', true, 0, '${USER_APROV}');
    `)
  })

  after(async () => {
    await client?.end().catch(() => {})
    await pgServer?.stop().catch(() => {})
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  function gate(t) {
    if (pgSkip) t.skip(`Postgres embarcado indisponível: ${pgSkip}`)
  }

  it('criação manual em modo enviar grava solicitante, itens e pendência', async (t) => {
    gate(t)
    const criada = JSON.parse(await psql(`
      WITH cfg AS (
        SELECT set_config('hugin.test_uid', '${AUTH_ADMIN}', true) AS uid
      )
      SELECT est_criar_requisicao(
        '${EMP}'::uuid, '${PESSOA}'::uuid, '${USER_ADMIN}'::uuid, NULL, NULL,
        'manual', NULL, NULL, NULL, 'enviar',
        jsonb_build_array(jsonb_build_object('sku_id','${SKU}','quantidade_pedida',2))
      )::text FROM cfg
    `))
    assert.equal(criada.sucesso, true)
    assert.equal(criada.status, 'pendente_aprovacao')
    assert.equal(await psql(
      `SELECT solicitante_usuario_id::text || '|' || status FROM public.est_requisicoes WHERE id = '${criada.requisicao_id}';`
    ), `${USER_ADMIN}|pendente_aprovacao`)
    assert.equal(await psql(
      `SELECT quantidade_pedida::text FROM public.est_requisicao_itens WHERE requisicao_id = '${criada.requisicao_id}';`
    ), '2')
  })

  it('papeis text[] cria para funcionário autorizado e bloqueia papel ausente ou usuário sem permissão', async (t) => {
    gate(t)
    const chamar = (auth, pessoa) => `
      WITH cfg AS (
        SELECT set_config('hugin.test_uid', '${auth}', true) AS uid
      )
      SELECT est_criar_requisicao(
        '${EMP}'::uuid, '${pessoa}'::uuid, NULL, NULL, NULL,
        'manual', NULL, NULL, NULL, 'rascunho',
        jsonb_build_array(jsonb_build_object('sku_id','${SKU}','quantidade_pedida',1))
      )::text FROM cfg
    `
    const semPapel = JSON.parse(await psql(chamar(AUTH_ADMIN, PESSOA_CLIENTE)))
    assert.equal(semPapel.sucesso, false)
    assert.equal(semPapel.codigo, 'REQUISITANTE_INVALIDO')
    const nulo = JSON.parse(await psql(chamar(AUTH_ADMIN, PESSOA_SEM_PAPEL)))
    assert.equal(nulo.sucesso, false)
    assert.equal(nulo.codigo, 'REQUISITANTE_INVALIDO')
    const negado = JSON.parse(await psql(chamar(AUTH_OPER, PESSOA)))
    assert.equal(negado.sucesso, false)
    assert.equal(negado.codigo, 'ACESSO_NEGADO')
    const criada = JSON.parse(await psql(chamar(AUTH_ADMIN, PESSOA)))
    assert.equal(criada.sucesso, true)
    assert.match(criada.numero, /^REQ-\d{8}-\d{4}$/)
    assert.equal(criada.status, 'rascunho')
  })

  it('envio de rascunho é válido e a repetição não altera auditoria nem status', async (t) => {
    gate(t)
    await psql(`
      INSERT INTO public.est_requisicoes (
        id, empresa_id, numero, requisitante_pessoa_id, status, origem
      ) VALUES ('${REQ_RASC}', '${EMP}', 'REQ-RASC-51', '${PESSOA}', 'rascunho', 'manual');
      INSERT INTO public.est_requisicao_itens (
        empresa_id, requisicao_id, sku_id, quantidade_pedida, quantidade_pendente
      ) VALUES ('${EMP}', '${REQ_RASC}', '${SKU}', 1, 1);
    `)
    const enviada = JSON.parse(await psql(transicao(AUTH_ADMIN, REQ_RASC, 'enviar')))
    assert.equal(enviada.sucesso, true)
    assert.equal(enviada.status, 'pendente_aprovacao')
    const antes = await psql(
      `SELECT status || '|' || COALESCE(aprovador_usuario_id::text, '') || '|' || COALESCE(aprovado_em::text, '')
       FROM public.est_requisicoes WHERE id = '${REQ_RASC}';`
    )
    const deNovo = JSON.parse(await psql(transicao(AUTH_ADMIN, REQ_RASC, 'enviar')))
    assert.equal(deNovo.sucesso, false)
    assert.equal(deNovo.codigo, 'TRANSICAO_INVALIDA')
    assert.equal(await psql(
      `SELECT status || '|' || COALESCE(aprovador_usuario_id::text, '') || '|' || COALESCE(aprovado_em::text, '')
       FROM public.est_requisicoes WHERE id = '${REQ_RASC}';`
    ), antes)
  })

  it('aprovador configurado aprova e operador sem papel não rejeita', async (t) => {
    gate(t)
    await psql(`
      INSERT INTO public.est_requisicoes (
        id, empresa_id, numero, requisitante_pessoa_id, status, origem
      ) VALUES
        ('${REQ_PEND}', '${EMP}', 'REQ-PEND-51', '${PESSOA}', 'pendente_aprovacao', 'manual');
    `)
    const negada = JSON.parse(await psql(transicao(AUTH_OPER, REQ_PEND, 'rejeitar')))
    assert.equal(negada.sucesso, false)
    assert.equal(negada.codigo, 'ACESSO_NEGADO')
    assert.equal(await psql(`SELECT status FROM public.est_requisicoes WHERE id = '${REQ_PEND}';`), 'pendente_aprovacao')

    const aprovada = JSON.parse(await psql(transicao(AUTH_APROV, REQ_PEND, 'aprovar')))
    assert.equal(aprovada.sucesso, true)
    assert.equal(aprovada.status, 'aprovada')
    assert.equal(await psql(
      `SELECT aprovador_usuario_id::text || '|' || aprovacao_resultado FROM public.est_requisicoes WHERE id = '${REQ_PEND}';`
    ), `${USER_APROV}|aprovada`)
  })

  it('rejeição grava o resultado da decisão e requisição cancelada não muda', async (t) => {
    gate(t)
    const outra = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd24'
    await psql(`
      INSERT INTO public.est_requisicoes (
        id, empresa_id, numero, requisitante_pessoa_id, status, origem
      ) VALUES
        ('${outra}', '${EMP}', 'REQ-REJ-51', '${PESSOA}', 'pendente_aprovacao', 'manual'),
        ('${REQ_CANC}', '${EMP}', 'REQ-CANC-51', '${PESSOA}', 'cancelada', 'manual');
    `)
    const rejeitada = JSON.parse(await psql(transicao(AUTH_APROV, outra, 'rejeitar')))
    assert.equal(rejeitada.sucesso, true)
    assert.equal(rejeitada.status, 'rejeitada')
    const auditoria = await psql(
      `SELECT aprovador_usuario_id::text || '|' || aprovacao_resultado || '|' || aprovado_em::text
       FROM public.est_requisicoes WHERE id = '${outra}';`
    )
    assert.match(auditoria, new RegExp(`^${USER_APROV}\\|rejeitada\\|`))
    const deNovo = JSON.parse(await psql(transicao(AUTH_APROV, outra, 'rejeitar')))
    assert.equal(deNovo.sucesso, true)
    assert.equal(deNovo.idempotente, true)
    assert.equal(await psql(
      `SELECT aprovador_usuario_id::text || '|' || aprovacao_resultado || '|' || aprovado_em::text
       FROM public.est_requisicoes WHERE id = '${outra}';`
    ), auditoria)

    const sobreCancelada = JSON.parse(await psql(transicao(AUTH_APROV, REQ_CANC, 'rejeitar')))
    assert.equal(sobreCancelada.sucesso, false)
    assert.equal(sobreCancelada.codigo, 'TRANSICAO_INVALIDA')
    assert.equal(await psql(
      `SELECT status || '|' || COALESCE(aprovacao_resultado, '') FROM public.est_requisicoes WHERE id = '${REQ_CANC}';`
    ), 'cancelada|')
  })

  it('UPDATE direto de status é bloqueado e transição inválida não grava estado intermediário', async (t) => {
    gate(t)
    await assert.rejects(
      () => psql(`UPDATE public.est_requisicoes SET status = 'aprovada' WHERE id = '${REQ_CANC}';`),
      /STATUS_REQUISICAO_PROTEGIDO/,
    )
    assert.equal(await psql(`SELECT status FROM public.est_requisicoes WHERE id = '${REQ_CANC}';`), 'cancelada')
    const rascunho = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd25'
    await psql(`
      INSERT INTO public.est_requisicoes (
        id, empresa_id, numero, requisitante_pessoa_id, status, origem
      ) VALUES ('${rascunho}', '${EMP}', 'REQ-RASC-51B', '${PESSOA}', 'rascunho', 'manual');
    `)
    const antes = await psql(
      `SELECT status || '|' || COALESCE(aprovador_usuario_id::text, '') FROM public.est_requisicoes WHERE id = '${rascunho}';`
    )
    const invalida = JSON.parse(await psql(transicao(AUTH_APROV, rascunho, 'aprovar')))
    assert.equal(invalida.sucesso, false)
    assert.equal(invalida.codigo, 'TRANSICAO_INVALIDA')
    assert.equal(await psql(
      `SELECT status || '|' || COALESCE(aprovador_usuario_id::text, '') FROM public.est_requisicoes WHERE id = '${rascunho}';`
    ), antes)
  })
})
