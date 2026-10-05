/**
 * Cadastros mestres — SCR-CAD-01.
 * Família → SKU → conversão UM → pessoa → de-para → ativo; cleanup por empresa_id.
 */
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { assertDevTarget } from './test-env-guard.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
for (const file of ['.env.local', '.env']) {
  const path = resolve(root, file)
  if (existsSync(path)) loadDotenv({ path, override: false })
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.env.TEST_EMAIL || process.env.MANUAL_EMAIL
const PASSWORD = process.env.TEST_PASSWORD || process.env.MANUAL_PASSWORD
const EXPECTED_TENANT = process.env.TEST_TENANT_ID
const runKey = process.env.TEST_RUN_ID || randomUUID()
const marker = `[agent-cad:${runKey}]`
const runDir =
  process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes', runKey)
const eventsPath = process.env.TEST_RUN_EVENTS_PATH || ''

const cases = []
const CATALOG = {
  'SCR-CAD-01': {
    area: 'Cadastros',
    expectation:
      'Família, SKU, conversão UM, pessoa, de-para e ativo CRUD com RLS e cleanup no tenant.',
    passos:
      'Cria cadeia efêmera filtrada por empresa_id, valida leitura autenticada e remove tudo ao final.',
  },
}

function appendEvent(event) {
  if (!eventsPath) return
  mkdirSync(dirname(eventsPath), { recursive: true })
  writeFileSync(eventsPath, `${JSON.stringify(event)}\n`, { flag: 'a' })
}

function record(id, status, error, durationMs) {
  const meta = CATALOG[id]
  const row = {
    id,
    title: `[${id}] ${meta.expectation}`,
    area: meta.area,
    expectation: `[${id}] ${meta.expectation}`,
    passos: meta.passos,
    status,
    error,
    durationMs,
  }
  cases.push(row)
  appendEvent({
    ts: new Date().toISOString(),
    type: 'test_end',
    ...row,
    passed: cases.filter((item) => item.status === 'passed').length,
    failed: cases.filter((item) => item.status === 'failed').length,
    skipped: 0,
    message: row.expectation,
  })
  console.log(`  ${status === 'passed' ? '✓' : '✗'} ${id}${error ? ` — ${error}` : ''}`)
}

function assertConfig() {
  const missing = []
  if (process.env.TEST_ALLOW_MUTATIONS !== '1') missing.push('TEST_ALLOW_MUTATIONS=1')
  if (!URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!EMAIL) missing.push('TEST_EMAIL')
  if (!PASSWORD) missing.push('TEST_PASSWORD')
  if (!EXPECTED_TENANT) missing.push('TEST_TENANT_ID')
  if (missing.length) throw new Error(`Preflight Cadastros: ausente ${missing.join(', ')}`)
  assertDevTarget()
}

function assertOk(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

async function loginPrincipal() {
  const client = createClient(URL, ANON_KEY)
  const { data: auth, error: loginError } = await client.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  assertOk(loginError, 'login')
  const { data: me, error: meError } = await client
    .from('usuarios')
    .select('id, empresa_id, role_global, ativo')
    .eq('auth_user_id', auth.user.id)
    .eq('empresa_id', EXPECTED_TENANT)
    .single()
  assertOk(meError, 'perfil')
  if (!me?.empresa_id || me.ativo === false || me.role_global === 'superadmin') {
    throw new Error('Cadastros SCR exige admin ativo de um tenant, não superadmin')
  }
  if (EXPECTED_TENANT !== me.empresa_id) {
    throw new Error(`Tenant ${me.empresa_id} difere de TEST_TENANT_ID`)
  }
  return { client, me }
}

async function runCase(id, fn) {
  const started = Date.now()
  try {
    await fn()
    record(id, 'passed', undefined, Date.now() - started)
  } catch (error) {
    record(id, 'failed', error instanceof Error ? error.message : String(error), Date.now() - started)
  }
}

async function scrCad01(client, me, admin) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const codigo = `CAD-${suffix}`.slice(0, 20)
  const ids = {
    familia: '',
    sku: '',
    conversao: '',
    pessoa: '',
    depara: '',
    ativo: '',
  }
  try {
    const { data: familia, error: familiaError } = await client
      .from('cad_sku_familias')
      .insert({
        empresa_id: me.empresa_id,
        codigo: `FAM-${suffix}`.slice(0, 20),
        nome: `${marker} Família ${suffix}`,
        descricao: 'Fixture agente cadastros',
      })
      .select('id')
      .single()
    assertOk(familiaError, 'criar família')
    ids.familia = familia.id

    const { data: sku, error: skuError } = await client
      .from('cad_skus')
      .insert({
        empresa_id: me.empresa_id,
        codigo,
        nome: `${marker} SKU ${suffix}`,
        tipo: 'produto',
        unidade_venda: 'UN',
        unidade_compra: 'CX',
        unidade_estoque: 'UN',
        controla_estoque: true,
        familia_id: ids.familia,
        ativo: true,
      })
      .select('id')
      .single()
    assertOk(skuError, 'criar SKU')
    ids.sku = sku.id

    const { data: conversao, error: convError } = await client
      .from('cad_sku_unidade_conversao')
      .insert({
        empresa_id: me.empresa_id,
        sku_id: ids.sku,
        unidade_origem: 'CX',
        unidade_destino: 'UN',
        fator_conversao: 12,
      })
      .select('id')
      .single()
    assertOk(convError, 'criar conversão UM')
    ids.conversao = conversao.id

    const { data: pessoa, error: pessoaError } = await client
      .from('crm_leads')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Fornecedor ${suffix}`,
        telefone: `55119${Date.now().toString().slice(-8)}`,
        email: `cad-${suffix}@teste.huginflow.com`,
      })
      .select('id')
      .single()
    assertOk(pessoaError, 'criar pessoa')
    ids.pessoa = pessoa.id

    const { data: depara, error: deparaError } = await client
      .from('cad_sku_depara')
      .insert({
        empresa_id: me.empresa_id,
        sku_id: ids.sku,
        pessoa_id: ids.pessoa,
        codigo_parceiro: `PARC-${suffix}`,
        ativo: true,
      })
      .select('id')
      .single()
    assertOk(deparaError, 'criar de-para')
    ids.depara = depara.id

    const { data: ativo, error: ativoError } = await client
      .from('cad_ativos')
      .insert({
        empresa_id: me.empresa_id,
        codigo: `AT-${suffix}`.slice(0, 20),
        nome: `${marker} Ativo ${suffix}`,
        status: 'disponivel',
        sku_id: ids.sku,
        ativo: true,
      })
      .select('id')
      .single()
    assertOk(ativoError, 'criar ativo')
    ids.ativo = ativo.id

    const { data: foundSku, error: foundError } = await client
      .from('cad_skus')
      .select('id, familia_id, controla_estoque')
      .eq('empresa_id', me.empresa_id)
      .eq('id', ids.sku)
      .single()
    assertOk(foundError, 'ler SKU')
    if (!foundSku?.controla_estoque || foundSku.familia_id !== ids.familia) {
      throw new Error('SKU não refletiu família/controla_estoque')
    }

    const { data: foundDepara, error: foundDeparaError } = await client
      .from('cad_sku_depara')
      .select('codigo_parceiro')
      .eq('empresa_id', me.empresa_id)
      .eq('id', ids.depara)
      .single()
    assertOk(foundDeparaError, 'ler de-para')
    if (foundDepara.codigo_parceiro !== `PARC-${suffix}`) {
      throw new Error('De-para não persistiu codigo_parceiro')
    }
  } finally {
    if (ids.ativo) {
      await admin.from('cad_ativos').delete().eq('id', ids.ativo).eq('empresa_id', me.empresa_id)
    }
    if (ids.depara) {
      await admin.from('cad_sku_depara').delete().eq('id', ids.depara).eq('empresa_id', me.empresa_id)
    }
    if (ids.conversao) {
      await admin
        .from('cad_sku_unidade_conversao')
        .delete()
        .eq('id', ids.conversao)
        .eq('empresa_id', me.empresa_id)
    }
    if (ids.sku) {
      await admin.from('cad_skus').delete().eq('id', ids.sku).eq('empresa_id', me.empresa_id)
    }
    if (ids.familia) {
      await admin
        .from('cad_sku_familias')
        .delete()
        .eq('id', ids.familia)
        .eq('empresa_id', me.empresa_id)
    }
    if (ids.pessoa) {
      await admin.from('crm_leads').delete().eq('id', ids.pessoa).eq('empresa_id', me.empresa_id)
    }
  }
}

async function main() {
  mkdirSync(runDir, { recursive: true })
  console.log('\n[agent] Scripts Cadastros')
  appendEvent({ ts: new Date().toISOString(), type: 'log', message: 'Scripts Cadastros' })

  try {
    assertConfig()
    const admin = createClient(URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { client, me } = await loginPrincipal()
    await runCase('SCR-CAD-01', () => scrCad01(client, me, admin))
    await client.auth.signOut()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    for (const id of Object.keys(CATALOG)) {
      if (!cases.some((item) => item.id === id)) record(id, 'failed', message, 0)
    }
  }

  const passed = cases.filter((item) => item.status === 'passed').length
  const failed = cases.filter((item) => item.status === 'failed').length
  const summary = {
    ambiente: 'DEV',
    result: failed === 0 ? 'PASS' : 'FAIL',
    summary: { passed, failed, skipped: 0, total: cases.length },
    cases,
  }
  writeFileSync(
    resolve(runDir, 'phase-cadastros-scripts-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  )
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
