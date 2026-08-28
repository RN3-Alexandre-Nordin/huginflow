/**
 * Bloco 6 — canais inbound em PRODUÇÃO (6.1–6.3).
 * Usa tenant de scripts/supabase/out/prod-test-tenant.json
 *
 * Uso: node scripts/supabase/block6-test-canais-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getAppPublicUrl, getWebhookUrl } from './_platform-env.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envProd = resolve(root, '.env.production')
const tenantFile = resolve(__dirname, 'out/prod-test-tenant.json')

function loadEnv(path) {
  if (!existsSync(path)) return {}
  const o = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}

const env = loadEnv(envProd)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const APP_URL = getAppPublicUrl(env, { production: true })

if (!url || !serviceKey) {
  console.error('Configure Supabase em .env.production')
  process.exit(1)
}

if (!existsSync(tenantFile)) {
  console.error('Rode block3/block4 em prod antes (prod-test-tenant.json)')
  process.exit(1)
}

const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
const EMPRESA_ID = tenant.empresa_id
const PIPELINE_ID = tenant.pipeline_id

if (!PIPELINE_ID) {
  console.error('pipeline_id ausente — rode block4-test-funil-cards-prod.mjs')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const results = {}

function pass(id, note) {
  results[id] = { ok: true, note }
}

function fail(id, note) {
  results[id] = { ok: false, note }
}

async function main() {
  const { data: stage, error: stageErr } = await admin
    .from('pipeline_stages')
    .select('id, nome')
    .eq('pipeline_id', PIPELINE_ID)
    .order('ordem')
    .limit(1)
    .single()
  if (stageErr || !stage) {
    throw new Error(`Etapa PROSPECÇÃO: ${stageErr?.message || 'não encontrada'}`)
  }

  const suffix = Date.now().toString().slice(-6)
  const canalNome = `Canal Inbound Teste ${suffix}`
  const token = randomUUID()

  const { data: canal, error: canalErr } = await admin
    .from('crm_canais')
    .insert({
      empresa_id: EMPRESA_ID,
      nome: canalNome,
      tipo: 'landing-page',
      provider: 'internal',
      provider_id: `lp_test_${suffix}`,
      status: 'connected',
      token,
    })
    .select('id, token, status')
    .single()
  if (canalErr) {
    fail('6.1', canalErr.message)
    throw new Error(canalErr.message)
  }
  pass('6.1', `${canal.id} · status ${canal.status}`)

  const { error: routeErr } = await admin.from('crm_canais_roteamento').insert({
    canal_id: canal.id,
    org_id: EMPRESA_ID,
    pipeline_id: PIPELINE_ID,
    stage_id: stage.id,
  })
  if (routeErr) {
    fail('6.2', routeErr.message)
  } else {
    const { data: route } = await admin
      .from('crm_canais_roteamento')
      .select('pipeline_id, stage_id, org_id')
      .eq('canal_id', canal.id)
      .single()
    if (
      route?.pipeline_id === PIPELINE_ID &&
      route?.stage_id === stage.id &&
      route?.org_id === EMPRESA_ID
    ) {
      pass('6.2', `${stage.nome} · pipeline ${PIPELINE_ID.slice(0, 8)}…`)
    } else {
      fail('6.2', JSON.stringify(route))
    }
  }

  const badRes = await fetch(`${APP_URL}/api/inbound/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Teste',
      email: 'x@test.com',
      telefone: '11999999999',
      token: 'token-invalido-xyz',
    }),
  })

  const payload = {
    nome: `Lead Inbound ${suffix}`,
    email: `inbound-${suffix}@teste.huginflow.com`,
    telefone: `1198${suffix}`,
    mensagem: 'Mensagem de teste go-live bloco 6 prod',
    token,
  }
  const goodRes = await fetch(`${APP_URL}/api/inbound/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const goodJson = await goodRes.json().catch(() => ({}))

  if (badRes.status === 404) {
    pass('6.3_token_invalido', 'HTTP 404')
  } else {
    fail('6.3_token_invalido', `HTTP ${badRes.status}`)
  }

  let leadOk = false
  let cardOk = false
  if (goodRes.status === 201 && goodJson.card_id) {
    pass('6.3', `POST 201 · lead ${goodJson.lead_id}`)
    const { data: lead } = await admin
      .from('crm_leads')
      .select('id, canal_id, empresa_id')
      .eq('id', goodJson.lead_id)
      .single()
    const { data: card } = await admin
      .from('crm_cards')
      .select('id, pipeline_id, stage_id, lead_id')
      .eq('id', goodJson.card_id)
      .single()
    leadOk = lead?.canal_id === canal.id && lead?.empresa_id === EMPRESA_ID
    cardOk =
      card?.pipeline_id === PIPELINE_ID &&
      card?.stage_id === stage.id &&
      card?.lead_id === goodJson.lead_id
    if (leadOk) pass('6.3b_lead', goodJson.lead_id)
    else fail('6.3b_lead', JSON.stringify(lead))
    if (cardOk) pass('6.3b_card', goodJson.card_id)
    else fail('6.3b_card', JSON.stringify(card))
  } else {
    fail('6.3', `HTTP ${goodRes.status} · ${JSON.stringify(goodJson)}`)
    fail('6.3b_lead', 'inbound falhou')
    fail('6.3b_card', 'inbound falhou')
  }

  tenant.canal_id = canal.id
  tenant.canal_token = token
  writeFileSync(tenantFile, JSON.stringify(tenant, null, 2))

  const allOk = Object.values(results).every((r) => r.ok)
  console.log(
    JSON.stringify(
      {
        ok: allOk,
        app_url: APP_URL,
        empresa_id: EMPRESA_ID,
        canal_id: canal.id,
        lead_id: goodJson.lead_id,
        card_id: goodJson.card_id,
        tests: results,
      },
      null,
      2,
    ),
  )
  if (!allOk) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
