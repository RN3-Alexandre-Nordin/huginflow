/**
 * Fase 3 — scripts DEV: SCR-LEAD-01, SCR-CANAL-01, SCR-RBAC-01.
 * Exercita RLS com clientes autenticados; service role serve somente fixtures/cleanup.
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
const APP_URL = (
  process.env.TEST_BASE_URL ||
  process.env.MANUAL_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000'
).replace(/\/$/, '')
const runKey = process.env.TEST_RUN_ID || randomUUID()
const marker = `[agent-phase3:${runKey}]`
const runDir =
  process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes', runKey)
const eventsPath = process.env.TEST_RUN_EVENTS_PATH || ''

const cases = []
const CATALOG = {
  'SCR-LEAD-01': {
    area: 'Leads',
    expectation: 'Lead pode ser criado, buscado, editado e excluído dentro do tenant.',
    passos:
      'Usa cliente autenticado, filtra todas as operações por empresa_id e confirma cleanup do lead temporário.',
  },
  'SCR-CANAL-01': {
    area: 'Canais / inbound',
    expectation: 'Canal, roteamento e token inbound criam lead e card no destino correto.',
    passos:
      'Cria canal e rota temporários, rejeita token inválido, aceita token válido, valida tenant/funil/etapa e limpa os dados.',
  },
  'SCR-RBAC-01': {
    area: 'RBAC / RLS',
    expectation: 'Usuário restrito vê apenas ações e dados permitidos pela matriz.',
    passos:
      'Cria usuário/grupo efêmeros, valida check_permission, bloqueio de escrita e canais, e isolamento de outro tenant.',
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
  if (missing.length) throw new Error(`Preflight Fase 3: ausente ${missing.join(', ')}`)
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
    throw new Error('Fase 3 exige admin ativo de um tenant, não superadmin')
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

async function scrLead01(client, me, admin) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  let leadId = ''
  try {
    const { data: lead, error: createError } = await client
      .from('crm_leads')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Lead ${suffix}`,
        telefone: `55119${Date.now().toString().slice(-8)}`,
        whatsapp: `55119${Date.now().toString().slice(-8)}`,
        email: `phase3-lead-${suffix}@teste.huginflow.com`,
        empresa_cliente: 'Fixture Fase 3',
        cargo: 'Comprador',
      })
      .select('id')
      .single()
    assertOk(createError, 'criar lead')
    leadId = lead.id

    const { data: found, error: searchError } = await client
      .from('crm_leads')
      .select('id')
      .eq('empresa_id', me.empresa_id)
      .ilike('nome', `%${suffix}%`)
    assertOk(searchError, 'buscar lead')
    if (!(found ?? []).some((item) => item.id === leadId)) throw new Error('Lead não encontrado')

    const editedName = `${marker} Lead editado ${suffix}`
    const { error: updateError } = await client
      .from('crm_leads')
      .update({ nome: editedName, cargo: 'Gerente Comercial' })
      .eq('id', leadId)
      .eq('empresa_id', me.empresa_id)
    assertOk(updateError, 'editar lead')

    const { data: edited, error: editedError } = await client
      .from('crm_leads')
      .select('nome, cargo')
      .eq('id', leadId)
      .eq('empresa_id', me.empresa_id)
      .single()
    assertOk(editedError, 'validar lead')
    if (edited.nome !== editedName || edited.cargo !== 'Gerente Comercial') {
      throw new Error('Edição do lead não persistiu')
    }

    const { error: deleteError } = await client
      .from('crm_leads')
      .delete()
      .eq('id', leadId)
      .eq('empresa_id', me.empresa_id)
    assertOk(deleteError, 'excluir lead')
    const { data: deleted } = await admin
      .from('crm_leads')
      .select('id')
      .eq('id', leadId)
      .eq('empresa_id', me.empresa_id)
      .maybeSingle()
    if (deleted) throw new Error('Lead ainda existe após exclusão')
    leadId = ''
  } finally {
    if (leadId) {
      await admin.from('crm_leads').delete().eq('id', leadId).eq('empresa_id', me.empresa_id)
    }
  }
}

async function scrCanal01(client, me, admin) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const token = randomUUID()
  const ids = { channel: '', route: '', lead: '', card: '' }
  try {
    const { data: pipelines, error: pipelineError } = await client
      .from('pipelines')
      .select('id, pipeline_stages(id, ordem)')
      .eq('empresa_id', me.empresa_id)
    assertOk(pipelineError, 'listar funis')
    const pipeline = (pipelines ?? []).find((item) => item.pipeline_stages?.length)
    if (!pipeline) throw new Error('Tenant sem funil/etapa para canal')
    const stage = [...pipeline.pipeline_stages].sort((a, b) => a.ordem - b.ordem)[0]

    const { data: channel, error: channelError } = await client
      .from('crm_canais')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Canal ${suffix}`,
        tipo: 'landing-page',
        provider: 'internal',
        provider_id: `phase3-${suffix}`,
        status: 'connected',
        token,
      })
      .select('id, status')
      .single()
    assertOk(channelError, 'criar canal')
    ids.channel = channel.id

    const { data: route, error: routeError } = await client
      .from('crm_canais_roteamento')
      .insert({
        canal_id: channel.id,
        org_id: me.empresa_id,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
      })
      .select('id')
      .single()
    assertOk(routeError, 'criar roteamento')
    ids.route = route.id

    const badResponse = await fetch(`${APP_URL}/api/inbound/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Token inválido',
        email: `bad-${suffix}@teste.huginflow.com`,
        telefone: '5511999999999',
        token: randomUUID(),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (badResponse.status !== 404) throw new Error(`Token inválido retornou ${badResponse.status}`)

    const response = await fetch(`${APP_URL}/api/inbound/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: `${marker} Inbound ${suffix}`,
        email: `inbound-${suffix}@teste.huginflow.com`,
        telefone: `55118${Date.now().toString().slice(-8)}`,
        mensagem: 'Fixture inbound Fase 3',
        token,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const payload = await response.json().catch(() => ({}))
    if (response.status !== 201 || !payload.lead_id || !payload.card_id) {
      throw new Error(`Inbound HTTP ${response.status}: ${payload.error ?? 'resposta inválida'}`)
    }
    ids.lead = payload.lead_id
    ids.card = payload.card_id

    const { data: lead, error: leadError } = await client
      .from('crm_leads')
      .select('id, empresa_id, canal_id')
      .eq('id', ids.lead)
      .eq('empresa_id', me.empresa_id)
      .single()
    assertOk(leadError, 'validar lead inbound')
    const { data: card, error: cardError } = await client
      .from('crm_cards')
      .select('id, empresa_id, pipeline_id, stage_id, lead_id')
      .eq('id', ids.card)
      .eq('empresa_id', me.empresa_id)
      .single()
    assertOk(cardError, 'validar card inbound')
    if (
      lead.canal_id !== channel.id ||
      card.lead_id !== lead.id ||
      card.pipeline_id !== pipeline.id ||
      card.stage_id !== stage.id ||
      payload.destino?.empresa_id !== me.empresa_id
    ) {
      throw new Error('Inbound foi criado fora do destino esperado')
    }
  } finally {
    if (ids.card) {
      await admin.from('crm_cards').delete().eq('id', ids.card).eq('empresa_id', me.empresa_id)
    }
    if (ids.lead) {
      await admin.from('crm_leads').delete().eq('id', ids.lead).eq('empresa_id', me.empresa_id)
    }
    if (ids.route) {
      await admin
        .from('crm_canais_roteamento')
        .delete()
        .eq('id', ids.route)
        .eq('org_id', me.empresa_id)
    }
    if (ids.channel) {
      await admin.from('crm_canais').delete().eq('id', ids.channel).eq('empresa_id', me.empresa_id)
    }
  }
}

async function scrRbac01(me, admin) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const restrictedEmail = `phase3-rbac-${suffix}@teste.huginflow.com`
  const restrictedPassword = `P3!${randomUUID()}aA`
  const ids = { group: '', auth: '', ownLead: '', otherLead: '', deniedLead: '', otherTenant: '' }
  let restricted
  try {
    const { data: otherTenant, error: tenantError } = await admin
      .from('empresas')
      .insert({
        nome: `${marker} Tenant negativo ${suffix}`,
        ativo: true,
        status: 'active',
      })
      .select('id')
      .single()
    assertOk(tenantError, 'criar tenant negativo')
    ids.otherTenant = otherTenant.id

    const { data: group, error: groupError } = await admin
      .from('grupos_acesso')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Restrito ${suffix}`,
        is_admin: false,
        permissoes: { leads: ['view'] },
      })
      .select('id')
      .single()
    assertOk(groupError, 'grupo restrito')
    ids.group = group.id

    const { data: auth, error: authError } = await admin.auth.admin.createUser({
      email: restrictedEmail,
      password: restrictedPassword,
      email_confirm: true,
      user_metadata: { nome_completo: `Restrito ${suffix}`, role_global: 'operador' },
    })
    assertOk(authError, 'auth restrito')
    ids.auth = auth.user.id

    const { error: userError } = await admin.from('usuarios').insert({
      id: ids.auth,
      auth_user_id: ids.auth,
      email: restrictedEmail,
      nome_completo: `Restrito ${suffix}`,
      empresa_id: me.empresa_id,
      role_global: 'operador',
      grupo_id: ids.group,
      ativo: true,
      must_change_password: false,
    })
    assertOk(userError, 'perfil restrito')

    const ownLead = await admin
      .from('crm_leads')
      .insert({ empresa_id: me.empresa_id, nome: `${marker} Próprio ${suffix}` })
      .select('id')
      .single()
    assertOk(ownLead.error, 'lead próprio')
    ids.ownLead = ownLead.data.id
    const otherLead = await admin
      .from('crm_leads')
      .insert({ empresa_id: ids.otherTenant, nome: `${marker} Outro ${suffix}` })
      .select('id')
      .single()
    assertOk(otherLead.error, 'lead outro tenant')
    ids.otherLead = otherLead.data.id

    restricted = createClient(URL, ANON_KEY)
    const { error: loginError } = await restricted.auth.signInWithPassword({
      email: restrictedEmail,
      password: restrictedPassword,
    })
    assertOk(loginError, 'login restrito')

    const permissionChecks = await Promise.all([
      restricted.rpc('check_permission', { slug: 'leads', action: 'view' }),
      restricted.rpc('check_permission', { slug: 'leads', action: 'create' }),
      restricted.rpc('check_permission', { slug: 'canais', action: 'view' }),
    ])
    for (const check of permissionChecks) assertOk(check.error, 'check_permission')
    if (
      permissionChecks[0].data !== true ||
      permissionChecks[1].data !== false ||
      permissionChecks[2].data !== false
    ) {
      throw new Error(`Matriz RBAC divergente: ${permissionChecks.map((item) => item.data).join('/')}`)
    }

    const { data: ownVisible, error: ownError } = await restricted
      .from('crm_leads')
      .select('id')
      .eq('id', ids.ownLead)
      .eq('empresa_id', me.empresa_id)
    assertOk(ownError, 'ler lead permitido')
    if (ownVisible?.length !== 1) throw new Error('Lead permitido não ficou visível')

    const { data: otherVisible, error: otherError } = await restricted
      .from('crm_leads')
      .select('id')
      .eq('id', ids.otherLead)
      .eq('empresa_id', ids.otherTenant)
    assertOk(otherError, 'isolamento de lead')
    if ((otherVisible ?? []).length !== 0) throw new Error('RLS vazou lead de outro tenant')

    const deniedInsert = await restricted
      .from('crm_leads')
      .insert({ empresa_id: me.empresa_id, nome: `${marker} Negado ${suffix}` })
      .select('id')
      .maybeSingle()
    if (deniedInsert.data?.id) ids.deniedLead = deniedInsert.data.id
    if (!deniedInsert.error || deniedInsert.data) {
      throw new Error('RLS permitiu criar lead sem leads.create')
    }

    const { data: channels, error: channelError } = await restricted
      .from('crm_canais')
      .select('id')
      .eq('empresa_id', me.empresa_id)
      .limit(1)
    assertOk(channelError, 'listar canais restritos')
    if ((channels ?? []).length !== 0) throw new Error('RLS exibiu canal sem canais.view')
  } finally {
    if (restricted) await restricted.auth.signOut().catch(() => {})
    for (const [id, tenant] of [
      [ids.deniedLead, me.empresa_id],
      [ids.ownLead, me.empresa_id],
      [ids.otherLead, ids.otherTenant],
    ]) {
      if (id && tenant) await admin.from('crm_leads').delete().eq('id', id).eq('empresa_id', tenant)
    }
    if (ids.auth) {
      await admin.from('usuarios').delete().eq('id', ids.auth).eq('empresa_id', me.empresa_id)
      await admin.auth.admin.deleteUser(ids.auth)
    }
    if (ids.group) {
      await admin.from('grupos_acesso').delete().eq('id', ids.group).eq('empresa_id', me.empresa_id)
    }
    if (ids.otherTenant) {
      await admin.from('empresas').delete().eq('id', ids.otherTenant)
    }
  }
}

async function main() {
  mkdirSync(runDir, { recursive: true })
  console.log('\n[agent] Scripts Fase 3')
  appendEvent({ ts: new Date().toISOString(), type: 'log', message: 'Scripts Fase 3' })

  try {
    assertConfig()
    const admin = createClient(URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { client, me } = await loginPrincipal()
    await runCase('SCR-LEAD-01', () => scrLead01(client, me, admin))
    await runCase('SCR-CANAL-01', () => scrCanal01(client, me, admin))
    await runCase('SCR-RBAC-01', () => scrRbac01(me, admin))
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
    resolve(runDir, 'phase3-scripts-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  )
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
