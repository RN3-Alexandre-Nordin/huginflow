import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, realpathSync } from 'node:fs'
import { describe, it } from 'node:test'
import { criarRequisicao } from '../processar-requisicao.ts'

function fakeClient(overrides = {}) {
  const calls = []
  const writes = []
  const pessoa = overrides.pessoa ?? {
    id: 'p1',
    nome: 'Ana',
    ativo: true,
    papeis: ['funcionario'],
  }
  const skus = overrides.skus ?? [
    { id: 's1', codigo: 'MAT-1', nome: 'Luva', controla_estoque: true, ativo: true, preco_custo: 10 },
  ]
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
          numero: 'REQ-20261116-0001',
          status: args.p_status,
        },
        error: null,
      })
    },
    from(table) {
      const b = {
        filters: {},
        select() { return b },
        eq(col, val) { b.filters[col] = val; return b },
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
          if (table === 'crm_leads') return { data: pessoa, error: null }
          if (table === 'est_config') return { data: overrides.config ?? null, error: null }
          if (table === 'est_requisicoes') return { data: overrides.origemExistente ?? null, error: null }
          if (table === 'pipeline_stages') return { data: { id: 'stage-1' }, error: null }
          return { data: null, error: null }
        },
        single: async () => {
          if (table === 'crm_cards' && overrides.cardError) {
            return { data: null, error: { message: 'workflow indisponível' } }
          }
          return { data: { id: 'card-1' }, error: null }
        },
        then(resolve, reject) {
          if (table === 'cad_skus') {
            return Promise.resolve({ data: skus, error: null }).then(resolve, reject)
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }
}

const item = { sku_id: 's1', quantidade_pedida: 2 }

describe('Pacote 4 — contrato da criação', () => {
  it('cadastro manual usa a RPC e não grava cabeçalho direto', async () => {
    const client = fakeClient()
    const res = await criarRequisicao(
      { empresa_id: 'emp-1', requisitante_pessoa_id: 'p1', origem: 'manual', itens: [item] },
      client
    )
    assert.equal(res.sucesso, true)
    assert.equal(res.numero, 'REQ-20261116-0001')
    assert.equal(client.calls.length, 1)
    assert.equal(client.calls[0].fn, 'est_criar_requisicao')
    assert.equal(client.calls[0].args.p_origem, 'manual')
    assert.equal(client.calls[0].args.p_codigo_origem, null)
    assert.equal(client.calls[0].args.p_modo, 'rascunho')
    assert.equal(client.writes.some((w) => w.table === 'est_requisicoes' && w.op === 'insert'), false)
  })

  it('importação Atlas e Hugin padrão usam a mesma RPC', async () => {
    for (const origem of [
      { sistema_origem: 'atc_suprimentos', codigo_origem: 'ATC-1', aprovada_na_origem: true },
      { sistema_origem: 'planilha', codigo_origem: 'HG-1', aprovada_na_origem: false },
    ]) {
      const client = fakeClient()
      const res = await criarRequisicao(
        {
          empresa_id: 'emp-1',
          requisitante_pessoa_id: 'p1',
          origem: 'planilha',
          enviar_imediatamente: true,
          itens: [item],
          ...origem,
        },
        client,
        origem.aprovada_na_origem ? client : undefined
      )
      assert.equal(res.sucesso, true)
      assert.equal(client.calls[0].fn, 'est_criar_requisicao')
      assert.equal(client.calls[0].args.p_codigo_origem, origem.codigo_origem)
      assert.equal(client.calls[0].args.p_sistema_origem, origem.sistema_origem)
      assert.notEqual(res.numero, origem.codigo_origem)
    }
  })

  it('lista vazia, quantidade inválida e SKU inexistente não chamam a RPC', async () => {
    const vazia = await criarRequisicao(
      { empresa_id: 'emp-1', requisitante_pessoa_id: 'p1', itens: [] },
      fakeClient()
    )
    assert.equal(vazia.codigo, 'ITENS_OBRIGATORIOS')

    const qtd = await criarRequisicao(
      { empresa_id: 'emp-1', requisitante_pessoa_id: 'p1', itens: [{ sku_id: 's1', quantidade_pedida: 0 }] },
      fakeClient()
    )
    assert.equal(qtd.codigo, 'QUANTIDADE_INVALIDA')

    const negativa = await criarRequisicao(
      { empresa_id: 'emp-1', requisitante_pessoa_id: 'p1', itens: [{ sku_id: 's1', quantidade_pedida: -1 }] },
      fakeClient()
    )
    assert.equal(negativa.codigo, 'QUANTIDADE_INVALIDA')

    const sku = await criarRequisicao(
      { empresa_id: 'emp-1', requisitante_pessoa_id: 'p1', itens: [{ sku_id: 'nao-existe', quantidade_pedida: 1 }] },
      fakeClient()
    )
    assert.equal(sku.codigo, 'SKU_INVALIDO')
  })

  it('origem duplicada devolve id e número existentes', async () => {
    const client = fakeClient({
      origemExistente: { id: 'ja', numero: 'REQ-20261116-0007' },
    })
    const res = await criarRequisicao(
      {
        empresa_id: 'emp-1',
        requisitante_pessoa_id: 'p1',
        origem: 'planilha',
        codigo_origem: 'ATC-1',
        sistema_origem: 'atc_suprimentos',
        itens: [item],
      },
      client
    )
    assert.equal(res.sucesso, false)
    assert.equal(res.codigo, 'REQUISICAO_ORIGEM_DUPLICADA')
    assert.equal(res.requisicaoId, 'ja')
    assert.equal(res.numero, 'REQ-20261116-0007')
    assert.equal(client.calls.length, 0)
  })

  it('falha do card de workflow depois da RPC mantém a requisição', async () => {
    const client = fakeClient({
      cardError: true,
      config: {
        req_aprovacao_ativa: true,
        req_aprovacao_valor_minimo: 0,
        aprovacao_via_workflow: true,
        aprovacao_funil_id: 'funil-1',
        aprovacao_estagio_id: 'stage-1',
      },
    })
    const res = await criarRequisicao(
      {
        empresa_id: 'emp-1',
        requisitante_pessoa_id: 'p1',
        origem: 'manual',
        enviar_imediatamente: true,
        itens: [item],
      },
      client
    )
    assert.equal(res.sucesso, true)
    assert.equal(res.requisicaoId, 'req-1')
    assert.equal(res.status, 'pendente_aprovacao')
    assert.equal(client.calls[0].fn, 'est_criar_requisicao')
    assert.equal(client.writes.some((w) => w.table === 'crm_cards'), true)
    assert.equal(
      client.writes.some((w) => w.table === 'est_requisicoes' && w.op === 'update'),
      false
    )
  })
})

const PG_MODULES = realpathSync(process.env.HUGIN_PG_MODULES
  || join(homedir(), 'AppData', 'Local', 'Temp', 'hugin-pgtest', 'node_modules'))

async function loadPg() {
  const embedded = await import(pathToFileURL(join(PG_MODULES, 'embedded-postgres', 'dist', 'index.js')).href)
  const pg = await import(pathToFileURL(join(PG_MODULES, 'pg', 'lib', 'index.js')).href)
  const Client = pg.Client || pg.default?.Client
  return { EmbeddedPostgres: embedded.default, Client }
}

const EMP_A = '11111111-1111-4111-8111-111111111111'
const EMP_B = '22222222-2222-4222-8222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER_OUT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const USER_SUPER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const PESSOA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const PESSOA_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef'
const SKU = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const SKU_B = '99999999-9999-4999-8999-999999999999'
const LOCAL = '88888888-8888-4888-8888-888888888888'
const USER_RESP = 'abababab-abab-4aba-8aba-ababababab01'
const USER_GA = 'abababab-abab-4aba-8aba-ababababab02'
const GRUPO = 'abababab-abab-4aba-8aba-ababababab03'
const REQ_PEND = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd01'
const REQ_PLAN = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd02'
const REQ_ATLAS = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd03'
const REQ_REJ = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd04'

function callRpc(uid, empresa, extra = {}) {
  const itens = extra.itens || `jsonb_build_array(jsonb_build_object('sku_id','${SKU}','quantidade_pedida',1))`
  const codigo = extra.codigo ? `'${extra.codigo}'` : 'NULL'
  const sistema = extra.sistema ? `'${extra.sistema}'` : 'NULL'
  const modo = extra.modo || 'rascunho'
  const origem = extra.origem || 'manual'
  return `
    WITH cfg AS (
      SELECT set_config('hugin.test_uid', '${uid}', false) AS uid,
             set_config('hugin.test_role', '${extra.role || 'authenticated'}', false) AS role
    )
    SELECT est_criar_requisicao(
      '${empresa}'::uuid,
      '${extra.pessoa || PESSOA}'::uuid,
      ${extra.solicitante ? `'${extra.solicitante}'::uuid` : 'NULL'}, NULL, NULL,
      '${origem}',
      ${codigo},
      ${sistema},
      NULL,
      '${modo}',
      ${itens}
    )::text
    FROM cfg;
  `
}

describe('Pacote 4 — Postgres real', () => {
  it('atomicidade, numeração e autorização', { timeout: 180000 }, async () => {
    const { EmbeddedPostgres, Client } = await loadPg()
    const dir = await mkdtemp(join(tmpdir(), 'hugin-req-p4-'))
    const port = 55432
    const pgServer = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      autoRehydrateSymlinks: true,
    })
    await pgServer.initialise()
    await pgServer.start()
    const connect = () => new Client({
      host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'postgres',
    })
    const client = connect()
    await client.connect()
    const psql = async (sql) => {
      const result = await client.query(sql)
      const row = result.rows?.[0]
      if (!row) return ''
      const value = Object.values(row)[0]
      return value == null ? '' : String(value)
    }
    const rpc = async (uid, empresa, extra = {}) => JSON.parse(await psql(callRpc(uid, empresa, extra)))

    try {
    await psql(`
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('hugin.test_uid', true), '')::uuid
      $$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('hugin.test_role', true), ''), 'authenticated')
      $$;
      CREATE TABLE public.usuarios (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        auth_user_id uuid,
        empresa_id uuid,
        role_global text,
        ativo boolean DEFAULT true,
        grupo_id uuid
      );
      CREATE TABLE public.grupos_acesso (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid,
        is_admin boolean,
        permissoes jsonb
      );
      CREATE OR REPLACE FUNCTION public.check_permission(slug text, action text)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT COALESCE((
          SELECT u.role_global IN ('superadmin', 'admin')
            OR COALESCE(g.is_admin, false)
            OR COALESCE((g.permissoes -> slug) ? action, false)
          FROM public.usuarios u
          LEFT JOIN public.grupos_acesso g
            ON g.id = u.grupo_id AND g.empresa_id = u.empresa_id
          WHERE u.auth_user_id = auth.uid() AND COALESCE(u.ativo, true)
          LIMIT 1
        ), false);
      $$;
      CREATE TABLE public.cad_skus (
        id uuid PRIMARY KEY,
        empresa_id uuid NOT NULL,
        ativo boolean DEFAULT true,
        controla_estoque boolean DEFAULT true,
        preco_custo numeric DEFAULT 0
      );
      CREATE TABLE public.cad_locais_estoque (
        id uuid PRIMARY KEY,
        empresa_id uuid NOT NULL,
        ativo boolean DEFAULT true
      );
      CREATE TABLE public.crm_leads (
        id uuid PRIMARY KEY,
        empresa_id uuid NOT NULL,
        ativo boolean DEFAULT true,
        papeis text[] DEFAULT ARRAY[]::text[]
      );
      CREATE TABLE public.departamentos (
        id uuid PRIMARY KEY,
        empresa_id uuid NOT NULL
      );
      CREATE TABLE public.est_config (
        empresa_id uuid PRIMARY KEY,
        req_aprovacao_ativa boolean,
        req_aprovacao_valor_minimo numeric,
        req_aprovador_usuario_id uuid,
        req_planilha_auto_atender boolean NOT NULL DEFAULT false
      );
      CREATE TABLE public.addon_registry (
        codigo text PRIMARY KEY,
        ativo boolean NOT NULL DEFAULT true
      );
      CREATE TABLE public.empresa_addons (
        empresa_id uuid,
        addon_codigo text,
        enabled boolean,
        commercial_status text,
        starts_at timestamptz,
        ends_at timestamptz
      );
      CREATE TABLE public.est_requisicoes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL,
        numero text NOT NULL,
        requisitante_pessoa_id uuid NOT NULL,
        solicitante_usuario_id uuid,
        departamento_id uuid,
        status text NOT NULL,
        origem text NOT NULL,
        codigo_origem text,
        sistema_origem text,
        requisitante_nome_origem text,
        workflow_card_id uuid,
        observacao text,
        valor_estimado numeric(18,2) NOT NULL DEFAULT 0,
        aprovador_usuario_id uuid,
        aprovado_em timestamptz,
        aprovacao_resultado text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.est_requisicao_itens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL,
        requisicao_id uuid NOT NULL REFERENCES public.est_requisicoes(id) ON DELETE CASCADE,
        sku_id uuid NOT NULL,
        quantidade_pedida numeric NOT NULL,
        quantidade_atendida numeric NOT NULL DEFAULT 0,
        quantidade_pendente numeric NOT NULL DEFAULT 0,
        local_id uuid,
        status_item text NOT NULL DEFAULT 'pendente',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX uq_est_requisicoes_empresa_sistema_codigo_origem
        ON public.est_requisicoes (empresa_id, sistema_origem, codigo_origem)
        WHERE codigo_origem IS NOT NULL AND btrim(codigo_origem) <> ''
          AND sistema_origem IS NOT NULL AND btrim(sistema_origem) <> '';
      INSERT INTO public.est_requisicoes (empresa_id, numero, requisitante_pessoa_id, status, origem)
      VALUES ('${EMP_A}', 'REQ-DUP', '${PESSOA}', 'rascunho', 'manual'),
             ('${EMP_A}', 'REQ-DUP', '${PESSOA}', 'rascunho', 'manual');
    `)

    const migration = readFileSync(
      new URL('../../../../supabase/migrations/20261116195933_est_criar_requisicao.sql', import.meta.url),
      'utf8'
    )
    const complemento = readFileSync(
      new URL('../../../../supabase/migrations/20261116200000_est_criar_requisicao_complemento.sql', import.meta.url),
      'utf8'
    )
    await assert.rejects(() => psql(migration), /MIGRATION_ABORTADA/)
    await psql(`DELETE FROM public.est_requisicoes WHERE numero = 'REQ-DUP';`)
    await psql(migration)
    await psql(complemento)
    await psql(readFileSync(
      new URL('../../../../supabase/migrations/20261117121500_est_criar_requisicao_papeis_text.sql', import.meta.url),
      'utf8'
    ))

    await psql(`
      INSERT INTO public.usuarios (auth_user_id, empresa_id, role_global) VALUES
        ('${USER_A}', '${EMP_A}', 'admin'),
        ('${USER_B}', '${EMP_B}', 'admin'),
        ('${USER_OUT}', '${EMP_B}', 'operador'),
        ('${USER_SUPER}', '${EMP_B}', 'superadmin');
      INSERT INTO public.crm_leads (id, empresa_id, ativo, papeis) VALUES
        ('${PESSOA}', '${EMP_A}', true, ARRAY['funcionario']::text[]),
        ('${PESSOA_B}', '${EMP_B}', true, ARRAY['funcionario']::text[]);
      INSERT INTO public.cad_skus (id, empresa_id) VALUES ('${SKU}', '${EMP_A}'), ('${SKU_B}', '${EMP_B}');
      INSERT INTO public.cad_locais_estoque (id, empresa_id) VALUES ('${LOCAL}', '${EMP_A}');
      INSERT INTO public.est_requisicoes (empresa_id, numero, requisitante_pessoa_id, status, origem)
      VALUES ('${EMP_A}', 'REQ-' || to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1, 'YYYYMMDD') || '-0009',
              '${PESSOA}', 'rascunho', 'manual');
    `)

    const criada = await rpc(USER_A, EMP_A)
    assert.equal(criada.sucesso, true)
    assert.match(criada.numero, /^REQ-\d{8}-0001$/)
    const itens = Number(await psql(
      `SELECT count(*) FROM public.est_requisicao_itens WHERE requisicao_id = '${criada.requisicao_id}';`
    ))
    assert.equal(itens, 1)

    const vazia = await rpc(USER_A, EMP_A, { itens: `'[]'::jsonb` })
    assert.equal(vazia.codigo, 'ITENS_OBRIGATORIOS')

    const zero = await rpc(USER_A, EMP_A, {
      itens: `jsonb_build_array(jsonb_build_object('sku_id','${SKU}','quantidade_pedida',0))`,
    })
    assert.equal(zero.codigo, 'QUANTIDADE_INVALIDA')

    const sku = await rpc(USER_A, EMP_A, {
      itens: `jsonb_build_array(jsonb_build_object('sku_id','${SKU_B}','quantidade_pedida',1))`,
    })
    assert.equal(sku.codigo, 'SKU_INVALIDO')

    const negado = await rpc(USER_OUT, EMP_A)
    assert.equal(negado.codigo, 'ACESSO_NEGADO')

    const superadmin = await rpc(USER_SUPER, EMP_A)
    assert.equal(superadmin.sucesso, true)

    await psql(`
      CREATE OR REPLACE FUNCTION public.est_teste_falha_item() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        IF NEW.quantidade_pedida = 4242 THEN
          RAISE EXCEPTION 'falha forçada no item';
        END IF;
        RETURN NEW;
      END
      $fn$;
      DROP TRIGGER IF EXISTS est_teste_falha_item ON public.est_requisicao_itens;
      CREATE TRIGGER est_teste_falha_item
        BEFORE INSERT ON public.est_requisicao_itens
        FOR EACH ROW EXECUTE FUNCTION public.est_teste_falha_item();
    `)
    const antes = Number(await psql(`SELECT count(*) FROM public.est_requisicoes;`))
    await assert.rejects(() => psql(callRpc(USER_A, EMP_A, {
      itens: `jsonb_build_array(jsonb_build_object('sku_id','${SKU}','quantidade_pedida',4242))`,
    })), /falha forçada no item/)
    const depois = Number(await psql(`SELECT count(*) FROM public.est_requisicoes;`))
    assert.equal(depois, antes)
    await psql(`DROP TRIGGER est_teste_falha_item ON public.est_requisicao_itens;`)

    const other = connect()
    await other.connect()
    const [c1, c2] = await Promise.all([
      client.query(callRpc(USER_A, EMP_A)).then((r) => JSON.parse(Object.values(r.rows[0])[0])),
      other.query(callRpc(USER_A, EMP_A)).then((r) => JSON.parse(Object.values(r.rows[0])[0])),
    ])
    assert.equal(c1.sucesso && c2.sucesso, true)
    assert.notEqual(c1.numero, c2.numero)

    const [d1, d2] = await Promise.all([
      client.query(callRpc(USER_A, EMP_A)).then((r) => JSON.parse(Object.values(r.rows[0])[0])),
      other.query(callRpc(USER_B, EMP_B, {
        pessoa: PESSOA_B,
        itens: `jsonb_build_array(jsonb_build_object('sku_id','${SKU_B}','quantidade_pedida',1))`,
      })).then((r) => JSON.parse(Object.values(r.rows[0])[0])),
    ])
    assert.equal(d1.sucesso && d2.sucesso, true)
    assert.match(d2.numero, /-0001$/)

    const dup1 = await rpc(USER_A, EMP_A, {
      origem: 'planilha', codigo: 'ATC-9', sistema: 'atc_suprimentos',
    })
    const dup2 = await rpc(USER_A, EMP_A, {
      origem: 'planilha', codigo: 'ATC-9', sistema: 'atc_suprimentos',
    })
    assert.equal(dup1.sucesso, true)
    assert.equal(dup2.sucesso, false)
    assert.equal(dup2.codigo, 'REQUISICAO_ORIGEM_DUPLICADA')
    assert.equal(dup2.requisicao_id, dup1.requisicao_id)
    assert.equal(dup2.numero, dup1.numero)

    const hoje = dup1.numero.slice(0, 13)
    const ontem = Number(await psql(
      `SELECT count(*) FROM public.est_requisicoes WHERE numero LIKE 'REQ-%' AND numero < '${hoje}%' AND empresa_id = '${EMP_A}';`
    ))
    assert.ok(ontem >= 1)
    assert.match(criada.numero, /-0001$/)

    const solicitanteA = await psql(`SELECT id FROM public.usuarios WHERE auth_user_id = '${USER_A}';`)
    const gravadoSolicitante = await psql(
      `SELECT solicitante_usuario_id FROM public.est_requisicoes WHERE id = '${criada.requisicao_id}';`
    )
    assert.equal(gravadoSolicitante, solicitanteA)

    const outroSolicitante = await rpc(USER_A, EMP_A, { solicitante: USER_B })
    assert.equal(outroSolicitante.codigo, 'SOLICITANTE_INVALIDO')

    await psql(`
      INSERT INTO public.addon_registry (codigo, ativo) VALUES ('estoque_req_adapter_atc', false);
      INSERT INTO public.empresa_addons (empresa_id, addon_codigo, enabled, commercial_status)
      VALUES ('${EMP_A}', 'estoque_req_adapter_atc', true, 'active');
      INSERT INTO public.usuarios (id, auth_user_id, empresa_id, role_global)
      VALUES ('${USER_RESP}', '${USER_RESP}', '${EMP_A}', 'admin');
    `)
    const addonOff = await rpc('00000000-0000-4000-8000-000000000000', EMP_A, {
      role: 'service_role',
      modo: 'aprovada_origem',
      origem: 'planilha',
      codigo: 'ATC-OFF',
      sistema: 'atc_suprimentos',
      solicitante: USER_RESP,
    })
    assert.equal(addonOff.codigo, 'ADDON_NAO_HABILITADO')
    await psql(`UPDATE public.addon_registry SET ativo = true WHERE codigo = 'estoque_req_adapter_atc';`)
    const atlasOk = await rpc('00000000-0000-4000-8000-000000000000', EMP_A, {
      role: 'service_role',
      modo: 'aprovada_origem',
      origem: 'planilha',
      codigo: 'ATC-ON',
      sistema: 'atc_suprimentos',
      solicitante: USER_RESP,
    })
    assert.equal(atlasOk.sucesso, true)
    assert.equal(await psql(
      `SELECT solicitante_usuario_id FROM public.est_requisicoes WHERE id = '${atlasOk.requisicao_id}';`
    ), USER_RESP)

    await psql(`
      GRANT USAGE ON SCHEMA public TO authenticated;
      GRANT SELECT ON public.est_requisicoes, public.est_requisicao_itens TO authenticated;
    `)
    const comoAuthenticated = async (sql) => {
      await client.query('SET ROLE authenticated')
      try {
        return await client.query(sql)
      } finally {
        await client.query('RESET ROLE')
      }
    }
    await assert.rejects(() => psql(`
      UPDATE public.est_requisicoes
      SET aprovador_usuario_id = '${solicitanteA}'
      WHERE id = '${criada.requisicao_id}';
    `), /AUDITORIA_REQUISICAO_PROTEGIDA/)
    await assert.rejects(
      () => comoAuthenticated(`
        UPDATE public.est_requisicoes
        SET aprovacao_resultado = 'aprovada'
        WHERE id = '${criada.requisicao_id}';
      `),
      /42501|permission denied|AUDITORIA_REQUISICAO_PROTEGIDA/
    )
    const card = '12121212-1212-4121-8121-121212121212'
    await psql(`
      CREATE TABLE IF NOT EXISTS public.crm_cards (
        id uuid PRIMARY KEY,
        empresa_id uuid NOT NULL
      );
      INSERT INTO public.crm_cards (id, empresa_id) VALUES ('${card}', '${EMP_A}');
    `)
    await comoAuthenticated(`
      UPDATE public.est_requisicoes
      SET workflow_card_id = '${card}', updated_at = now()
      WHERE id = '${criada.requisicao_id}';
    `)
    assert.equal(await psql(
      `SELECT workflow_card_id FROM public.est_requisicoes WHERE id = '${criada.requisicao_id}';`
    ), card)
    await assert.rejects(
      () => comoAuthenticated(`
        UPDATE public.est_requisicao_itens
        SET quantidade_pedida = 99
        WHERE requisicao_id = '${criada.requisicao_id}';
      `),
      /42501|permission denied/
    )
    await assert.rejects(
      () => comoAuthenticated(`
        UPDATE public.est_requisicao_itens
        SET quantidade_atendida = 1, quantidade_pendente = 0, status_item = 'atendido', updated_at = now()
        WHERE requisicao_id = '${criada.requisicao_id}';
      `),
      /42501|permission denied/
    )

    await psql(`
      INSERT INTO public.grupos_acesso (id, empresa_id, is_admin) VALUES ('${GRUPO}', '${EMP_A}', true);
      INSERT INTO public.usuarios (id, auth_user_id, empresa_id, role_global, grupo_id)
      VALUES ('${USER_GA}', '${USER_GA}', '${EMP_A}', 'operador', '${GRUPO}');
      INSERT INTO public.est_config (empresa_id, req_aprovacao_ativa, req_planilha_auto_atender)
      VALUES ('${EMP_A}', true, false);
      INSERT INTO public.est_requisicoes (
        id, empresa_id, numero, requisitante_pessoa_id, status, origem, sistema_origem
      ) VALUES
        ('${REQ_PEND}', '${EMP_A}', 'REQ-PEND', '${PESSOA}', 'pendente_aprovacao', 'manual', NULL),
        ('${REQ_PLAN}', '${EMP_A}', 'REQ-PLAN', '${PESSOA}', 'rascunho', 'planilha', 'hugin'),
        ('${REQ_ATLAS}', '${EMP_A}', 'REQ-ATLAS', '${PESSOA}', 'rascunho', 'planilha', 'atc_suprimentos');
      INSERT INTO public.est_requisicao_itens (
        empresa_id, requisicao_id, sku_id, quantidade_pedida, quantidade_atendida, quantidade_pendente, status_item
      ) VALUES (
        '${EMP_A}', '${REQ_PLAN}', '${SKU}', 1, 0, 1, 'pendente'
      );
    `)
    const transicao = async (uid, req, intencao) => JSON.parse(await psql(`
      WITH cfg AS (
        SELECT set_config('hugin.test_uid', '${uid}', false) AS uid
      )
      SELECT est_transicionar_requisicao('${EMP_A}'::uuid, '${req}'::uuid, '${intencao}')::text
      FROM cfg;
    `))
    const grupoAprova = await transicao(USER_GA, REQ_PEND, 'aprovar')
    assert.equal(grupoAprova.sucesso, true)
    assert.equal(grupoAprova.status, 'aprovada')
    const antesAprovador = await psql(`SELECT aprovador_usuario_id::text || aprovado_em::text FROM public.est_requisicoes WHERE id = '${REQ_PEND}';`)
    const grupoDeNovo = await transicao(USER_GA, REQ_PEND, 'aprovar')
    assert.equal(grupoDeNovo.sucesso, true)
    assert.equal(grupoDeNovo.idempotente, true)
    assert.equal(await psql(
      `SELECT aprovador_usuario_id::text || aprovado_em::text FROM public.est_requisicoes WHERE id = '${REQ_PEND}';`
    ), antesAprovador)

    const autoOff = await transicao(USER_A, REQ_PLAN, 'liberar_para_baixa')
    assert.equal(autoOff.codigo, 'AUTOATENDIMENTO_DESLIGADO')
    const atlasLiberar = await transicao(USER_A, REQ_ATLAS, 'liberar_para_baixa')
    assert.equal(atlasLiberar.codigo, 'TRANSICAO_INVALIDA')
    await psql(`UPDATE public.est_config SET req_planilha_auto_atender = true WHERE empresa_id = '${EMP_A}';`)
    const liberada = await transicao(USER_A, REQ_PLAN, 'liberar_para_baixa')
    assert.equal(liberada.sucesso, true)
    assert.equal(liberada.status, 'aprovada')
    const liberadaDeNovo = await transicao(USER_A, REQ_PLAN, 'liberar_para_baixa')
    assert.equal(liberadaDeNovo.idempotente, true)

    const cancelada = await transicao(USER_A, REQ_ATLAS, 'cancelar')
    assert.equal(cancelada.sucesso, true)
    const canceladaDeNovo = await transicao(USER_A, REQ_ATLAS, 'cancelar')
    assert.equal(canceladaDeNovo.sucesso, true)
    assert.equal(canceladaDeNovo.idempotente, true)

    await psql(`
      UPDATE public.est_requisicao_itens
      SET quantidade_atendida = 1, quantidade_pendente = 0, status_item = 'atendido'
      WHERE requisicao_id = '${REQ_PLAN}';
    `)
    const atendimento = await transicao(USER_A, REQ_PLAN, 'registrar_atendimento')
    assert.equal(atendimento.sucesso, false)
    assert.equal(atendimento.codigo, 'INTENCAO_INVALIDA')
    assert.equal(await psql(`SELECT status FROM public.est_requisicoes WHERE id = '${REQ_PLAN}';`), 'aprovada')

    await psql(`
      INSERT INTO public.est_requisicoes (
        id, empresa_id, numero, requisitante_pessoa_id, status, origem, aprovacao_resultado
      ) VALUES (
        '${REQ_REJ}', '${EMP_A}', 'REQ-REJ', '${PESSOA}', 'rejeitada', 'manual', 'rejeitada'
      );
    `)
    const rejeitadaDeNovo = await transicao(USER_A, REQ_REJ, 'rejeitar')
    assert.equal(rejeitadaDeNovo.sucesso, true)
    assert.equal(rejeitadaDeNovo.idempotente, true)

    await other.end()
    } finally {
      await client.end().catch(() => {})
      await pgServer.stop().catch(() => {})
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })
})
