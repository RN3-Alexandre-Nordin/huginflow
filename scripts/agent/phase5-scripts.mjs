/**
 * Fase 5 — analytics/BI tenant-safe.
 * Fixtures efêmeras, chamadas autenticadas e cleanup exato por empresa + IDs.
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
const TENANT_ID = process.env.TEST_TENANT_ID
const runKey = process.env.TEST_RUN_ID || randomUUID()
const marker = `[agent-phase5:${runKey}]`
const runDir =
  process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes', runKey)
const eventsPath = process.env.TEST_RUN_EVENTS_PATH || ''
const cases = []

const CATALOG = {
  'SCR-ANALYTICS-01': {
    area: 'Relatórios / Analytics',
    expectation: 'RPCs analytics respeitam tenant e filtros de departamento, canal e pipeline.',
    passos:
      'Cria dois departamentos isolados, cards, threads e mensagens; valida overview, KPIs, série, heatmap e bloqueios cross-tenant.',
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
  if (!TENANT_ID) missing.push('TEST_TENANT_ID')
  if (missing.length) throw new Error(`Preflight Fase 5: ausente ${missing.join(', ')}`)
  assertDevTarget()
}

function assertOk(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

async function removeExact(admin, table, tenantColumn, tenantId, ids, cleanupErrors) {
  if (!ids.length) return
  const { error } = await admin
    .from(table)
    .delete()
    .eq(tenantColumn, tenantId)
    .in('id', ids)
  if (error) cleanupErrors.push(`${table}: ${error.message}`)
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
    .eq('empresa_id', TENANT_ID)
    .single()
  assertOk(profileError, 'perfil')
  if (!me || me.empresa_id !== TENANT_ID || me.ativo === false || me.role_global === 'superadmin') {
    throw new Error('Fase 5 exige admin ativo vinculado exatamente a TEST_TENANT_ID')
  }
  return { client, me }
}

function numberAt(value, path) {
  let current = value
  for (const key of path) current = current?.[key]
  return Number(current ?? 0)
}

async function scrAnalytics01(client, me, admin) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const ids = {
    departments: [],
    pipelines: [],
    cards: [],
    threads: [randomUUID(), randomUUID()],
    interactions: [],
    conversations: [],
    channel: '',
    lead: '',
    otherTenant: '',
    restrictedGroup: '',
    restrictedAuth: '',
  }
  const cleanupErrors = []
  try {
    const { data: otherTenant, error: otherTenantError } = await admin
      .from('empresas')
      .insert({ nome: `${marker} Tenant negativo`, ativo: true, status: 'active' })
      .select('id')
      .single()
    assertOk(otherTenantError, 'tenant negativo analytics')
    ids.otherTenant = otherTenant.id

    const { data: departments, error: departmentsError } = await admin
      .from('departamentos')
      .insert([
        { empresa_id: me.empresa_id, nome: `${marker} Analytics A`, descricao: suffix },
        { empresa_id: me.empresa_id, nome: `${marker} Analytics B`, descricao: suffix },
      ])
      .select('id')
    assertOk(departmentsError, 'departamentos analytics')
    ids.departments.push(...departments.map((item) => item.id))

    const { data: pipelines, error: pipelinesError } = await admin
      .from('pipelines')
      .insert(
        ids.departments.map((departmentId, index) => ({
          empresa_id: me.empresa_id,
          departamento_id: departmentId,
          nome: `${marker} Pipeline ${index}`,
          is_public: true,
        })),
      )
      .select('id')
    assertOk(pipelinesError, 'pipelines analytics')
    ids.pipelines.push(...pipelines.map((item) => item.id))

    const { data: stages, error: stagesError } = await admin
      .from('pipeline_stages')
      .insert(
        ids.pipelines.map((pipelineId) => ({
          pipeline_id: pipelineId,
          nome: 'ANALYTICS',
          ordem: 0,
          cor: '#F97316',
        })),
      )
      .select('id, pipeline_id')
    assertOk(stagesError, 'stages analytics')

    const { data: channel, error: channelError } = await admin
      .from('crm_canais')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Analytics`,
        tipo: 'whatsapp',
        provider: 'simulator',
        provider_id: `phase5-${suffix}`,
        status: 'connected',
      })
      .select('id')
      .single()
    assertOk(channelError, 'canal analytics')
    ids.channel = channel.id

    const phone = `55116${Date.now().toString().slice(-8)}`
    const { data: lead, error: leadError } = await admin
      .from('crm_leads')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Lead`,
        telefone: phone,
        whatsapp: phone,
        canal_id: channel.id,
      })
      .select('id')
      .single()
    assertOk(leadError, 'lead analytics')
    ids.lead = lead.id

    const now = new Date()
    const openedA = new Date(now.getTime() - 10 * 60_000)
    const openedB = new Date(now.getTime() - 8 * 60_000)
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
    const { data: cards, error: cardsError } = await admin
      .from('crm_cards')
      .insert([
        {
          empresa_id: me.empresa_id,
          pipeline_id: pipelines[0].id,
          stage_id: stages.find((item) => item.pipeline_id === pipelines[0].id).id,
          lead_id: lead.id,
          titulo: `${marker} Ativo`,
          finalizado: false,
          data_prazo: yesterday,
          created_at: openedA.toISOString(),
          stage_entered_at: openedA.toISOString(),
        },
        {
          empresa_id: me.empresa_id,
          pipeline_id: pipelines[0].id,
          stage_id: stages.find((item) => item.pipeline_id === pipelines[0].id).id,
          lead_id: lead.id,
          titulo: `${marker} Fechado`,
          finalizado: true,
          valor: 321.45,
          created_at: openedA.toISOString(),
          updated_at: now.toISOString(),
          finalizado_em: now.toISOString(),
          stage_entered_at: openedA.toISOString(),
        },
      ])
      .select('id')
    assertOk(cardsError, 'cards analytics')
    ids.cards.push(...cards.map((item) => item.id))

    const resolvedA = new Date(openedA.getTime() + 300_000)
    const { error: threadsError } = await admin.from('crm_chat_threads').insert([
      {
        id: ids.threads[0],
        empresa_id: me.empresa_id,
        canal_id: channel.id,
        external_id: `${phone}-a`,
        lead_id: lead.id,
        card_id: cards[0].id,
        departamento_id: departments[0].id,
        pipeline_id: pipelines[0].id,
        status: 'closed',
        opened_at: openedA.toISOString(),
        created_at: openedA.toISOString(),
        updated_at: resolvedA.toISOString(),
        closed_at: resolvedA.toISOString(),
        resolved_at: resolvedA.toISOString(),
        first_response_at: new Date(openedA.getTime() + 60_000).toISOString(),
        first_response_role: 'assistant',
        message_count_inbound: 1,
        message_count_outbound: 1,
      },
      {
        id: ids.threads[1],
        empresa_id: me.empresa_id,
        canal_id: channel.id,
        external_id: `${phone}-b`,
        lead_id: lead.id,
        departamento_id: departments[1].id,
        pipeline_id: pipelines[1].id,
        status: 'human',
        opened_at: openedB.toISOString(),
        created_at: openedB.toISOString(),
        updated_at: now.toISOString(),
        first_response_at: new Date(openedB.getTime() + 120_000).toISOString(),
        first_response_role: 'assistant',
        message_count_inbound: 1,
        message_count_outbound: 1,
      },
    ])
    assertOk(threadsError, 'threads analytics')

    const interactionRows = ids.threads.flatMap((threadId, index) => {
      const opened = index === 0 ? openedA : openedB
      const seconds = index === 0 ? 60 : 120
      return [
        {
          empresa_id: me.empresa_id,
          lead_id: lead.id,
          conversa_id: threadId,
          contact_phone: `${phone}-${index}`,
          contact_name: `${marker} ${index}`,
          role: 'user',
          content: `${marker} inbound ${index}`,
          created_at: opened.toISOString(),
        },
        {
          empresa_id: me.empresa_id,
          lead_id: lead.id,
          conversa_id: threadId,
          contact_phone: `${phone}-${index}`,
          contact_name: `${marker} ${index}`,
          role: 'assistant',
          content: `${marker} outbound ${index}`,
          created_at: new Date(opened.getTime() + seconds * 1000).toISOString(),
        },
      ]
    })
    const { data: interactions, error: interactionsError } = await admin
      .from('crm_interacoes')
      .insert(interactionRows)
      .select('id')
    assertOk(interactionsError, 'interações analytics')
    ids.interactions.push(...interactions.map((item) => item.id))

    const { data: conversations, error: conversationsError } = await admin
      .from('crm_conversas')
      .insert(
        ids.threads.map((threadId, index) => ({
          sessao_id: threadId,
          empresa_id: me.empresa_id,
          canal_id: channel.id,
          lead_id: lead.id,
          external_id: `${phone}-${index}`,
          role: 'user',
          direcao: 'inbound',
          content: `${marker} snapshot ${index}`,
          last_message: `${marker} snapshot ${index}`,
          status: index === 0 ? 'closed' : 'human',
          created_at: (index === 0 ? openedA : openedB).toISOString(),
          updated_at: now.toISOString(),
        })),
      )
      .select('id')
    assertOk(conversationsError, 'conversas analytics')
    ids.conversations.push(...conversations.map((item) => item.id))

    const start = new Date(now.getTime() - 60 * 60_000).toISOString()
    const end = new Date(now.getTime() + 60 * 60_000).toISOString()
    const filtersA = {
      departamento_ids: [departments[0].id],
      canal_ids: [channel.id],
      pipeline_ids: [pipelines[0].id],
    }
    const common = { p_empresa_id: me.empresa_id, p_data_inicio: start, p_data_fim: end }

    const overview = await client.rpc('fn_analytics_overview', {
      ...common,
      p_filtros: filtersA,
    })
    assertOk(overview.error, 'overview analytics')
    if (
      overview.data?.empresa_id !== me.empresa_id ||
      numberAt(overview.data, ['threads_novas_periodo']) !== 1 ||
      numberAt(overview.data, ['crm', 'cards_ativos']) !== 1 ||
      numberAt(overview.data, ['crm', 'cards_atrasados']) !== 1 ||
      Math.abs(numberAt(overview.data, ['crm', 'receita_fechada_periodo']) - 321.45) > 0.001
    ) {
      throw new Error(`Overview divergente: ${JSON.stringify(overview.data)}`)
    }

    const kpisA = await client.rpc('fn_analytics_conversations_kpis', {
      ...common,
      p_filtros: filtersA,
    })
    assertOk(kpisA.error, 'KPIs analytics A')
    if (
      numberAt(kpisA.data, ['kpis', 'conversas', 'valor']) !== 1 ||
      numberAt(kpisA.data, ['kpis', 'mensagens_recebidas', 'valor']) !== 1 ||
      numberAt(kpisA.data, ['kpis', 'contagem_resolucao', 'valor']) !== 1 ||
      numberAt(kpisA.data, ['kpis', 'tempo_primeira_resposta_seg', 'valor']) !== 60
    ) {
      throw new Error(`KPIs A divergentes: ${JSON.stringify(kpisA.data)}`)
    }

    const filtersB = {
      departamento_ids: [departments[1].id],
      canal_ids: [channel.id],
      pipeline_ids: [pipelines[1].id],
    }
    const kpisB = await client.rpc('fn_analytics_conversations_kpis', {
      ...common,
      p_filtros: filtersB,
    })
    assertOk(kpisB.error, 'KPIs analytics B')
    if (
      numberAt(kpisB.data, ['kpis', 'conversas', 'valor']) !== 1 ||
      numberAt(kpisB.data, ['kpis', 'mensagens_recebidas', 'valor']) !== 1 ||
      numberAt(kpisB.data, ['kpis', 'contagem_resolucao', 'valor']) !== 0
    ) {
      throw new Error(`KPIs B divergentes: ${JSON.stringify(kpisB.data)}`)
    }

    const daily = await client.rpc('fn_analytics_conversations_daily', {
      ...common,
      p_filtros: filtersA,
    })
    assertOk(daily.error, 'série diária analytics')
    const dailyTotals = (daily.data ?? []).reduce(
      (sum, row) => ({
        conversations: sum.conversations + Number(row.conversas ?? 0),
        messages: sum.messages + Number(row.mensagens_recebidas ?? 0),
        resolutions: sum.resolutions + Number(row.resolucoes ?? 0),
      }),
      { conversations: 0, messages: 0, resolutions: 0 },
    )
    if (
      dailyTotals.conversations !== 1 ||
      dailyTotals.messages !== 1 ||
      dailyTotals.resolutions !== 1
    ) {
      throw new Error(`Série diária divergente: ${JSON.stringify(dailyTotals)}`)
    }

    const heatmap = await client.rpc('fn_analytics_traffic_heatmap', {
      ...common,
      p_filtros: filtersA,
    })
    assertOk(heatmap.error, 'heatmap analytics')
    const heatmapTotal = (heatmap.data?.cells ?? []).reduce(
      (sum, cell) => sum + Number(cell.count ?? 0),
      0,
    )
    if (heatmapTotal !== 1 || Number(heatmap.data?.max_count ?? 0) !== 1) {
      throw new Error(`Heatmap divergente: ${JSON.stringify(heatmap.data)}`)
    }

    const crossTenant = await client.rpc('fn_analytics_overview', {
      ...common,
      p_empresa_id: ids.otherTenant,
      p_filtros: {},
    })
    const crossTenantDenied =
      crossTenant.error &&
      (crossTenant.error.code === '42501' ||
        /não é permitido operar em outra empresa/i.test(crossTenant.error.message))
    if (!crossTenantDenied) {
      throw new Error(
        `RPC analytics não bloqueou outro tenant com SQLSTATE 42501: ${JSON.stringify(crossTenant)}`,
      )
    }

    const helper = await client.rpc('fn_analytics_period_metrics', {
      p_empresa_id: me.empresa_id,
      p_inicio: start,
      p_fim: end,
      p_depto_ids: [],
      p_canal_ids: [],
    })
    if (!helper.error) throw new Error('Helper interno analytics permaneceu executável')

    const anonymous = createClient(URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const anonymousCall = await anonymous.rpc('fn_analytics_overview', {
      ...common,
      p_filtros: {},
    })
    if (!anonymousCall.error) throw new Error('RPC analytics aceitou chamada anônima')

    const restrictedEmail = `phase5-analytics-${suffix}@teste.huginflow.com`
    const restrictedPassword = `P5!${randomUUID()}aA`
    const { data: restrictedGroup, error: restrictedGroupError } = await admin
      .from('grupos_acesso')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Sem relatórios`,
        is_admin: false,
        permissoes: { leads: ['view'] },
      })
      .select('id')
      .single()
    assertOk(restrictedGroupError, 'grupo sem relatórios')
    ids.restrictedGroup = restrictedGroup.id
    const { data: restrictedAuth, error: restrictedAuthError } =
      await admin.auth.admin.createUser({
        email: restrictedEmail,
        password: restrictedPassword,
        email_confirm: true,
        user_metadata: { nome_completo: `Analytics Restrito ${suffix}`, role_global: 'operador' },
      })
    assertOk(restrictedAuthError, 'auth sem relatórios')
    ids.restrictedAuth = restrictedAuth.user.id
    const { error: restrictedProfileError } = await admin.from('usuarios').insert({
      id: ids.restrictedAuth,
      auth_user_id: ids.restrictedAuth,
      empresa_id: me.empresa_id,
      email: restrictedEmail,
      nome_completo: `Analytics Restrito ${suffix}`,
      role_global: 'operador',
      grupo_id: ids.restrictedGroup,
      ativo: true,
      must_change_password: false,
    })
    assertOk(restrictedProfileError, 'perfil sem relatórios')
    const restricted = createClient(URL, ANON_KEY)
    const { error: restrictedLoginError } = await restricted.auth.signInWithPassword({
      email: restrictedEmail,
      password: restrictedPassword,
    })
    assertOk(restrictedLoginError, 'login sem relatórios')
    const restrictedCall = await restricted.rpc('fn_analytics_overview', {
      ...common,
      p_filtros: {},
    })
    if (!restrictedCall.error || !/sem permissão/i.test(restrictedCall.error.message)) {
      throw new Error('RPC analytics ignorou relatorios.view')
    }
    await restricted.auth.signOut()
  } finally {
    if (ids.restrictedAuth) {
      const profileDelete = await admin
        .from('usuarios')
        .delete()
        .eq('id', ids.restrictedAuth)
        .eq('empresa_id', me.empresa_id)
      if (profileDelete.error) cleanupErrors.push(`usuario restrito: ${profileDelete.error.message}`)
      const authDelete = await admin.auth.admin.deleteUser(ids.restrictedAuth)
      if (authDelete.error) cleanupErrors.push(`auth restrito: ${authDelete.error.message}`)
    }
    if (ids.restrictedGroup) {
      const groupDelete = await admin
        .from('grupos_acesso')
        .delete()
        .eq('id', ids.restrictedGroup)
        .eq('empresa_id', me.empresa_id)
      if (groupDelete.error) cleanupErrors.push(`grupo restrito: ${groupDelete.error.message}`)
    }
    await removeExact(admin, 'crm_conversas', 'empresa_id', me.empresa_id, ids.conversations, cleanupErrors)
    await removeExact(admin, 'crm_interacoes', 'empresa_id', me.empresa_id, ids.interactions, cleanupErrors)
    await removeExact(admin, 'crm_chat_threads', 'empresa_id', me.empresa_id, ids.threads, cleanupErrors)
    await removeExact(admin, 'crm_cards', 'empresa_id', me.empresa_id, ids.cards, cleanupErrors)
    if (ids.lead) await removeExact(admin, 'crm_leads', 'empresa_id', me.empresa_id, [ids.lead], cleanupErrors)
    if (ids.channel) await removeExact(admin, 'crm_canais', 'empresa_id', me.empresa_id, [ids.channel], cleanupErrors)
    await removeExact(admin, 'pipelines', 'empresa_id', me.empresa_id, ids.pipelines, cleanupErrors)
    await removeExact(admin, 'departamentos', 'empresa_id', me.empresa_id, ids.departments, cleanupErrors)
    if (ids.otherTenant) {
      const result = await admin.from('empresas').delete().eq('id', ids.otherTenant)
      if (result.error) cleanupErrors.push(`empresas: ${result.error.message}`)
    }
    if (cleanupErrors.length) throw new Error(`Cleanup Fase 5: ${cleanupErrors.join('; ')}`)
  }
}

async function main() {
  mkdirSync(runDir, { recursive: true })
  console.log('\n[agent] Scripts Fase 5')
  appendEvent({ ts: new Date().toISOString(), type: 'log', message: 'Scripts Fase 5' })
  const started = Date.now()
  try {
    assertConfig()
    const admin = createClient(URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { client, me } = await loginPrincipal()
    try {
      await scrAnalytics01(client, me, admin)
      record('SCR-ANALYTICS-01', 'passed', undefined, Date.now() - started)
    } catch (error) {
      record(
        'SCR-ANALYTICS-01',
        'failed',
        error instanceof Error ? error.message : String(error),
        Date.now() - started,
      )
    }
    await client.auth.signOut()
  } catch (error) {
    record(
      'SCR-ANALYTICS-01',
      'failed',
      error instanceof Error ? error.message : String(error),
      Date.now() - started,
    )
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
    resolve(runDir, 'phase5-scripts-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  )
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
