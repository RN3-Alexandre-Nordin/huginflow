import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, realpathSync } from 'node:fs'
import { describe, it, before, after } from 'node:test'

/**
 * Atomicidade exercitada em Postgres embutido, com est_registrar_movimento_atomico
 * substituída por uma função de teste que grava saldo e movimento de verdade.
 * Isso prova o rollback da RPC. Não prova as regras internas da função real de estoque.
 */
const PENDENTE_SUPABASE_DEV = [
  'Aplicar a migration e repetir o fechamento contra est_registrar_movimento_atomico real (saldo, Kardex, lote e série).',
  'Conferir o formato do erro no PostgREST e o espelhamento com_espelhar_funil_pedido depois do commit.',
  'Inserir um lote pelo cliente Supabase real e conferir o ENT- atribuído pelo trigger.',
  'Aplicar a migration onde já existam ENT- duplicados: o índice deve interromper a migration.',
  'RLS e papéis anon/authenticated/service_role no projeto DEV, não só no catálogo local.',
]

const PG_MODULES = realpathSync(process.env.HUGIN_PG_MODULES
  || join(homedir(), 'AppData', 'Local', 'Temp', 'hugin-pgtest', 'node_modules'))

const EMP_A = '11111111-1111-4111-8111-111111111111'
const EMP_B = '22222222-2222-4222-8222-222222222222'
const AUTH_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AUTH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AUTH_SEM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const USER_A = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
const USER_B = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'
const USER_SEM = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'
const FORN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const FORN_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02'
const FORN_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddd0b'
const AUTH_OP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const USER_OP = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'
const GRUPO_OP = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2'
const SKU = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const SKU_LOTE = 'ffffffff-ffff-4fff-8fff-ffffffffff01'
const LOCAL = '88888888-8888-4888-8888-888888888888'
const LOCAL_B = '77777777-7777-4777-8777-777777777777'
const PEDIDO = '12121212-1212-4121-8121-121212121212'
const ITEM = '12121212-1212-4121-8121-121212121213'
const PEDIDO_B = '12121212-1212-4121-8121-121212121214'

const root = new URL('../../../', import.meta.url)
const migration = readFileSync(new URL('supabase/migrations/20261117183000_com_recebimento_importado_atomico.sql', root), 'utf8')
const actions = readFileSync(new URL('src/app/(app)/cockpit/compras/importados/actions.ts', root), 'utf8')
const entrada = readFileSync(new URL('src/lib/estoque/processar-entrada.ts', root), 'utf8')

let pgServer
let client
let dir

function sqlValor(rows) {
  const row = rows?.[0]
  if (!row) return ''
  const value = Object.values(row)[0]
  return value == null ? '' : String(value)
}

describe('Recebimento de importados — contrato e Postgres', () => {
  before(async () => {
    const embedded = await import(pathToFileURL(join(PG_MODULES, 'embedded-postgres', 'dist', 'index.js')).href)
    const pg = await import(pathToFileURL(join(PG_MODULES, 'pg', 'lib', 'index.js')).href)
    const Client = pg.Client || pg.default?.Client
    dir = await mkdtemp(join(tmpdir(), 'hugin-importado-'))
    pgServer = new embedded.default({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port: 55487,
      persistent: false,
      autoRehydrateSymlinks: true,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
    })
    await pgServer.initialise()
    await pgServer.start()
    client = new Client({
      host: '127.0.0.1', port: 55487, user: 'postgres', password: 'postgres', database: 'postgres',
    })
    await client.connect()
    await client.query(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('hugin.test_uid', true), '')::uuid $$;
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
      CREATE TABLE public.addon_registry (codigo text PRIMARY KEY, ativo boolean NOT NULL);
      CREATE TABLE public.empresa_addons (
        empresa_id uuid, addon_codigo text, enabled boolean, commercial_status text,
        starts_at timestamptz, ends_at timestamptz
      );
      CREATE TABLE public.com_config (
        empresa_id uuid PRIMARY KEY, recebimento_importados boolean, importados_limpeza text
      );
      CREATE TABLE public.com_pedidos (
        id uuid PRIMARY KEY, empresa_id uuid NOT NULL, status text NOT NULL,
        codigo_fornecedor text, fornecedor_id uuid, numero text
      );
      CREATE TABLE public.com_pedido_itens (
        id uuid PRIMARY KEY, empresa_id uuid NOT NULL, pedido_id uuid NOT NULL,
        quantidade numeric NOT NULL, sku_id uuid, unidade text, descricao text
      );
      CREATE TABLE public.cad_skus (
        id uuid PRIMARY KEY, empresa_id uuid NOT NULL, codigo text NOT NULL,
        codigo_barras text, unidade_estoque text, ativo boolean DEFAULT true,
        controla_lote boolean DEFAULT false, controla_serie boolean DEFAULT false
      );
      CREATE TABLE public.cad_sku_unidade_conversao (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
        sku_id uuid, unidade_origem text NOT NULL, unidade_destino text NOT NULL,
        fator_conversao numeric NOT NULL
      );
      CREATE TABLE public.cad_sku_depara (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
        sku_id uuid NOT NULL, pessoa_id uuid NOT NULL, codigo_parceiro text NOT NULL,
        observacao text, ativo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.crm_leads (
        id uuid PRIMARY KEY, empresa_id uuid NOT NULL, nome text
      );
      CREATE TABLE public.cad_locais_estoque (
        id uuid PRIMARY KEY, empresa_id uuid NOT NULL
      );
      CREATE TABLE public.com_recebimentos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
        pedido_id uuid NOT NULL, usuario_id uuid, observacao text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.com_recebimento_itens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
        recebimento_id uuid NOT NULL, pedido_item_id uuid NOT NULL,
        quantidade numeric NOT NULL, divergencia_quantidade numeric, divergencia_preco numeric
      );
      CREATE TABLE public.com_importado_leituras (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
        pedido_id uuid NOT NULL, pedido_item_id uuid NOT NULL, recebimento_id uuid,
        codigo_lido text NOT NULL, codigo_normalizado text NOT NULL,
        quantidade numeric NOT NULL, local_id uuid, local_temporario text, limpeza text,
        imprimiu_etiqueta boolean NOT NULL DEFAULT false, alocado_em timestamptz,
        usuario_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT destino_check CHECK (
          (local_id IS NOT NULL AND local_temporario IS NULL)
          OR (local_id IS NULL AND local_temporario IS NOT NULL)
        )
      );
      CREATE TABLE public.est_movimentos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid, sku_id uuid,
        local_id uuid, quantidade numeric, lote_entrada_id uuid, tipo text
      );
      CREATE TABLE public.est_entrada_lotes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
        numero text NOT NULL, origem text NOT NULL, status text NOT NULL,
        pessoa_id uuid, local_id uuid NOT NULL, documento text, observacao text,
        usuario_id uuid, movimento_em timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.est_entrada_itens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
        lote_id uuid NOT NULL, linha integer NOT NULL, sku_id uuid,
        unidade_origem text NOT NULL, quantidade_origem numeric NOT NULL,
        unidade_estoque text, quantidade_estoque numeric, fator_conversao numeric,
        status text NOT NULL DEFAULT 'ok', movimento_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.est_saldos (
        empresa_id uuid, sku_id uuid, local_id uuid, quantidade numeric,
        PRIMARY KEY (empresa_id, sku_id, local_id)
      );
    `)
    await client.query(migration)
    await client.query(`
      CREATE OR REPLACE FUNCTION public.est_registrar_movimento_atomico(
        p_empresa_id uuid, p_tipo text, p_sku_id uuid, p_local_id uuid, p_quantidade numeric,
        p_documento text DEFAULT NULL, p_pessoa_id uuid DEFAULT NULL, p_origem text DEFAULT NULL,
        p_lote_entrada_id uuid DEFAULT NULL, p_motivo text DEFAULT NULL, p_usuario_id uuid DEFAULT NULL,
        p_permitir_saldo_negativo boolean DEFAULT false, p_lote_produto_id uuid DEFAULT NULL,
        p_numero_serie text DEFAULT NULL
      ) RETURNS jsonb LANGUAGE plpgsql AS $fn$
      DECLARE
        v_n integer;
        v_id uuid;
      BEGIN
        v_n := COALESCE(NULLIF(current_setting('hugin.mov_n', true), ''), '0')::int + 1;
        PERFORM set_config('hugin.mov_n', v_n::text, true);
        IF current_setting('hugin.segurar', true) = '1' THEN
          PERFORM pg_sleep(0.4);
        END IF;
        IF NULLIF(current_setting('hugin.falha_no', true), '')::int = v_n THEN
          RAISE EXCEPTION 'SALDO_RECUSADO';
        END IF;
        IF current_setting('hugin.movimento_falso', true) = '1' THEN
          RETURN jsonb_build_object('success', true);
        END IF;
        IF current_setting('hugin.success_falso', true) = '1' THEN
          RETURN jsonb_build_object('success', false, 'movimento_id', gen_random_uuid(),
            'empresa_id', p_empresa_id, 'sku_id', p_sku_id);
        END IF;
        INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade)
        VALUES (p_empresa_id, p_sku_id, p_local_id, p_quantidade)
        ON CONFLICT (empresa_id, sku_id, local_id)
        DO UPDATE SET quantidade = public.est_saldos.quantidade + EXCLUDED.quantidade;
        INSERT INTO public.est_movimentos (empresa_id, sku_id, local_id, quantidade, lote_entrada_id, tipo)
        VALUES (
          CASE WHEN current_setting('hugin.empresa_errada', true) = '1' THEN '${EMP_B}' ELSE p_empresa_id END,
          p_sku_id, p_local_id, p_quantidade, p_lote_entrada_id, 'entrada'
        )
        RETURNING id INTO v_id;
        RETURN jsonb_build_object(
          'success', true,
          'movimento_id', v_id,
          'empresa_id', CASE WHEN current_setting('hugin.empresa_errada', true) = '1' THEN '${EMP_B}' ELSE p_empresa_id END,
          'sku_id', p_sku_id,
          'lote_produto_id', NULL,
          'serie_id', NULL
        );
      END $fn$;

      INSERT INTO public.addon_registry (codigo, ativo) VALUES ('compras', true);
      INSERT INTO public.empresa_addons (empresa_id, addon_codigo, enabled, commercial_status)
      VALUES ('${EMP_A}', 'compras', true, 'active'), ('${EMP_B}', 'compras', true, 'active');
      INSERT INTO public.com_config (empresa_id, recebimento_importados, importados_limpeza)
      VALUES ('${EMP_A}', true, 'baixa_manual'), ('${EMP_B}', true, 'baixa_manual');
      INSERT INTO public.usuarios (id, auth_user_id, empresa_id, role_global) VALUES
        ('${USER_A}', '${AUTH_A}', '${EMP_A}', 'admin'),
        ('${USER_B}', '${AUTH_B}', '${EMP_B}', 'admin');
      INSERT INTO public.grupos_acesso (id, empresa_id, is_admin, permissoes)
      VALUES ('${USER_SEM}', '${EMP_A}', false, '{}'::jsonb);
      INSERT INTO public.usuarios (id, auth_user_id, empresa_id, role_global, grupo_id)
      VALUES ('${USER_SEM}', '${AUTH_SEM}', '${EMP_A}', 'operador', '${USER_SEM}');
      INSERT INTO public.grupos_acesso (id, empresa_id, is_admin, permissoes)
      VALUES ('${GRUPO_OP}', '${EMP_A}', false, '{"compras_conferencia":["create"]}'::jsonb);
      INSERT INTO public.usuarios (id, auth_user_id, empresa_id, role_global, grupo_id)
      VALUES ('${USER_OP}', '${AUTH_OP}', '${EMP_A}', 'operador', '${GRUPO_OP}');
      INSERT INTO public.crm_leads (id, empresa_id, nome) VALUES
        ('${FORN}', '${EMP_A}', 'Importador A'),
        ('${FORN_2}', '${EMP_A}', 'Importador B'),
        ('${FORN_B}', '${EMP_B}', 'Importador de outra empresa');
      INSERT INTO public.cad_skus (id, empresa_id, codigo, unidade_estoque) VALUES
        ('${SKU}', '${EMP_A}', '1625005540', 'UN'), ('${SKU_LOTE}', '${EMP_A}', 'LOTE-1', 'UN');
      UPDATE public.cad_skus SET controla_lote = true WHERE id = '${SKU_LOTE}';
      INSERT INTO public.cad_locais_estoque (id, empresa_id) VALUES
        ('${LOCAL}', '${EMP_A}'), ('${LOCAL_B}', '${EMP_B}');
      INSERT INTO public.est_saldos (empresa_id, sku_id, local_id, quantidade)
      VALUES ('${EMP_A}', '${SKU}', '${LOCAL}', 0);
    `)
  })

  after(async () => {
    await client?.end().catch(() => {})
    await pgServer?.stop().catch(() => {})
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  async function limpar(qtd = 10, sku = SKU) {
    await client.query(`
      SELECT set_config('hugin.falha_no', '', false);
      SELECT set_config('hugin.segurar', '', false);
      SELECT set_config('hugin.movimento_falso', '', false);
      SELECT set_config('hugin.success_falso', '', false);
      SELECT set_config('hugin.empresa_errada', '', false);
      SELECT set_config('hugin.falha_leitura', '', false);
      DELETE FROM public.cad_sku_depara;
      DELETE FROM public.cad_sku_unidade_conversao;
      DELETE FROM public.com_importado_leituras;
      DELETE FROM public.com_recebimento_itens;
      DELETE FROM public.com_recebimentos;
      DELETE FROM public.est_entrada_itens;
      DELETE FROM public.est_entrada_lotes;
      DELETE FROM public.est_movimentos;
      DELETE FROM public.com_pedido_itens;
      DELETE FROM public.com_pedidos;
      UPDATE public.cad_skus SET unidade_estoque = 'UN' WHERE id IN ('${SKU}', '${SKU_LOTE}');
      UPDATE public.est_saldos SET quantidade = 0
      WHERE empresa_id = '${EMP_A}' AND sku_id = '${SKU}';
      INSERT INTO public.com_pedidos (id, empresa_id, status, codigo_fornecedor, fornecedor_id, numero)
      VALUES ('${PEDIDO}', '${EMP_A}', 'aprovado', 'CX-1', '${FORN}', 'PC-1');
      INSERT INTO public.com_pedido_itens (id, empresa_id, pedido_id, quantidade, sku_id, unidade, descricao)
      VALUES ('${ITEM}', '${EMP_A}', '${PEDIDO}', ${qtd}, '${sku}', 'UN', '1625005540');
    `)
  }

  async function confirmar(qtd, uid = AUTH_A, pedido = PEDIDO, item = ITEM, local = LOCAL, codigo = '1625005540') {
    return client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', $1, true))
       SELECT public.com_confirmar_leitura_importada(
         $2::uuid, $3::uuid, $4, $5::numeric, $6::uuid, NULL, 'sku'
       ) AS res
       FROM cfg`,
      [uid, pedido, item, codigo, qtd, local],
    )
  }

  async function fechar(uid = AUTH_A, pedido = PEDIDO) {
    const result = await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', $1, true))
       SELECT public.com_fechar_recebimento_importado($2::uuid) AS res
       FROM cfg`,
      [uid, pedido],
    )
    return result.rows[0].res
  }

  async function contagens() {
    const { rows } = await client.query(`
      SELECT
        (SELECT count(*) FROM public.com_recebimentos) AS rec,
        (SELECT count(*) FROM public.com_recebimento_itens) AS itens,
        (SELECT count(*) FROM public.com_importado_leituras) AS leituras,
        (SELECT count(*) FROM public.com_importado_leituras WHERE alocado_em IS NOT NULL) AS alocadas,
        (SELECT count(*) FROM public.com_importado_leituras WHERE movimento_id IS NOT NULL) AS com_movimento,
        (SELECT count(*) FROM public.est_entrada_lotes) AS lotes,
        (SELECT count(*) FROM public.est_movimentos) AS movimentos,
        (SELECT quantidade FROM public.est_saldos WHERE sku_id = '${SKU}' AND local_id = '${LOCAL}') AS saldo,
        (SELECT status FROM public.com_pedidos WHERE id = '${PEDIDO}') AS status
    `)
    return rows[0]
  }

  it('a action deixa de gravar as três tabelas e não chama processarLoteEntrada', () => {
    assert.match(actions, /com_confirmar_leitura_importada/)
    assert.match(actions, /com_fechar_recebimento_importado/)
    assert.equal(actions.includes('processarLoteEntrada'), false)
    assert.equal(actions.includes(".from('com_recebimentos')"), false)
    assert.equal(actions.includes(".from('com_importado_leituras')"), false)
    assert.equal(entrada.includes('gerarNumeroEntrada'), false)
    assert.equal(entrada.includes('est_proximo_numero_entrada'), false)
    assert.match(entrada, /select\('id, numero'\)/)
    assert.match(entrada, /export async function processarLoteEntrada/)
    assert.equal(entrada.includes(".ilike('numero'"), false)
    assert.equal(actions.includes(".from('com_recebimento_itens').insert"), false)
    assert.match(migration, /INTO STRICT/)
    assert.match(migration, /com_importado_leituras_movimento_uq/)
    assert.match(migration, /pg_advisory_xact_lock/)
    assert.match(migration, /est_entrada_lotes_atribuir_numero/)
    assert.equal(migration.includes('est_proximo_numero_entrada'), false)
    assert.match(migration, /Conversão no fechamento/)
    assert.equal(actions.includes('p_codigo_normalizado'), false)
    assert.equal(actions.includes('.limit(20)'), false)
    assert.match(migration, /est_registrar_movimento_atomico/)
    assert.equal(migration.includes('processarLoteEntrada'), false)
    assert.match(migration, /recebimento comum/)
  })

  it('separa o que este arquivo executa do que fica para o DEV', () => {
    assert.equal(PENDENTE_SUPABASE_DEV.length, 5)
  })

  it('conferência normal grava recebimento, item e leitura juntos', async () => {
    await limpar()
    const gravado = await confirmar(2)
    const res = gravado.rows[0].res
    assert.equal(res.ok, true)
    assert.equal(res.codigo, '1625005540')
    const c = await contagens()
    assert.equal(Number(c.rec), 1)
    assert.equal(Number(c.itens), 1)
    assert.equal(Number(c.leituras), 1)
    assert.equal(Number(c.alocadas), 0)
  })

  it('conferências simultâneas não passam da quantidade do item', async () => {
    await limpar(5)
    await client.query(`
      CREATE OR REPLACE FUNCTION public.hugin_segura_recebimento() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        IF current_setting('hugin.segurar', true) = '1' THEN
          PERFORM pg_sleep(0.4);
        END IF;
        RETURN NEW;
      END $fn$;
      DROP TRIGGER IF EXISTS hugin_segura_recebimento ON public.com_recebimentos;
      CREATE TRIGGER hugin_segura_recebimento
      AFTER INSERT ON public.com_recebimentos
      FOR EACH ROW EXECUTE FUNCTION public.hugin_segura_recebimento();
    `)
    const pg = await import(pathToFileURL(join(PG_MODULES, 'pg', 'lib', 'index.js')).href)
    const Client = pg.Client || pg.default?.Client
    const a = new Client({ host: '127.0.0.1', port: 55487, user: 'postgres', password: 'postgres', database: 'postgres' })
    const b = new Client({ host: '127.0.0.1', port: 55487, user: 'postgres', password: 'postgres', database: 'postgres' })
    await a.connect()
    await b.connect()
    await a.query(`SELECT set_config('hugin.segurar', '1', false)`)
    await b.query(`SELECT set_config('hugin.segurar', '1', false)`)
    const chamada = (conexao) => conexao.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_confirmar_leitura_importada(
         '${PEDIDO}'::uuid, '${ITEM}'::uuid, '1625005540', 4, '${LOCAL}'::uuid, NULL, 'sku'
       ) AS res
       FROM cfg`,
    )
    const resultados = await Promise.allSettled([chamada(a), chamada(b)])
    await a.end()
    await b.end()
    await client.query(`SELECT set_config('hugin.segurar', '', false)`)
    const ok = resultados.filter((r) => r.status === 'fulfilled').length
    const erro = resultados.filter((r) => r.status === 'rejected').length
    assert.equal(ok, 1)
    assert.equal(erro, 1)
    const c = await contagens()
    assert.equal(Number(c.itens), 1)
    assert.equal(Number(c.leituras), 1)
  })

  it('falha na leitura desfaz recebimento e item', async () => {
    await limpar()
    await client.query(`
      CREATE OR REPLACE FUNCTION public.hugin_falha_leitura() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        IF current_setting('hugin.falha_leitura', true) = '1' THEN
          RAISE EXCEPTION 'falha entre gravacoes';
        END IF;
        RETURN NEW;
      END $fn$;
      DROP TRIGGER IF EXISTS hugin_falha_leitura ON public.com_importado_leituras;
      CREATE TRIGGER hugin_falha_leitura
      BEFORE INSERT ON public.com_importado_leituras
      FOR EACH ROW EXECUTE FUNCTION public.hugin_falha_leitura();
    `)
    await client.query(`SELECT set_config('hugin.falha_leitura', '1', false)`)
    await assert.rejects(() => confirmar(1), /falha entre gravacoes/)
    await client.query(`SELECT set_config('hugin.falha_leitura', '', false)`)
    const c = await contagens()
    assert.equal(Number(c.rec), 0)
    assert.equal(Number(c.itens), 0)
    assert.equal(Number(c.leituras), 0)
  })

  it('fechamento normal cria ENT-, movimento e marca a leitura', async () => {
    await limpar()
    await confirmar(10)
    const res = await fechar()
    assert.equal(res.ok, true)
    assert.equal(res.fechou, true)
    assert.equal(res.idempotente, false)
    assert.equal(res.entradas.length, 1)
    assert.match(res.entradas[0], /^ENT-\d{8}-\d{4}$/)
    const c = await contagens()
    assert.equal(c.status, 'recebido')
    assert.equal(Number(c.saldo), 10)
    assert.equal(Number(c.movimentos), 1)
    assert.equal(Number(c.lotes), 1)
    assert.equal(Number(c.alocadas), 1)
    assert.equal(Number(c.com_movimento), 1)
  })

  it('repetir o fechamento não cria outro movimento', async () => {
    await limpar()
    await confirmar(10)
    await fechar()
    const deNovo = await fechar()
    assert.equal(deNovo.idempotente, true)
    assert.deepEqual(deNovo.entradas, [])
    const c = await contagens()
    assert.equal(Number(c.movimentos), 1)
    assert.equal(Number(c.lotes), 1)
    assert.equal(Number(c.saldo), 10)
    assert.equal(c.status, 'recebido')
  })

  it('fechamentos simultâneos movimentam a leitura uma vez', async () => {
    await limpar()
    await confirmar(10)
    const pg = await import(pathToFileURL(join(PG_MODULES, 'pg', 'lib', 'index.js')).href)
    const Client = pg.Client || pg.default?.Client
    const a = new Client({ host: '127.0.0.1', port: 55487, user: 'postgres', password: 'postgres', database: 'postgres' })
    const b = new Client({ host: '127.0.0.1', port: 55487, user: 'postgres', password: 'postgres', database: 'postgres' })
    await a.connect()
    await b.connect()
    await a.query(`SELECT set_config('hugin.segurar', '1', false)`)
    await b.query(`SELECT set_config('hugin.segurar', '1', false)`)
    const chamada = (conexao) => conexao.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_fechar_recebimento_importado('${PEDIDO}'::uuid) AS res
       FROM cfg`,
    )
    const resultados = await Promise.allSettled([chamada(a), chamada(b)])
    await a.end()
    await b.end()
    await client.query(`SELECT set_config('hugin.segurar', '', false)`)
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 2)
    const c = await contagens()
    assert.equal(Number(c.movimentos), 1)
    assert.equal(Number(c.saldo), 10)
    assert.equal(Number(c.alocadas), 1)
  })

  it('falha no movimento desfaz saldo, Kardex, lote, leitura e status', async () => {
    await limpar(2)
    await confirmar(1)
    await confirmar(1)
    await client.query(`SELECT set_config('hugin.falha_no', '2', false)`)
    await assert.rejects(() => fechar(), /SALDO_RECUSADO|cancelado|Movimento/)
    await client.query(`SELECT set_config('hugin.falha_no', '', false)`)
    const c = await contagens()
    assert.equal(Number(c.saldo), 0)
    assert.equal(Number(c.movimentos), 0)
    assert.equal(Number(c.lotes), 0)
    assert.equal(Number(c.alocadas), 0)
    assert.equal(Number(c.com_movimento), 0)
    assert.equal(c.status, 'aprovado')
    assert.equal(Number(c.leituras), 2)
  })

  it('retorno sem movimento confirmado não aloca a leitura', async () => {
    await limpar()
    await confirmar(1)
    await client.query(`SELECT set_config('hugin.movimento_falso', '1', false)`)
    await assert.rejects(() => fechar(), /não confirmado/)
    await client.query(`SELECT set_config('hugin.movimento_falso', '', false)`)
    await client.query(`SELECT set_config('hugin.success_falso', '1', false)`)
    await assert.rejects(() => fechar(), /não confirmado/)
    const c = await contagens()
    assert.equal(Number(c.alocadas), 0)
    assert.equal(Number(c.movimentos), 0)
    assert.equal(c.status, 'aprovado')
  })

  it('recebimento parcial muda o status e o segundo fechamento não movimenta de novo', async () => {
    await limpar(10)
    await confirmar(4)
    const res = await fechar()
    assert.equal(res.fechou, false)
    assert.equal((await contagens()).status, 'recebido_parcial')
    const deNovo = await fechar()
    assert.equal(deNovo.idempotente, true)
    const c = await contagens()
    assert.equal(Number(c.saldo), 4)
    assert.equal(Number(c.movimentos), 1)
  })

  it('usuário sem permissão e de outra empresa não gravam', async () => {
    await limpar()
    await assert.rejects(() => confirmar(1, AUTH_SEM), /Sem permissão/)
    await client.query(`
      INSERT INTO public.com_pedidos (id, empresa_id, status, numero, fornecedor_id)
      VALUES ('${PEDIDO_B}', '${EMP_B}', 'aprovado', 'PC-B', '${FORN}')
    `)
    await assert.rejects(
      () => confirmar(1, AUTH_A, PEDIDO_B, ITEM, LOCAL),
      /Pedido não encontrado/,
    )
    await assert.rejects(() => fechar(AUTH_B, PEDIDO), /Pedido não encontrado/)
    const c = await contagens()
    assert.equal(Number(c.rec), 0)
    assert.equal(Number(c.movimentos), 0)
  })

  it('SKU com lote, local de outra empresa e leitura temporária não movimentam estoque indevido', async () => {
    await limpar(10, SKU_LOTE)
    await confirmar(1, AUTH_A, PEDIDO, ITEM, LOCAL, 'LOTE-1')
    await assert.rejects(() => fechar(), /lote ou série/)
    let c = await contagens()
    assert.equal(Number(c.movimentos), 0)
    assert.equal(c.status, 'aprovado')

    await limpar()
    await assert.rejects(() => confirmar(1, AUTH_A, PEDIDO, ITEM, LOCAL_B), /Local de estoque inválido/)

    await limpar()
    await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', $1, true))
       SELECT public.com_confirmar_leitura_importada(
         $2::uuid, $3::uuid, '1625005540', 4, NULL, 'DOC-1', 'sku'
       ) AS res
       FROM cfg`,
      [AUTH_A, PEDIDO, ITEM],
    )
    const res = await fechar()
    assert.equal(res.idempotente, true)
    assert.match(res.avisos[0], /local temporário/)
    c = await contagens()
    assert.equal(c.status, 'recebido_parcial')
    assert.equal(Number(c.movimentos), 0)
    assert.equal(Number(c.alocadas), 0)
  })

  it('rejeita SKU ausente, movimento incompatível e sessão com dois usuários', async () => {
    await limpar()
    await client.query(`UPDATE public.com_pedido_itens SET sku_id = NULL WHERE id = '${ITEM}'`)
    await assert.rejects(() => confirmar(1), /SKU/)
    assert.equal(Number((await contagens()).leituras), 0)

    await limpar()
    await confirmar(1)
    const movimento = 'abababab-abab-4aba-8aba-ababababab10'
    await client.query(`
      INSERT INTO public.est_movimentos (id, empresa_id, sku_id, tipo, lote_entrada_id)
      VALUES ('${movimento}', '${EMP_B}', '${SKU}', 'entrada', NULL);
      UPDATE public.com_importado_leituras
      SET movimento_id = '${movimento}'
      WHERE pedido_id = '${PEDIDO}';
    `)
    await assert.rejects(() => fechar(), /incompatível/)
    assert.equal(Number((await contagens()).alocadas), 0)

    await client.query(`
      INSERT INTO public.usuarios (id, auth_user_id, empresa_id, role_global)
      VALUES ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', '${AUTH_A}', '${EMP_B}', 'superadmin');
    `)
    await assert.rejects(() => confirmar(1), /mais de um usuário/)
    await client.query(`DELETE FROM public.usuarios WHERE id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2'`)
  })

  it('retorno com empresa divergente não aloca a leitura', async () => {
    await limpar()
    await confirmar(1)
    await client.query(`SELECT set_config('hugin.empresa_errada', '1', false)`)
    await assert.rejects(() => fechar(), /não confirmado/)
    const c = await contagens()
    assert.equal(Number(c.alocadas), 0)
    assert.equal(c.status, 'aprovado')
  })

  it('o trigger numera ENT- sem aceitar número do cliente', async () => {
    await client.query(`DELETE FROM public.est_entrada_lotes`)
    const dia = sqlValor((await client.query(
      `SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD') AS dia`,
    )).rows)
    const pg = await import(pathToFileURL(join(PG_MODULES, 'pg', 'lib', 'index.js')).href)
    const Client = pg.Client || pg.default?.Client
    async function inserir(empresa, local, numeroCliente) {
      const conexao = new Client({ host: '127.0.0.1', port: 55487, user: 'postgres', password: 'postgres', database: 'postgres' })
      await conexao.connect()
      try {
        const { rows } = await conexao.query(
          `INSERT INTO public.est_entrada_lotes (empresa_id, numero, origem, status, local_id)
           VALUES ($1, $2, 'lote_tela', 'rascunho', $3)
           RETURNING numero`,
          [empresa, numeroCliente, local],
        )
        return rows[0].numero
      } finally {
        await conexao.end()
      }
    }
    const simultaneos = await Promise.all([
      inserir(EMP_A, LOCAL, 'MANUAL-A'),
      inserir(EMP_A, LOCAL, 'MANUAL-B'),
    ])
    assert.equal(new Set(simultaneos).size, 2)
    assert.deepEqual(simultaneos.map((numero) => numero.slice(0, 13)).sort(), [`ENT-${dia}-`, `ENT-${dia}-`])
    assert.deepEqual(simultaneos.map((numero) => numero.slice(13)).sort(), ['0001', '0002'])

    const outraEmpresa = await inserir(EMP_B, LOCAL_B, null)
    assert.equal(outraEmpresa, `ENT-${dia}-0001`)

    await client.query(
      `UPDATE public.est_entrada_lotes e
       SET numero = 'ENT-20000101-' || lpad(s.n::text, 4, '0')
       FROM (
         SELECT id, row_number() OVER (ORDER BY numero) AS n
         FROM public.est_entrada_lotes
         WHERE empresa_id = '${EMP_A}'
       ) s
       WHERE e.id = s.id`,
    )
    const outroDia = await inserir(EMP_A, LOCAL, 'MANUAL-C')
    assert.equal(outroDia, `ENT-${dia}-0001`)

    await client.query('BEGIN')
    const revertido = await client.query(
      `INSERT INTO public.est_entrada_lotes (empresa_id, origem, status, local_id)
       VALUES ('${EMP_A}', 'lote_tela', 'rascunho', '${LOCAL}')
       RETURNING numero`,
    )
    assert.equal(revertido.rows[0].numero, `ENT-${dia}-0002`)
    await client.query('ROLLBACK')
    const aposRollback = await inserir(EMP_A, LOCAL, 'MANUAL-D')
    assert.equal(aposRollback, `ENT-${dia}-0002`)
  })

  it('recusa código de outra empresa, item fora do pedido, ambiguidade e saldo', async () => {
    await limpar()
    const skuFora = 'ffffffff-ffff-4fff-8fff-ffffffffff02'
    await client.query(`
      INSERT INTO public.cad_skus (id, empresa_id, codigo)
      VALUES ('${skuFora}', '${EMP_B}', 'SO-DA-OUTRA');
    `)
    await assert.rejects(
      () => client.query(
        `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
         SELECT public.com_confirmar_leitura_importada(
           '${PEDIDO}'::uuid, '${ITEM}'::uuid, 'SO-DA-OUTRA', 1, '${LOCAL}'::uuid, NULL, 'sku'
         ) AS res FROM cfg`,
      ),
      /não identifica um SKU/,
    )

    const itemAlheio = '12121212-1212-4121-8121-121212121299'
    await client.query(`
      INSERT INTO public.com_pedido_itens (id, empresa_id, pedido_id, quantidade, sku_id, unidade, descricao)
      VALUES ('${itemAlheio}', '${EMP_A}', '${PEDIDO}', 2, '${SKU_LOTE}', 'UN', 'outro');
    `)
    await assert.rejects(
      () => client.query(
        `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
         SELECT public.com_confirmar_leitura_importada(
           '${PEDIDO}'::uuid, '${itemAlheio}'::uuid, '1625005540', 1, '${LOCAL}'::uuid, NULL, 'manual'
         ) AS res FROM cfg`,
      ),
      /identifica outro SKU/,
    )

    await client.query(`
      INSERT INTO public.cad_sku_depara (empresa_id, sku_id, pessoa_id, codigo_parceiro)
      VALUES ('${EMP_A}', '${SKU}', '${FORN}', 'FORN-77');
    `)
    const alternativo = await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_confirmar_leitura_importada(
         '${PEDIDO}'::uuid, '${ITEM}'::uuid, 'FORN-77', 1, '${LOCAL}'::uuid, NULL, 'alternativo'
       ) AS res FROM cfg`,
    )
    assert.equal(alternativo.rows[0].res.ok, true)

    await client.query(`
      INSERT INTO public.cad_sku_depara (empresa_id, sku_id, pessoa_id, codigo_parceiro)
      VALUES ('${EMP_A}', '${SKU_LOTE}', '${FORN}', 'REP-1'),
             ('${EMP_A}', '${SKU}', '${FORN}', 'REP-1');
    `)
    await assert.rejects(
      () => client.query(
        `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
         SELECT public.com_confirmar_leitura_importada(
           '${PEDIDO}'::uuid, '${ITEM}'::uuid, 'REP-1', 1, '${LOCAL}'::uuid, NULL, 'sku'
         ) AS res FROM cfg`,
      ),
      /mais de um produto/,
    )
    const manual = await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_confirmar_leitura_importada(
         '${PEDIDO}'::uuid, '${ITEM}'::uuid, '001234', 1, '${LOCAL}'::uuid, NULL, 'manual'
       ) AS res FROM cfg`,
    )
    assert.equal(manual.rows[0].res.codigo, '001234')
  })

  it('a chamada de estoque usa os parâmetros da função real', () => {
    const real = readFileSync(new URL('supabase/migrations/202610042200_estoque_serie_unitaria.sql', root), 'utf8')
    const inicio = real.lastIndexOf('CREATE OR REPLACE FUNCTION public.est_registrar_movimento_atomico')
    const assinatura = real.slice(inicio, real.indexOf('RETURNS jsonb', inicio))
    for (const nome of [
      'p_empresa_id', 'p_tipo', 'p_sku_id', 'p_local_id', 'p_quantidade',
      'p_documento', 'p_pessoa_id', 'p_origem', 'p_lote_entrada_id', 'p_motivo',
      'p_usuario_id', 'p_permitir_saldo_negativo', 'p_lote_produto_id', 'p_numero_serie',
    ]) {
      assert.match(assinatura, new RegExp(`\\b${nome}\\b`))
      assert.match(migration, new RegExp(`${nome} =>`))
    }
  })

  it('identifica só pelo código lido e grava a origem', async () => {
    await limpar()
    await assert.rejects(
      () => client.query(
        `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
         SELECT public.com_confirmar_leitura_importada(
           '${PEDIDO}'::uuid, '${ITEM}'::uuid, '1625005540', '999', 1, '${LOCAL}'::uuid, NULL, 'sku'
         ) AS res FROM cfg`,
      ),
      /function|não existe|does not exist/i,
    )

    const mascarado = await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_confirmar_leitura_importada(
         '${PEDIDO}'::uuid, '${ITEM}'::uuid, '1625-0055-40', 1, '${LOCAL}'::uuid, NULL, 'sku'
       ) AS res FROM cfg`,
    )
    assert.equal(mascarado.rows[0].res.codigo, '1625005540')
    assert.equal(mascarado.rows[0].res.origem, 'sku')
    const leitura = await client.query(`SELECT codigo_lido, codigo_normalizado, origem, usuario_id FROM public.com_importado_leituras`)
    assert.equal(leitura.rows[0].codigo_lido, '1625-0055-40')
    assert.equal(leitura.rows[0].codigo_normalizado, '1625005540')
    assert.equal(leitura.rows[0].origem, 'sku')
    assert.equal(leitura.rows[0].usuario_id, USER_A)

    await limpar()
    const skuZero = 'ffffffff-ffff-4fff-8fff-ffffffffff21'
    await client.query(`
      INSERT INTO public.cad_skus (id, empresa_id, codigo, unidade_estoque)
      VALUES ('${skuZero}', '${EMP_A}', '001234', 'UN');
      UPDATE public.com_pedido_itens SET sku_id = '${skuZero}', descricao = '001234' WHERE id = '${ITEM}';
    `)
    await assert.rejects(() => confirmar(1, AUTH_A, PEDIDO, ITEM, LOCAL, '1234'), /não identifica um SKU/)
    const zero = await confirmar(1, AUTH_A, PEDIDO, ITEM, LOCAL, '001234')
    assert.equal(zero.rows[0].res.codigo, '001234')

    await limpar()
    const skuB = 'ffffffff-ffff-4fff-8fff-ffffffffff22'
    const itemB = '12121212-1212-4121-8121-121212121230'
    await client.query(`
      INSERT INTO public.cad_skus (id, empresa_id, codigo, codigo_barras, unidade_estoque)
      VALUES ('${skuB}', '${EMP_A}', 'OUTRO', '1625005540', 'UN');
      INSERT INTO public.com_pedido_itens (id, empresa_id, pedido_id, quantidade, sku_id, unidade, descricao)
      VALUES ('${itemB}', '${EMP_A}', '${PEDIDO}', 2, '${skuB}', 'UN', 'outro');
    `)
    await assert.rejects(() => confirmar(1), /mais de um produto/)
    const manual = await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_confirmar_leitura_importada(
         '${PEDIDO}'::uuid, '${ITEM}'::uuid, '1625005540', 1, '${LOCAL}'::uuid, NULL, 'manual'
       ) AS res FROM cfg`,
    )
    assert.equal(manual.rows[0].res.origem, 'manual')
    await assert.rejects(
      () => client.query(
        `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
         SELECT public.com_confirmar_leitura_importada(
           '${PEDIDO}'::uuid, '${ITEM}'::uuid, '1625005540', 1, '${LOCAL}'::uuid, NULL, 'foto'
         ) AS res FROM cfg`,
      ),
      /Origem da identificação inválida/,
    )

    const previa = await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_prever_etiquetas_importado('${PEDIDO}'::uuid, ARRAY['1625005540', '9999']) AS res
       FROM cfg`,
    )
    assert.equal(previa.rows[0].res.status, 'ambiguo')
    await client.query(`DELETE FROM public.cad_skus WHERE id IN ('${skuZero}', '${skuB}')`)
    const nbsp = await client.query(`SELECT public.hugin_normalizar_codigo_etiqueta('AB' || chr(160) || 'CD') AS c`)
    assert.equal(nbsp.rows[0].c, 'ABCD')
    const ponto = await client.query(`SELECT public.hugin_normalizar_codigo_etiqueta('AB.CD') AS c`)
    assert.equal(ponto.rows[0].c, 'AB.CD')
  })

  it('converte a unidade de compra para a de estoque e preserva o fator', async () => {
    const skuA = 'ffffffff-ffff-4fff-8fff-ffffffffff31'
    const skuB = 'ffffffff-ffff-4fff-8fff-ffffffffff32'
    const skuL = 'ffffffff-ffff-4fff-8fff-ffffffffff33'
    const skuK = 'ffffffff-ffff-4fff-8fff-ffffffffff34'
    await client.query(`
      INSERT INTO public.cad_skus (id, empresa_id, codigo, unidade_estoque) VALUES
        ('${skuA}', '${EMP_A}', 'SKU-A', 'UN'),
        ('${skuB}', '${EMP_A}', 'SKU-B', 'UN'),
        ('${skuL}', '${EMP_A}', 'SKU-L', 'ML'),
        ('${skuK}', '${EMP_A}', 'SKU-K', 'G');
      INSERT INTO public.cad_sku_unidade_conversao (empresa_id, sku_id, unidade_origem, unidade_destino, fator_conversao)
      VALUES
        ('${EMP_A}', '${skuA}', 'FARDO', 'UN', 12),
        ('${EMP_A}', '${skuB}', 'FARDO', 'UN', 6),
        ('${EMP_A}', NULL, 'FARDO', 'UN', 100),
        ('${EMP_A}', NULL, 'L', 'ML', 1000),
        ('${EMP_A}', NULL, 'KG', 'G', 1000);
    `)

    async function receber(sku, unidade, qtd, codigo) {
      await limpar(qtd, sku)
      await client.query(`UPDATE public.com_pedido_itens SET unidade = '${unidade}' WHERE id = '${ITEM}'`)
      await client.query(`
        INSERT INTO public.cad_sku_unidade_conversao (empresa_id, sku_id, unidade_origem, unidade_destino, fator_conversao)
        VALUES
          ('${EMP_A}', '${skuA}', 'FARDO', 'UN', 12),
          ('${EMP_A}', '${skuB}', 'FARDO', 'UN', 6),
          ('${EMP_A}', NULL, 'FARDO', 'UN', 100),
          ('${EMP_A}', NULL, 'L', 'ML', 1000),
          ('${EMP_A}', NULL, 'KG', 'G', 1000)
      `)
      await confirmar(qtd, AUTH_A, PEDIDO, ITEM, LOCAL, codigo)
      return fechar()
    }

    await receber(skuA, 'FARDO', 5, 'SKU-A')
    let entrada = await client.query(`SELECT quantidade_origem, quantidade_estoque, fator_conversao, unidade_origem, unidade_estoque FROM public.est_entrada_itens`)
    assert.equal(Number(entrada.rows[0].quantidade_origem), 5)
    assert.equal(Number(entrada.rows[0].quantidade_estoque), 60)
    assert.equal(Number(entrada.rows[0].fator_conversao), 12)
    assert.equal(entrada.rows[0].unidade_origem, 'FARDO')
    assert.equal(entrada.rows[0].unidade_estoque, 'UN')
    let saldo = await client.query(`SELECT quantidade FROM public.est_saldos WHERE sku_id = '${skuA}'`)
    assert.equal(Number(saldo.rows[0].quantidade), 60)
    let compra = await client.query(`SELECT quantidade FROM public.com_recebimento_itens`)
    assert.equal(Number(compra.rows[0].quantidade), 5)
    await client.query(`UPDATE public.cad_sku_unidade_conversao SET fator_conversao = 99 WHERE sku_id = '${skuA}'`)
    entrada = await client.query(`SELECT fator_conversao FROM public.est_entrada_itens`)
    assert.equal(Number(entrada.rows[0].fator_conversao), 12)

    await receber(skuB, 'FARDO', 5, 'SKU-B')
    saldo = await client.query(`SELECT quantidade FROM public.est_saldos WHERE sku_id = '${skuB}'`)
    assert.equal(Number(saldo.rows[0].quantidade), 30)

    await receber(skuL, 'L', 2.5, 'SKU-L')
    saldo = await client.query(`SELECT quantidade FROM public.est_saldos WHERE sku_id = '${skuL}'`)
    assert.equal(Number(saldo.rows[0].quantidade), 2500)

    await receber(skuK, 'KG', 3, 'SKU-K')
    saldo = await client.query(`SELECT quantidade FROM public.est_saldos WHERE sku_id = '${skuK}'`)
    assert.equal(Number(saldo.rows[0].quantidade), 3000)

    await limpar()
    await confirmar(4)
    await fechar()
    entrada = await client.query(`SELECT fator_conversao, quantidade_origem, quantidade_estoque FROM public.est_entrada_itens`)
    assert.equal(Number(entrada.rows[0].fator_conversao), 1)
    assert.equal(Number(entrada.rows[0].quantidade_origem), Number(entrada.rows[0].quantidade_estoque))

    await limpar(5, skuA)
    await client.query(`UPDATE public.com_pedido_itens SET unidade = 'FARDO' WHERE id = '${ITEM}'`)
    await client.query(`DELETE FROM public.cad_sku_unidade_conversao WHERE sku_id = '${skuA}' OR (sku_id IS NULL AND unidade_origem = 'FARDO')`)
    await confirmar(5, AUTH_A, PEDIDO, ITEM, LOCAL, 'SKU-A')
    await assert.rejects(() => fechar(), /Não existe fator de conversão cadastrado para o SKU SKU-A: FARDO → UN/)
    assert.equal(Number((await contagens()).movimentos), 0)
    assert.equal((await contagens()).status, 'aprovado')

    await client.query(`
      INSERT INTO public.cad_sku_unidade_conversao (empresa_id, sku_id, unidade_origem, unidade_destino, fator_conversao)
      VALUES ('${EMP_A}', '${skuA}', 'FARDO', 'UN', 0)
    `)
    await assert.rejects(() => fechar(), /Fator de conversão inválido/)
    assert.equal(Number((await contagens()).movimentos), 0)

    await client.query(`
      DELETE FROM public.cad_sku_unidade_conversao WHERE sku_id = '${skuA}';
      INSERT INTO public.cad_sku_unidade_conversao (empresa_id, sku_id, unidade_origem, unidade_destino, fator_conversao)
      VALUES ('${EMP_A}', NULL, 'FARDO', 'UN', 12), ('${EMP_A}', NULL, 'FARDO', 'UN', 6);
    `)
    await assert.rejects(() => fechar(), /fatores de conversão conflitantes/)
    assert.equal(Number((await contagens()).lotes), 0)

    const item2 = '12121212-1212-4121-8121-121212121231'
    await limpar(5, skuA)
    await client.query(`
      UPDATE public.com_pedido_itens SET unidade = 'FARDO' WHERE id = '${ITEM}';
      INSERT INTO public.cad_sku_unidade_conversao (empresa_id, sku_id, unidade_origem, unidade_destino, fator_conversao)
      VALUES ('${EMP_A}', '${skuA}', 'FARDO', 'UN', 12);
      INSERT INTO public.com_pedido_itens (id, empresa_id, pedido_id, quantidade, sku_id, unidade, descricao)
      VALUES ('${item2}', '${EMP_A}', '${PEDIDO}', 1, '${skuB}', 'CX', 'sem fator');
    `)
    await confirmar(5, AUTH_A, PEDIDO, ITEM, LOCAL, 'SKU-A')
    await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_confirmar_leitura_importada(
         '${PEDIDO}'::uuid, '${item2}'::uuid, 'SKU-B', 1, '${LOCAL}'::uuid, NULL, 'sku'
       ) AS res FROM cfg`,
    )
    await assert.rejects(() => fechar(), /Não existe fator/)
    const depois = await contagens()
    assert.equal(Number(depois.movimentos), 0)
    assert.equal(Number(depois.lotes), 0)
    assert.equal(depois.status, 'aprovado')
  })

  it('aprende o código do importador no de-para e recusa conflitos', async () => {
    await limpar()
    const skuRaceA = 'ffffffff-ffff-4fff-8fff-ffffffffff91'
    const skuRaceB = 'ffffffff-ffff-4fff-8fff-ffffffffff92'
    const skuRaceC = 'ffffffff-ffff-4fff-8fff-ffffffffff93'
    const itemRaceA = '12121212-1212-4121-8121-121212121244'
    const itemRaceB = '12121212-1212-4121-8121-121212121245'
    const itemRaceC = '12121212-1212-4121-8121-121212121246'
    const itemLote = '12121212-1212-4121-8121-121212121240'
    const pedido2 = '12121212-1212-4121-8121-121212121241'
    const item2 = '12121212-1212-4121-8121-121212121242'
    const itemLinha2 = '12121212-1212-4121-8121-121212121243'
    await client.query(`
      INSERT INTO public.cad_skus (id, empresa_id, codigo, unidade_estoque) VALUES
        ('${skuRaceA}', '${EMP_A}', 'RACE-A', 'UN'),
        ('${skuRaceB}', '${EMP_A}', 'RACE-B', 'UN'),
        ('${skuRaceC}', '${EMP_A}', 'RACE-C', 'UN');
      INSERT INTO public.com_pedido_itens (id, empresa_id, pedido_id, quantidade, sku_id, unidade, descricao)
      VALUES
        ('${itemLote}', '${EMP_A}', '${PEDIDO}', 4, '${SKU_LOTE}', 'UN', 'LOTE-1'),
        ('${itemRaceA}', '${EMP_A}', '${PEDIDO}', 2, '${skuRaceA}', 'UN', 'corrida A'),
        ('${itemRaceB}', '${EMP_A}', '${PEDIDO}', 2, '${skuRaceB}', 'UN', 'corrida B'),
        ('${itemRaceC}', '${EMP_A}', '${PEDIDO}', 2, '${skuRaceC}', 'UN', 'corrida C');
    `)

    async function aprender(uid, pedido, item, codigo) {
      return client.query(
        `WITH cfg AS (SELECT set_config('hugin.test_uid', $1, true))
         SELECT public.com_aprender_codigo_importado($2::uuid, $3::uuid, $4) AS res
         FROM cfg`,
        [uid, pedido, item, codigo],
      )
    }

    const criado = await aprender(AUTH_A, PEDIDO, ITEM, 'imp-9')
    assert.equal(criado.rows[0].res.status, 'criado')
    assert.equal(criado.rows[0].res.codigo, 'IMP9')
    const gravado = await client.query(
      `SELECT codigo_parceiro, sku_id, pessoa_id, ativo FROM public.cad_sku_depara`,
    )
    assert.equal(gravado.rows.length, 1)
    assert.equal(gravado.rows[0].codigo_parceiro, 'IMP9')
    assert.equal(criado.rows[0].res.codigo_lido, 'imp-9')
    assert.equal(gravado.rows[0].sku_id, SKU)
    assert.equal(gravado.rows[0].pessoa_id, FORN)

    const deNovo = await aprender(AUTH_A, PEDIDO, ITEM, 'IMP-9')
    assert.equal(deNovo.rows[0].res.status, 'existente')
    assert.equal(deNovo.rows[0].res.codigo_lido, 'IMP-9')
    assert.equal(Number((await client.query(`SELECT count(*) AS n FROM public.cad_sku_depara`)).rows[0].n), 1)
    assert.equal(
      (await client.query(`SELECT codigo_parceiro FROM public.cad_sku_depara WHERE sku_id = '${SKU}'`)).rows[0].codigo_parceiro,
      'IMP9',
    )

    const mascarado = await aprender(AUTH_A, PEDIDO, itemLote, '  0012 - 34.50\t')
    assert.equal(mascarado.rows[0].res.status, 'criado')
    assert.equal(mascarado.rows[0].res.codigo, '001234.50')
    assert.equal(mascarado.rows[0].res.codigo_lido, '0012 - 34.50\t')
    assert.equal(
      (await client.query(`SELECT codigo_parceiro FROM public.cad_sku_depara WHERE sku_id = '${SKU_LOTE}'`)).rows[0].codigo_parceiro,
      '001234.50',
    )
    const repetido = await aprender(AUTH_A, PEDIDO, itemLote, '0012-34.50')
    assert.equal(repetido.rows[0].res.status, 'existente')
    assert.equal(
      (await client.query(`SELECT codigo_parceiro FROM public.cad_sku_depara WHERE sku_id = '${SKU_LOTE}'`)).rows[0].codigo_parceiro,
      '001234.50',
    )
    await assert.rejects(() => aprender(AUTH_A, PEDIDO, ITEM, ' - \n'), /número da etiqueta/)

    await client.query(`
      INSERT INTO public.cad_sku_depara (empresa_id, sku_id, pessoa_id, codigo_parceiro)
      VALUES ('${EMP_A}', '${skuRaceC}', '${FORN}', 'abc-9');
    `)
    const legado = await aprender(AUTH_A, PEDIDO, itemRaceC, 'ABC 9')
    assert.equal(legado.rows[0].res.status, 'existente')
    assert.equal(legado.rows[0].res.codigo_lido, 'ABC 9')
    assert.equal(
      (await client.query(`SELECT codigo_parceiro FROM public.cad_sku_depara WHERE sku_id = '${skuRaceC}'`)).rows[0].codigo_parceiro,
      'abc-9',
    )
    await client.query(`DELETE FROM public.cad_sku_depara WHERE codigo_parceiro IN ('001234.50', 'abc-9')`)

    await assert.rejects(
      () => aprender(AUTH_A, PEDIDO, itemLote, 'IMP-9'),
      /outro SKU deste fornecedor/,
    )
    assert.equal(Number((await client.query(`SELECT count(*) AS n FROM public.cad_sku_depara`)).rows[0].n), 1)

    await client.query(`
      INSERT INTO public.com_pedidos (id, empresa_id, status, codigo_fornecedor, fornecedor_id, numero)
      VALUES ('${pedido2}', '${EMP_A}', 'aprovado', 'CX-2', '${FORN_2}', 'PC-2');
      INSERT INTO public.com_pedido_itens (id, empresa_id, pedido_id, quantidade, sku_id, unidade, descricao)
      VALUES ('${item2}', '${EMP_A}', '${pedido2}', 2, '${SKU_LOTE}', 'UN', 'LOTE-1');
    `)
    const outroFornecedor = await aprender(AUTH_A, pedido2, item2, 'IMP-9')
    assert.equal(outroFornecedor.rows[0].res.status, 'criado')
    assert.equal(outroFornecedor.rows[0].res.pessoa_id, FORN_2)

    await assert.rejects(() => aprender(AUTH_A, PEDIDO, itemLote, '1625005540'), /outro SKU da empresa/)
    await client.query(`UPDATE public.cad_skus SET codigo_barras = '789100000001' WHERE id = '${SKU}'`)
    await assert.rejects(() => aprender(AUTH_A, PEDIDO, itemRaceA, '789100000001'), /outro SKU da empresa/)

    const skuFora = 'ffffffff-ffff-4fff-8fff-ffffffffff90'
    await client.query(`
      INSERT INTO public.cad_skus (id, empresa_id, codigo, unidade_estoque)
      VALUES ('${skuFora}', '${EMP_B}', 'SKU-FORA', 'UN');
      UPDATE public.com_pedido_itens SET sku_id = '${skuFora}' WHERE id = '${itemLote}';
    `)
    await assert.rejects(() => aprender(AUTH_A, PEDIDO, itemLote, 'NOVO-FORA'), /SKU desta empresa/)
    await client.query(`UPDATE public.com_pedido_itens SET sku_id = '${SKU_LOTE}' WHERE id = '${itemLote}'`)

    await client.query(`UPDATE public.com_pedidos SET fornecedor_id = '${FORN_B}' WHERE id = '${PEDIDO}'`)
    await assert.rejects(() => aprender(AUTH_A, PEDIDO, ITEM, 'NOVO-FORN'), /Fornecedor inválido/)
    await client.query(`UPDATE public.com_pedidos SET fornecedor_id = '${FORN}' WHERE id = '${PEDIDO}'`)
    assert.equal(
      Number((await client.query(`SELECT count(*) AS n FROM public.cad_sku_depara WHERE codigo_parceiro LIKE 'NOVO-%'`)).rows[0].n),
      0,
    )

    await assert.rejects(() => aprender(AUTH_OP, PEDIDO, itemLote, 'SEM-PERM'), /autorização/)
    const comPermissao = await aprender(AUTH_A, PEDIDO, itemLote, 'COM-PERM')
    assert.equal(comPermissao.rows[0].res.status, 'criado')

    await client.query('BEGIN')
    await aprender(AUTH_A, PEDIDO, itemRaceA, 'ROLLBACK-1')
    await client.query('ROLLBACK')
    assert.equal(
      Number((await client.query(`SELECT count(*) AS n FROM public.cad_sku_depara WHERE codigo_parceiro = 'ROLLBACK1'`)).rows[0].n),
      0,
    )

    const pg = await import(pathToFileURL(join(PG_MODULES, 'pg', 'lib', 'index.js')).href)
    const Client = pg.Client || pg.default?.Client
    async function aprenderConexao(item, codigo) {
      const conexao = new Client({ host: '127.0.0.1', port: 55487, user: 'postgres', password: 'postgres', database: 'postgres' })
      await conexao.connect()
      try {
        const { rows } = await conexao.query(
          `WITH cfg AS (SELECT set_config('hugin.test_uid', $1, true))
           SELECT public.com_aprender_codigo_importado($2::uuid, $3::uuid, $4) AS res
           FROM cfg`,
          [AUTH_A, PEDIDO, item, codigo],
        )
        return rows[0].res
      } finally {
        await conexao.end()
      }
    }
    const paralelos = await Promise.allSettled([
      aprenderConexao(itemRaceA, 'RACE-1'),
      aprenderConexao(itemRaceB, 'RACE-1'),
    ])
    const ok = paralelos.filter((item) => item.status === 'fulfilled')
    const falha = paralelos.filter((item) => item.status === 'rejected')
    assert.equal(ok.length, 1)
    assert.equal(falha.length, 1)
    assert.match(falha[0].reason.message, /outro SKU|já possui/)
    assert.equal(
      Number((await client.query(`SELECT count(*) AS n FROM public.cad_sku_depara WHERE codigo_parceiro = 'RACE1'`)).rows[0].n),
      1,
    )

    const repetidos = await Promise.all([
      aprenderConexao(itemRaceC, 'RACE-2'),
      aprenderConexao(itemRaceC, 'RACE-2'),
    ])
    assert.deepEqual(repetidos.map((item) => item.status).sort(), ['criado', 'existente'])
    assert.equal(
      Number((await client.query(`SELECT count(*) AS n FROM public.cad_sku_depara WHERE codigo_parceiro = 'RACE2'`)).rows[0].n),
      1,
    )

    const previa = await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_prever_etiquetas_importado('${PEDIDO}'::uuid, ARRAY['COM-PERM']) AS res
       FROM cfg`,
    )
    assert.equal(previa.rows[0].res.status, 'unico')
    assert.equal(previa.rows[0].res.origem, 'alternativo')
    assert.equal(previa.rows[0].res.sku_id, SKU_LOTE)

    await client.query(`
      INSERT INTO public.com_pedido_itens (id, empresa_id, pedido_id, quantidade, sku_id, unidade, descricao)
      VALUES ('${itemLinha2}', '${EMP_A}', '${PEDIDO}', 3, '${SKU_LOTE}', 'UN', 'LOTE-1 linha 2');
    `)
    const linhas = await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_prever_etiquetas_importado('${PEDIDO}'::uuid, ARRAY['COM-PERM']) AS res
       FROM cfg`,
    )
    assert.equal(linhas.rows[0].res.status, 'ambiguo')
    assert.equal(linhas.rows[0].res.candidatos.length, 2)

    const ocr = await client.query(
      `WITH cfg AS (SELECT set_config('hugin.test_uid', '${AUTH_A}', true))
       SELECT public.com_prever_etiquetas_importado('${PEDIDO}'::uuid, ARRAY['COM-PERM', '99887766']) AS res
       FROM cfg`,
    )
    assert.equal(ocr.rows[0].res.status, 'ambiguo')
    const escolhido = 'COM-PERM'
    assert.equal(
      Number((await client.query(`SELECT count(*) AS n FROM public.cad_sku_depara WHERE codigo_parceiro = '99887766'`)).rows[0].n),
      0,
    )
    assert.equal(escolhido, 'COM-PERM')
  })

  it('privilégios: authenticated executa as RPCs; anon, PUBLIC e service_role não', async () => {
    const consulta = async (papel, nome) => {
      const { rows } = await client.query(
        `SELECT has_function_privilege($1, $2::regprocedure, 'execute') AS ok`,
        [papel, nome],
      )
      return rows[0].ok
    }
    const confirmarFn = 'public.com_confirmar_leitura_importada(uuid,uuid,text,numeric,uuid,text,text)'
    const preverFn = 'public.com_prever_etiquetas_importado(uuid,text[])'
    const fecharFn = 'public.com_fechar_recebimento_importado(uuid)'
    const acessoFn = 'public.com_importado_exigir_acesso()'
    const aprenderFn = 'public.com_aprender_codigo_importado(uuid,uuid,text)'
    for (const nome of [confirmarFn, fecharFn, preverFn, aprenderFn]) {
      assert.equal(await consulta('authenticated', nome), true)
      assert.equal(await consulta('anon', nome), false)
      assert.equal(await consulta('public', nome), false)
      assert.equal(await consulta('service_role', nome), false)
    }
    assert.equal(await consulta('authenticated', acessoFn), false)
    assert.equal(await consulta('anon', acessoFn), false)
    assert.equal(await consulta('public', acessoFn), false)
  })
})
