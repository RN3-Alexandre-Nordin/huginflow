import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, realpathSync } from 'node:fs'
import { describe, it, before, after } from 'node:test'

const PG_MODULES = realpathSync(process.env.HUGIN_PG_MODULES
  || join(homedir(), 'AppData', 'Local', 'Temp', 'hugin-pgtest', 'node_modules'))

const EMP_A = '11111111-1111-4111-8111-111111111111'
const EMP_B = '22222222-2222-4222-8222-222222222222'
const AUTH_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AUTH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AUTH_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const USER_A = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
const USER_C = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'
const PESSOA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const SKU = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const LOCAL = '88888888-8888-4888-8888-888888888888'
const LOCAL_B = '77777777-7777-4777-8777-777777777777'
const REQ = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd10'
const ITEM = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcd11'
const LOTE = 'abababab-abab-4aba-8aba-ababababab10'
const SERIE = 'abababab-abab-4aba-8aba-ababababab11'
const CARD_A = '12121212-1212-4121-8121-121212121212'
const CARD_A2 = '12121212-1212-4121-8121-121212121214'
const CARD_B = '12121212-1212-4121-8121-121212121213'

let pgServer
let client
let dir
let psql

function atender(uid, req, operacoes) {
  const payload = JSON.stringify(operacoes).replace(/'/g, "''")
  return `
    WITH cfg AS (
      SELECT set_config('hugin.test_uid', '${uid}', true) AS uid
    )
    SELECT est_atender_requisicao(
      '${EMP_A}'::uuid,
      '${req}'::uuid,
      '${payload}'::jsonb
    )::text
    FROM cfg`
}

describe('Integridade do atendimento de requisição', () => {
  before(async () => {
    const embedded = await import(pathToFileURL(join(PG_MODULES, 'embedded-postgres', 'dist', 'index.js')).href)
    const pg = await import(pathToFileURL(join(PG_MODULES, 'pg', 'lib', 'index.js')).href)
    const Client = pg.Client || pg.default?.Client
    dir = await mkdtemp(join(tmpdir(), 'hugin-req-atd-'))
    pgServer = new embedded.default({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port: 55441,
      persistent: false,
      autoRehydrateSymlinks: true,
    })
    await pgServer.initialise()
    await pgServer.start()
    client = new Client({
      host: '127.0.0.1', port: 55441, user: 'postgres', password: 'postgres', database: 'postgres',
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
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('hugin.test_uid', true), '')::uuid $$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('hugin.test_role', true), ''), 'authenticated') $$;
      CREATE TABLE public.usuarios (
        id uuid PRIMARY KEY, auth_user_id uuid, empresa_id uuid,
        role_global text, ativo boolean DEFAULT true, grupo_id uuid
      );
      CREATE TABLE public.grupos_acesso (
        id uuid PRIMARY KEY, empresa_id uuid, is_admin boolean, permissoes jsonb
      );
      CREATE OR REPLACE FUNCTION public.check_permission(slug text, action text)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      CREATE TABLE public.cad_locais_estoque (
        id uuid PRIMARY KEY, empresa_id uuid NOT NULL, ativo boolean DEFAULT true
      );
      CREATE TABLE public.crm_cards (id uuid PRIMARY KEY, empresa_id uuid NOT NULL);
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
      CREATE TABLE public.est_movimentos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid, sku_id uuid, local_id uuid, quantidade numeric,
        requisicao_id uuid, lote_produto_id uuid, serie_id uuid
      );
      CREATE TABLE public.est_saldos (
        empresa_id uuid, sku_id uuid, local_id uuid, quantidade numeric
      );
    `)
    const root = new URL('../../../supabase/migrations/', import.meta.url)
    await psql(readFileSync(new URL('20261116195933_est_criar_requisicao.sql', root), 'utf8'))
    await psql(readFileSync(new URL('20261116200000_est_criar_requisicao_complemento.sql', root), 'utf8'))
    await psql(readFileSync(new URL('20261116200100_est_requisicoes_revoke_delete.sql', root), 'utf8'))
    await psql(`
      CREATE OR REPLACE FUNCTION public.est_registrar_movimento_atomico(
        p_empresa_id uuid, p_tipo text, p_sku_id uuid, p_local_id uuid, p_quantidade numeric,
        p_documento text DEFAULT NULL, p_pessoa_id uuid DEFAULT NULL, p_origem text DEFAULT NULL,
        p_requisicao_id uuid DEFAULT NULL, p_motivo text DEFAULT NULL, p_usuario_id uuid DEFAULT NULL,
        p_permitir_saldo_negativo boolean DEFAULT false,
        p_lote_produto_id uuid DEFAULT NULL, p_serie_id uuid DEFAULT NULL
      ) RETURNS jsonb LANGUAGE plpgsql AS $fn$
      DECLARE v_saldo numeric;
      BEGIN
        IF current_setting('hugin.falha_movimento', true) = '1' THEN
          RAISE EXCEPTION 'SALDO_NEGATIVO';
        END IF;
        IF current_setting('hugin.segurar', true) = '1' THEN
          PERFORM pg_sleep(0.4);
        END IF;
        IF COALESCE(p_permitir_saldo_negativo, false) THEN
          RAISE EXCEPTION 'SALDO_NEGATIVO_NAO_AUTORIZADO';
        END IF;
        SELECT quantidade INTO v_saldo FROM public.est_saldos
        WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id
        FOR UPDATE;
        IF v_saldo IS NULL OR v_saldo < p_quantidade THEN
          RAISE EXCEPTION 'SALDO_NEGATIVO';
        END IF;
        UPDATE public.est_saldos SET quantidade = quantidade - p_quantidade
        WHERE empresa_id = p_empresa_id AND sku_id = p_sku_id AND local_id = p_local_id;
        INSERT INTO public.est_movimentos (
          empresa_id, sku_id, local_id, quantidade, requisicao_id, lote_produto_id, serie_id
        ) VALUES (
          p_empresa_id, p_sku_id, p_local_id, p_quantidade, p_requisicao_id,
          p_lote_produto_id, p_serie_id
        );
        RETURN jsonb_build_object('success', true, 'lote_produto_id', p_lote_produto_id, 'serie_id', p_serie_id);
      END $fn$;

      INSERT INTO public.usuarios (id, auth_user_id, empresa_id, role_global) VALUES
        ('${USER_A}', '${AUTH_A}', '${EMP_A}', 'admin'),
        ('${USER_C}', '${AUTH_C}', '${EMP_A}', 'admin');
      INSERT INTO public.usuarios (id, auth_user_id, empresa_id, role_global)
      VALUES ('${AUTH_B}', '${AUTH_B}', '${EMP_B}', 'admin');
      INSERT INTO public.cad_locais_estoque (id, empresa_id) VALUES
        ('${LOCAL}', '${EMP_A}'), ('${LOCAL_B}', '${EMP_B}');
      INSERT INTO public.crm_cards (id, empresa_id) VALUES
        ('${CARD_A}', '${EMP_A}'), ('${CARD_A2}', '${EMP_A}'), ('${CARD_B}', '${EMP_B}');
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade)
      VALUES ('${EMP_A}', '${SKU}', '${LOCAL}', 100);
      GRANT USAGE ON SCHEMA public TO authenticated;
      GRANT SELECT ON public.est_requisicoes, public.est_requisicao_itens TO authenticated;
      GRANT EXECUTE ON FUNCTION public.est_atender_requisicao(uuid, uuid, jsonb) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.est_transicionar_requisicao(uuid, uuid, text) TO authenticated;
    `)
  })

  after(async () => {
    await client?.end().catch(() => {})
    await pgServer?.stop().catch(() => {})
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  async function seed(pedida = 10, status = 'aprovada') {
    await psql(`
      DELETE FROM public.est_movimentos;
      DELETE FROM public.est_requisicao_itens;
      DELETE FROM public.est_requisicoes;
      UPDATE public.est_saldos SET quantidade = 100
      WHERE empresa_id = '${EMP_A}' AND sku_id = '${SKU}';
      SELECT set_config('hugin.falha_movimento', '', false);
      SELECT set_config('hugin.falha_item', '', false);
      SELECT set_config('hugin.segurar', '', false);
      INSERT INTO public.est_requisicoes (
        id, empresa_id, numero, requisitante_pessoa_id, status, origem
      ) VALUES (
        '${REQ}', '${EMP_A}', 'REQ-ATD', '${PESSOA}', '${status}', 'manual'
      );
      INSERT INTO public.est_requisicao_itens (
        id, empresa_id, requisicao_id, sku_id, quantidade_pedida,
        quantidade_atendida, quantidade_pendente, local_id, status_item
      ) VALUES (
        '${ITEM}', '${EMP_A}', '${REQ}', '${SKU}', ${pedida}, 0, ${pedida}, '${LOCAL}', 'pendente'
      );
    `)
  }

  async function comoAuthenticated(sql) {
    await client.query('SET ROLE authenticated')
    try {
      return await client.query(sql)
    } finally {
      await client.query('RESET ROLE')
    }
  }

  it('bloqueia UPDATE direto de quantidade, status e DELETE', async () => {
    await seed()
    await assert.rejects(
      () => comoAuthenticated(`UPDATE public.est_requisicao_itens SET quantidade_atendida = 1 WHERE id = '${ITEM}'`),
      /42501|permission denied/
    )
    await assert.rejects(
      () => comoAuthenticated(`UPDATE public.est_requisicao_itens SET quantidade_pendente = 0 WHERE id = '${ITEM}'`),
      /42501|permission denied/
    )
    await assert.rejects(
      () => comoAuthenticated(`UPDATE public.est_requisicao_itens SET status_item = 'atendido' WHERE id = '${ITEM}'`),
      /42501|permission denied/
    )
    await assert.rejects(
      () => comoAuthenticated(`DELETE FROM public.est_requisicao_itens WHERE id = '${ITEM}'`),
      /42501|permission denied/
    )
    await assert.rejects(
      () => comoAuthenticated(`DELETE FROM public.est_requisicoes WHERE id = '${REQ}'`),
      /42501|permission denied/
    )
    const leitura = await comoAuthenticated(`SELECT count(*)::text AS n FROM public.est_requisicoes WHERE id = '${REQ}'`)
    assert.equal(leitura.rows[0].n, '1')
    const cols = await psql(`
      SELECT COALESCE(string_agg(column_name || ':' || privilege_type, ',' ORDER BY column_name), '')
      FROM information_schema.column_privileges
      WHERE grantee = 'authenticated'
        AND table_name = 'est_requisicao_itens'
        AND privilege_type = 'UPDATE'
        AND column_name IN ('quantidade_atendida', 'quantidade_pendente', 'status_item', 'local_id')
    `)
    assert.equal(cols, '')
  })

  it('atende parcialmente e depois o restante, sem passar da quantidade pendente', async () => {
    await seed(10)
    const parcial = JSON.parse(await psql(atender(AUTH_A, REQ, [{
      item_id: ITEM, acao: 'atender', local_id: LOCAL,
      movimentos: [{ quantidade: 4, lote_produto_id: LOTE, serie_id: SERIE }],
    }])))
    assert.equal(parcial.sucesso, true)
    assert.equal(parcial.status, 'atendida_parcial')
    assert.equal(await psql(`SELECT quantidade_atendida::float8::text || '/' || quantidade_pendente::float8::text || '/' || status_item FROM public.est_requisicao_itens WHERE id = '${ITEM}'`), '4/6/parcial')
    assert.equal(await psql(`SELECT lote_produto_id::text || '/' || serie_id::text FROM public.est_movimentos`), `${LOTE}/${SERIE}`)
    assert.equal(await psql(`SELECT quantidade::text FROM public.est_saldos WHERE sku_id = '${SKU}'`), '96')

    const acima = psql(atender(AUTH_A, REQ, [{
      item_id: ITEM, acao: 'atender', local_id: LOCAL,
      movimentos: [{ quantidade: 7 }],
    }]))
    await assert.rejects(acima, /QUANTIDADE_ACIMA_PENDENTE/)
    assert.equal(await psql(`SELECT quantidade_atendida::float8::text FROM public.est_requisicao_itens WHERE id = '${ITEM}'`), '4')
    assert.equal(await psql(`SELECT count(*) FROM public.est_movimentos`), '1')

    await assert.rejects(
      () => psql(atender(AUTH_A, REQ, [{
        item_id: ITEM, acao: 'atender', local_id: LOCAL_B,
        movimentos: [{ quantidade: 6 }],
      }])),
      /LOCAL_INVALIDO/
    )
    assert.equal(await psql(`SELECT local_id FROM public.est_requisicao_itens WHERE id = '${ITEM}'`), LOCAL)

    const fecha = JSON.parse(await psql(atender(AUTH_A, REQ, [{
      item_id: ITEM, acao: 'atender', local_id: LOCAL,
      movimentos: [{ quantidade: 6 }],
    }])))
    assert.equal(fecha.sucesso, true)
    assert.equal(fecha.status, 'atendida_total')
    assert.equal(await psql(`SELECT local_id FROM public.est_requisicao_itens WHERE id = '${ITEM}'`), LOCAL)
    assert.equal(await psql(`SELECT quantidade::text FROM public.est_saldos WHERE sku_id = '${SKU}'`), '90')
  })

  it('desfaz movimento e item quando a baixa ou a atualização falha', async () => {
    await seed(5)
    await psql(`SELECT set_config('hugin.falha_movimento', '1', false)`)
    await assert.rejects(
      () => psql(atender(AUTH_A, REQ, [{
        item_id: ITEM, acao: 'atender', local_id: LOCAL,
        movimentos: [{ quantidade: 5 }],
      }])),
      /SALDO_NEGATIVO/
    )
    assert.equal(await psql(`SELECT quantidade_atendida::float8::text FROM public.est_requisicao_itens WHERE id = '${ITEM}'`), '0')
    assert.equal(await psql(`SELECT count(*) FROM public.est_movimentos`), '0')
    assert.equal(await psql(`SELECT quantidade::text FROM public.est_saldos WHERE sku_id = '${SKU}'`), '100')
    assert.equal(await psql(`SELECT status FROM public.est_requisicoes WHERE id = '${REQ}'`), 'aprovada')

    await psql(`
      SELECT set_config('hugin.falha_movimento', '', false);
      CREATE OR REPLACE FUNCTION public.est_teste_falha_item() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF current_setting('hugin.falha_item', true) = '1'
           AND NEW.quantidade_atendida IS DISTINCT FROM OLD.quantidade_atendida THEN
          RAISE EXCEPTION 'falha item';
        END IF;
        RETURN NEW;
      END $fn$;
      DROP TRIGGER IF EXISTS est_teste_falha_item ON public.est_requisicao_itens;
      CREATE TRIGGER est_teste_falha_item
        BEFORE UPDATE ON public.est_requisicao_itens
        FOR EACH ROW EXECUTE FUNCTION public.est_teste_falha_item();
      SELECT set_config('hugin.falha_item', '1', false);
    `)
    await assert.rejects(
      () => psql(atender(AUTH_A, REQ, [{
        item_id: ITEM, acao: 'atender', local_id: LOCAL,
        movimentos: [{ quantidade: 2 }],
      }])),
      /falha item/
    )
    assert.equal(await psql(`SELECT quantidade_atendida::float8::text FROM public.est_requisicao_itens WHERE id = '${ITEM}'`), '0')
    assert.equal(await psql(`SELECT count(*) FROM public.est_movimentos`), '0')
    assert.equal(await psql(`SELECT quantidade::text FROM public.est_saldos WHERE sku_id = '${SKU}'`), '100')
    await psql(`
      SELECT set_config('hugin.falha_item', '', false);
      DROP TRIGGER est_teste_falha_item ON public.est_requisicao_itens;
    `)
  })

  it('serializa dois atendimentos simultâneos da mesma requisição', async () => {
    await seed(4)
    const embedded = await import(pathToFileURL(join(PG_MODULES, 'pg', 'lib', 'index.js')).href)
    const Client = embedded.Client || embedded.default?.Client
    const other = new Client({
      host: '127.0.0.1', port: 55441, user: 'postgres', password: 'postgres', database: 'postgres',
    })
    await other.connect()
    await client.query(`SELECT set_config('hugin.segurar', '1', false)`)
    await other.query(`SELECT set_config('hugin.segurar', '1', false)`)
    const chamada = (db, uid) => db.query(atender(uid, REQ, [{
      item_id: ITEM, acao: 'atender', local_id: LOCAL,
      movimentos: [{ quantidade: 4 }],
    }]))
    const resultados = await Promise.allSettled([
      chamada(client, AUTH_A),
      chamada(other, AUTH_C),
    ])
    await other.end()
    assert.equal(resultados.every((r) => r.status === 'fulfilled'), true)
    const corpos = resultados.map((r) => JSON.parse(Object.values(r.value.rows[0])[0]))
    const aceitos = corpos.filter((c) => c.sucesso)
    const recusados = corpos.filter((c) => !c.sucesso)
    assert.equal(aceitos.length, 1)
    assert.equal(recusados.length, 1)
    assert.equal(recusados[0].codigo, 'TRANSICAO_INVALIDA')
    assert.equal(await psql(`SELECT quantidade_atendida::float8::text FROM public.est_requisicao_itens WHERE id = '${ITEM}'`), '4')
    assert.equal(await psql(`SELECT count(*) FROM public.est_movimentos`), '1')
    assert.equal(await psql(`SELECT status FROM public.est_requisicoes WHERE id = '${REQ}'`), 'atendida_total')
  })

  it('bloqueia outra empresa, card de outro tenant e intenção nula', async () => {
    await seed(1)
    const outra = JSON.parse(await psql(`
      WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_B}', true) AS uid)
      SELECT est_atender_requisicao('${EMP_A}'::uuid, '${REQ}'::uuid,
        jsonb_build_array(jsonb_build_object(
          'item_id', '${ITEM}', 'acao', 'atender', 'local_id', '${LOCAL}',
          'movimentos', jsonb_build_array(jsonb_build_object('quantidade', 1))
        ))
      )::text FROM cfg
    `))
    assert.equal(outra.codigo, 'ACESSO_NEGADO')
    assert.equal(await psql(`SELECT count(*) FROM public.est_movimentos`), '0')

    await assert.rejects(
      () => psql(`UPDATE public.est_requisicoes SET workflow_card_id = '${CARD_B}' WHERE id = '${REQ}'`),
      /WORKFLOW_CARD_INVALIDO/
    )
    await psql(`UPDATE public.est_requisicoes SET workflow_card_id = '${CARD_A}' WHERE id = '${REQ}'`)
    await assert.rejects(
      () => psql(`UPDATE public.est_requisicoes SET workflow_card_id = '${CARD_A2}' WHERE id = '${REQ}'`),
      /WORKFLOW_CARD_IMUTAVEL/
    )

    const nula = JSON.parse(await psql(`
      WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true) AS uid)
      SELECT est_transicionar_requisicao('${EMP_A}'::uuid, '${REQ}'::uuid, NULL)::text FROM cfg
    `))
    assert.equal(nula.codigo, 'INTENCAO_INVALIDA')

    await assert.rejects(
      () => psql(atender(AUTH_A, REQ, [{
        item_id: ITEM, acao: 'atender', local_id: LOCAL, movimentos: [],
      }])),
      /MOVIMENTO_OBRIGATORIO/
    )
    assert.equal(await psql(`SELECT quantidade_atendida::float8::text FROM public.est_requisicao_itens WHERE id = '${ITEM}'`), '0')
  })
})
