/**
 * Fase 4 — RAG, simulador, WhatsApp sintético e dashboard.
 * Não cria instância Evolution, não envia mensagem externa e não exige IA paga.
 */
import { createHash, randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { assertDevTarget } from './test-env-guard.mjs'
import { config as loadDotenv } from 'dotenv'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

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
const marker = `[agent-phase4:${runKey}]`
const runDir =
  process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes', runKey)
const eventsPath = process.env.TEST_RUN_EVENTS_PATH || ''
const cases = []

const CATALOG = {
  'SCR-RAG-01': {
    area: 'Base de conhecimento / RAG',
    expectation: 'Fonte, storage, vetor 3072 e busca semântica respeitam tenant e RBAC.',
    passos:
      'Cria fonte e PDF efêmeros, grava vetor determinístico, consulta match_knowledge_base e valida cascade/cleanup.',
  },
  'SCR-SIM-01': {
    area: 'Simulador IA',
    expectation: 'Mensagem fora de escopo gera resposta auditável sem chamar WhatsApp real.',
    passos:
      'Usa o simulador pela UI com telefone sintético, valida resposta, sessão e reasoning, e remove os artefatos.',
  },
  'SCR-WA-01': {
    area: 'WhatsApp / webhook',
    expectation: 'Webhook sintético cria lead, card e histórico sem IA nem envio externo.',
    passos:
      'Cria canal Evolution fictício com IA desligada, posta inbound textual e valida persistência tenant-safe.',
  },
  'SCR-DASH-01': {
    area: 'Dashboard gestor',
    expectation: 'KPIs e séries do gestor refletem deltas determinísticos da operação.',
    passos:
      'Cria cards/conversas efêmeros e confirma deltas de ativos, vendas, gargalo, chats e buckets.',
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
  if (missing.length) throw new Error(`Preflight Fase 4: ausente ${missing.join(', ')}`)
  assertDevTarget()
}

function assertOk(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
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

async function loginPrincipal() {
  const client = createClient(URL, ANON_KEY)
  const { data: auth, error } = await client.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  assertOk(error, 'login')
  const { data: me, error: profileError } = await client
    .from('usuarios')
    .select('id, empresa_id, role_global, ativo')
    .eq('auth_user_id', auth.user.id)
    .eq('empresa_id', EXPECTED_TENANT)
    .single()
  assertOk(profileError, 'perfil')
  if (!me?.empresa_id || me.ativo === false || me.role_global === 'superadmin') {
    throw new Error('Fase 4 exige admin ativo de tenant, não superadmin')
  }
  if (EXPECTED_TENANT !== me.empresa_id) {
    throw new Error(`Tenant ${me.empresa_id} difere de TEST_TENANT_ID`)
  }
  return { client, me }
}

async function deleteIds(admin, table, tenantColumn, tenantId, ids) {
  if (!ids.length) return
  const { error } = await admin
    .from(table)
    .delete()
    .eq(tenantColumn, tenantId)
    .in('id', ids)
  assertOk(error, `cleanup ${table}`)
}

async function scrRag01(client, me, admin) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const ids = { source: '', chunk: '', otherTenant: '' }
  const pdf = Buffer.from(`%PDF-1.4\n${marker} conhecimento ${suffix}\n%%EOF`, 'utf8')
  let storagePath = ''
  try {
    const { data: source, error: sourceError } = await client
      .from('knowledge_sources')
      .insert({
        organization_id: me.empresa_id,
        file_name: `phase4-${suffix}.pdf`,
        category: 'Testes',
      })
      .select('id')
      .single()
    assertOk(sourceError, 'criar fonte RAG')
    ids.source = source.id
    storagePath = `${me.empresa_id}/${source.id}/phase4-${suffix}.pdf`

    const { error: uploadError } = await client.storage
      .from('knowledge_documents')
      .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: false })
    assertOk(uploadError, 'upload RAG')

    const content = `${marker} O código determinístico é ${suffix}.`
    const { error: updateError } = await client
      .from('knowledge_sources')
      .update({
        content_text: content,
        mime_type: 'application/pdf',
        storage_path: storagePath,
      })
      .eq('id', source.id)
      .eq('organization_id', me.empresa_id)
    assertOk(updateError, 'atualizar fonte RAG')

    const embedding = Array(3072).fill(0)
    embedding[0] = 1
    const { data: chunk, error: chunkError } = await client
      .from('knowledge_base')
      .insert({
        organization_id: me.empresa_id,
        source_id: source.id,
        content,
        embedding,
      })
      .select('id')
      .single()
    assertOk(chunkError, 'criar chunk RAG')
    ids.chunk = chunk.id

    const { data: matches, error: matchError } = await client.rpc('match_knowledge_base', {
      query_embedding: embedding,
      match_threshold: 0.9,
      match_count: 5,
      org_id: me.empresa_id,
    })
    assertOk(matchError, 'busca semântica')
    if (!(matches ?? []).some((item) => item.id === chunk.id || item.content === content)) {
      throw new Error('Chunk determinístico não retornou na busca semântica')
    }

    const { data: downloaded, error: downloadError } = await client.storage
      .from('knowledge_documents')
      .download(storagePath)
    assertOk(downloadError, 'download RAG')
    const actual = Buffer.from(await downloaded.arrayBuffer())
    if (createHash('sha256').update(actual).digest('hex') !== createHash('sha256').update(pdf).digest('hex')) {
      throw new Error('Arquivo RAG baixado difere do upload')
    }

    const { data: otherTenant, error: otherTenantError } = await admin
      .from('empresas')
      .insert({ nome: `${marker} Tenant RAG ${suffix}`, ativo: true, status: 'active' })
      .select('id')
      .single()
    assertOk(otherTenantError, 'criar tenant negativo RAG')
    ids.otherTenant = otherTenant.id
    const denied = await client.from('knowledge_sources').insert({
      organization_id: otherTenant.id,
      file_name: `${marker} negado`,
      category: 'Testes',
    })
    if (!denied.error) throw new Error('RLS permitiu fonte em outro tenant')

    await client.storage.from('knowledge_documents').remove([storagePath])
    storagePath = ''
    const { error: deleteError } = await client
      .from('knowledge_sources')
      .delete()
      .eq('id', source.id)
      .eq('organization_id', me.empresa_id)
    assertOk(deleteError, 'excluir fonte RAG')
    const { count } = await admin
      .from('knowledge_base')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', source.id)
      .eq('organization_id', me.empresa_id)
    if ((count ?? 0) !== 0) throw new Error('Cascade dos chunks não ocorreu')
    ids.source = ''
    ids.chunk = ''
  } finally {
    if (storagePath) await admin.storage.from('knowledge_documents').remove([storagePath])
    await deleteIds(admin, 'knowledge_base', 'organization_id', me.empresa_id, ids.chunk ? [ids.chunk] : [])
    await deleteIds(admin, 'knowledge_sources', 'organization_id', me.empresa_id, ids.source ? [ids.source] : [])
    if (ids.otherTenant) await admin.from('empresas').delete().eq('id', ids.otherTenant)
  }
}

async function cleanupPhone(admin, tenantId, phone) {
  const { data: leads } = await admin
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', tenantId)
    .eq('telefone', phone)
  const leadIds = (leads ?? []).map((item) => item.id)
  const { data: conversations } = await admin
    .from('crm_conversas')
    .select('id, sessao_id')
    .eq('empresa_id', tenantId)
    .eq('external_id', phone)
  const sessionIds = [...new Set((conversations ?? []).map((item) => item.sessao_id).filter(Boolean))]
  await admin
    .from('crm_phone_active_speaker')
    .delete()
    .eq('empresa_id', tenantId)
    .eq('external_id', phone)
  await admin.from('crm_interacoes').delete().eq('empresa_id', tenantId).eq('contact_phone', phone)
  await deleteIds(admin, 'crm_conversas', 'empresa_id', tenantId, (conversations ?? []).map((item) => item.id))
  await deleteIds(admin, 'crm_chat_threads', 'empresa_id', tenantId, sessionIds)
  if (leadIds.length) {
    const { data: cards } = await admin
      .from('crm_cards')
      .select('id')
      .eq('empresa_id', tenantId)
      .in('lead_id', leadIds)
    await deleteIds(admin, 'crm_cards', 'empresa_id', tenantId, (cards ?? []).map((item) => item.id))
    await deleteIds(admin, 'crm_leads', 'empresa_id', tenantId, leadIds)
  }
}

async function scrSim01(me, admin) {
  const suffix = Date.now().toString().slice(-9)
  const phone = `5511${suffix}`
  let persistedPhone = phone
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ baseURL: APP_URL, locale: 'pt-BR' })
  const page = await context.newPage()
  try {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.fill('#email', EMAIL)
    await page.fill('#password', PASSWORD)
    await Promise.all([
      page.waitForURL(/\/cockpit/, { timeout: 60_000 }),
      page.click('#login-submit'),
    ])
    await page.goto('/cockpit/crm/simulador', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => {
      return document
        .querySelector('[data-testid="cockpit-sidebar-toggle"]')
        ?.getAttribute('data-sidebar-ready') === 'true'
    })
    await page.getByTestId('simulator-name').fill(`${marker} Cliente`)
    const phoneInput = page.getByTestId('simulator-phone')
    await phoneInput.fill(phone)
    persistedPhone = (await phoneInput.inputValue()).replace(/\D/g, '')
    const messageInput = page.getByTestId('simulator-input')
    await messageInput.fill('Qual a previsão do tempo para amanhã?')
    await page.waitForFunction(() => {
      const button = document.querySelector(
        '[data-testid="simulator-send"]',
      )
      return button instanceof HTMLButtonElement && !button.disabled
    })
    await page.getByTestId('simulator-send').click()
    const assistant = page.locator(
      '[data-testid="simulator-message"][data-message-role="assistant"]',
    )
    await assistant.waitFor({ state: 'visible', timeout: 60_000 })
    const response = (await assistant.innerText()).trim()
    if (response.length < 12) throw new Error('Resposta fora de escopo vazia')

    const { data: leads } = await admin
      .from('crm_leads')
      .select('id')
      .eq('empresa_id', me.empresa_id)
      .eq('telefone', persistedPhone)
    if (leads?.length !== 1) throw new Error(`Simulador criou ${leads?.length ?? 0} leads`)
    const { data: interactions } = await admin
      .from('crm_interacoes')
      .select('role, log_sistema, metadata')
      .eq('empresa_id', me.empresa_id)
      .eq('contact_phone', persistedPhone)
    const roles = new Set((interactions ?? []).map((item) => item.role))
    if (!roles.has('user') || !roles.has('system') || !roles.has('assistant')) {
      throw new Error('Histórico do simulador não contém user/system/assistant')
    }
    if (!(interactions ?? []).some((item) => item.metadata?.crm_status === 'FORA_ESCOPO')) {
      throw new Error('Reasoning FORA_ESCOPO não foi persistido')
    }
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
    await cleanupPhone(admin, me.empresa_id, persistedPhone)
  }
}

function evolutionPayload(instance, phone, content, id, fromMe = false) {
  return {
    event: 'MESSAGES_UPSERT',
    instance,
    data: {
      key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe, id },
      pushName: `${marker} WhatsApp`,
      message: { conversation: content },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  }
}

async function scrWa01(client, me, admin) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const instance = `phase4_${suffix}`
  const phone = `55119${Date.now().toString().slice(-8)}`
  const ids = { pipeline: '', channel: '', route: '' }
  try {
    const { data: pipeline, error: pipelineError } = await client
      .from('pipelines')
      .insert({ empresa_id: me.empresa_id, nome: `${marker} WA`, is_public: true })
      .select('id')
      .single()
    assertOk(pipelineError, 'funil WhatsApp')
    ids.pipeline = pipeline.id
    const { data: stage, error: stageError } = await client
      .from('pipeline_stages')
      .insert({ pipeline_id: pipeline.id, nome: 'ENTRADA', ordem: 0, cor: '#2BAADF' })
      .select('id')
      .single()
    assertOk(stageError, 'etapa WhatsApp')

    const { data: channel, error: channelError } = await client
      .from('crm_canais')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Evolution`,
        tipo: 'whatsapp',
        provider: 'evolution',
        provider_id: instance,
        provider_token: 'phase4-not-a-real-token',
        status: 'connected',
        ia_config: { ativo: false, enabled: false },
      })
      .select('id')
      .single()
    assertOk(channelError, 'canal WhatsApp')
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
    assertOk(routeError, 'rota WhatsApp')
    ids.route = route.id

    const unknown = await fetch(`${APP_URL}/api/webhooks/evolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evolutionPayload(`unknown_${suffix}`, phone, 'teste', `bad-${suffix}`)),
      signal: AbortSignal.timeout(20_000),
    })
    if (unknown.status !== 403) throw new Error(`Instância desconhecida retornou ${unknown.status}`)

    const own = await fetch(`${APP_URL}/api/webhooks/evolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evolutionPayload(instance, phone, 'própria', `own-${suffix}`, true)),
      signal: AbortSignal.timeout(20_000),
    })
    const ownPayload = await own.json()
    if (!own.ok || ownPayload.status !== 'ignored') throw new Error('Mensagem própria não foi ignorada')

    const response = await fetch(`${APP_URL}/api/webhooks/evolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        evolutionPayload(instance, phone, `${marker} inbound`, `in-${suffix}`),
      ),
      signal: AbortSignal.timeout(30_000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.aiTriggered !== false || !payload.leadId || !payload.conversaId) {
      throw new Error(`Webhook inválido HTTP ${response.status}: ${JSON.stringify(payload)}`)
    }

    const { data: lead, error: leadError } = await client
      .from('crm_leads')
      .select('id, canal_id')
      .eq('id', payload.leadId)
      .eq('empresa_id', me.empresa_id)
      .single()
    assertOk(leadError, 'lead WhatsApp')
    const { data: card, error: cardError } = await client
      .from('crm_cards')
      .select('id, pipeline_id, stage_id')
      .eq('lead_id', lead.id)
      .eq('empresa_id', me.empresa_id)
      .single()
    assertOk(cardError, 'card WhatsApp')
    const { data: interaction, error: interactionError } = await client
      .from('crm_interacoes')
      .select('role, metadata')
      .eq('empresa_id', me.empresa_id)
      .eq('contact_phone', phone)
      .eq('role', 'user')
      .single()
    assertOk(interactionError, 'interação WhatsApp')
    if (
      lead.canal_id !== channel.id ||
      card.pipeline_id !== pipeline.id ||
      card.stage_id !== stage.id ||
      interaction.metadata?.provider_message_id !== `in-${suffix}`
    ) {
      throw new Error('Persistência WhatsApp divergiu da fixture')
    }
  } finally {
    await cleanupPhone(admin, me.empresa_id, phone)
    if (ids.route) {
      await admin
        .from('crm_canais_roteamento')
        .delete()
        .eq('id', ids.route)
        .eq('org_id', me.empresa_id)
    }
    if (ids.channel) await deleteIds(admin, 'crm_canais', 'empresa_id', me.empresa_id, [ids.channel])
    if (ids.pipeline) await deleteIds(admin, 'pipelines', 'empresa_id', me.empresa_id, [ids.pipeline])
  }
}

async function dashboardMetrics(client, tenantId) {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  const [active, sales, chats, stages] = await Promise.all([
    client.from('crm_cards').select('id', { count: 'exact', head: true }).eq('empresa_id', tenantId).eq('finalizado', false),
    client.from('crm_cards').select('valor').eq('empresa_id', tenantId).eq('finalizado', true).gte('updated_at', start.toISOString()),
    client.from('crm_conversas').select('sessao_id').eq('empresa_id', tenantId).gte('created_at', start.toISOString()),
    client.from('crm_cards').select('stage_id').eq('empresa_id', tenantId).eq('finalizado', false),
  ])
  for (const [name, result] of Object.entries({ active, sales, chats, stages })) {
    assertOk(result.error, `dashboard ${name}`)
  }
  const stageCounts = new Map()
  for (const item of stages.data ?? []) {
    stageCounts.set(item.stage_id, (stageCounts.get(item.stage_id) ?? 0) + 1)
  }
  return {
    active: active.count ?? 0,
    sales: (sales.data ?? []).reduce((sum, item) => sum + Number(item.valor ?? 0), 0),
    chats: new Set((chats.data ?? []).map((item) => item.sessao_id).filter(Boolean)).size,
    bottlenecks: [...stageCounts.values()].filter((count) => count >= 3).length,
  }
}

async function scrDash01(client, me, admin) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const ids = { pipeline: '', channel: '', lead: '', cards: [], conversations: [] }
  try {
    const baseline = await dashboardMetrics(client, me.empresa_id)
    const { data: pipeline, error: pipelineError } = await client
      .from('pipelines')
      .insert({ empresa_id: me.empresa_id, nome: `${marker} Dashboard`, is_public: true })
      .select('id')
      .single()
    assertOk(pipelineError, 'funil dashboard')
    ids.pipeline = pipeline.id
    const { data: stage, error: stageError } = await client
      .from('pipeline_stages')
      .insert({ pipeline_id: pipeline.id, nome: 'MÉTRICA', ordem: 0, cor: '#80B828' })
      .select('id')
      .single()
    assertOk(stageError, 'etapa dashboard')
    const now = new Date().toISOString()
    const rows = Array.from({ length: 5 }, (_, index) => ({
      empresa_id: me.empresa_id,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      titulo: `${marker} KPI ${index}`,
      finalizado: index >= 3,
      valor: index >= 3 ? (index - 2) * 100 : 0,
      created_at: now,
      updated_at: now,
      stage_entered_at: now,
    }))
    const { data: cards, error: cardsError } = await client
      .from('crm_cards')
      .insert(rows)
      .select('id')
    assertOk(cardsError, 'cards dashboard')
    ids.cards.push(...cards.map((item) => item.id))

    const { data: channel, error: channelError } = await client
      .from('crm_canais')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Dashboard`,
        tipo: 'whatsapp',
        provider: 'simulator',
        provider_id: `dash-${suffix}`,
        status: 'connected',
      })
      .select('id')
      .single()
    assertOk(channelError, 'canal dashboard')
    ids.channel = channel.id
    const { data: lead, error: leadError } = await client
      .from('crm_leads')
      .insert({ empresa_id: me.empresa_id, nome: `${marker} Dashboard`, telefone: `55117${Date.now().toString().slice(-8)}` })
      .select('id')
      .single()
    assertOk(leadError, 'lead dashboard')
    ids.lead = lead.id
    const sessions = [randomUUID(), randomUUID()]
    const { data: conversations, error: conversationsError } = await client
      .from('crm_conversas')
      .insert(sessions.map((session, index) => ({
        sessao_id: session,
        empresa_id: me.empresa_id,
        canal_id: channel.id,
        lead_id: lead.id,
        external_id: `dash-${suffix}-${index}`,
        role: 'user',
        direcao: 'inbound',
        content: `${marker} dashboard`,
        last_message: `${marker} dashboard`,
        status: 'human',
        created_at: now,
        updated_at: now,
      })))
      .select('id')
    assertOk(conversationsError, 'conversas dashboard')
    ids.conversations.push(...conversations.map((item) => item.id))

    const after = await dashboardMetrics(client, me.empresa_id)
    if (
      after.active - baseline.active !== 3 ||
      after.sales - baseline.sales !== 300 ||
      after.chats - baseline.chats !== 2 ||
      after.bottlenecks - baseline.bottlenecks !== 1
    ) {
      throw new Error(`Deltas dashboard inválidos: ${JSON.stringify({ baseline, after })}`)
    }
    const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    if ([6, 7, days].some((length) => !Number.isInteger(length) || length < 6)) {
      throw new Error('Buckets dia/semana/mês inválidos')
    }
  } finally {
    await deleteIds(admin, 'crm_conversas', 'empresa_id', me.empresa_id, ids.conversations)
    await deleteIds(admin, 'crm_cards', 'empresa_id', me.empresa_id, ids.cards)
    if (ids.lead) await deleteIds(admin, 'crm_leads', 'empresa_id', me.empresa_id, [ids.lead])
    if (ids.channel) await deleteIds(admin, 'crm_canais', 'empresa_id', me.empresa_id, [ids.channel])
    if (ids.pipeline) await deleteIds(admin, 'pipelines', 'empresa_id', me.empresa_id, [ids.pipeline])
  }
}

async function main() {
  mkdirSync(runDir, { recursive: true })
  console.log('\n[agent] Scripts Fase 4')
  appendEvent({ ts: new Date().toISOString(), type: 'log', message: 'Scripts Fase 4' })
  try {
    assertConfig()
    const admin = createClient(URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { client, me } = await loginPrincipal()
    await runCase('SCR-RAG-01', () => scrRag01(client, me, admin))
    await runCase('SCR-SIM-01', () => scrSim01(me, admin))
    await runCase('SCR-WA-01', () => scrWa01(client, me, admin))
    await runCase('SCR-DASH-01', () => scrDash01(client, me, admin))
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
    resolve(runDir, 'phase4-scripts-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  )
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
