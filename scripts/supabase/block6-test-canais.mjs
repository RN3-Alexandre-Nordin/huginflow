/**
 * Bloco 6 — canais inbound (dev) na Empresa Teste Go-Live.
 * Cria canal landing-page + roteamento e testa POST /api/inbound/leads.
 *
 * Uso: node scripts/supabase/block6-test-canais.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envLocal = resolve(root, '.env.local')

const EMPRESA_ID = '645679bd-3f41-4f7d-ba10-98d97cab2a46'
const PIPELINE_ID = '5b3a3415-d096-4a80-8c73-d6e2bf398bb4'
const STAGE_ID = '52842cdd-b560-48a5-a42e-09ed2dc2dc14'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function loadEnvLocal() {
  if (!existsSync(envLocal)) return {}
  const o = {}
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}

const env = loadEnvLocal()
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const suffix = Date.now().toString().slice(-6)
  const canalNome = `Canal Inbound Teste ${suffix}`
  const token = randomUUID()

  // 6.1 — criar canal inbound (landing-page)
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
  if (canalErr) throw new Error(`6.1 canal: ${canalErr.message}`)

  // 6.2 — roteamento funil/etapa
  const { error: routeErr } = await admin.from('crm_canais_roteamento').insert({
    canal_id: canal.id,
    org_id: EMPRESA_ID,
    pipeline_id: PIPELINE_ID,
    stage_id: STAGE_ID,
  })
  if (routeErr) throw new Error(`6.2 roteamento: ${routeErr.message}`)

  const { data: route } = await admin
    .from('crm_canais_roteamento')
    .select('pipeline_id, stage_id, org_id')
    .eq('canal_id', canal.id)
    .single()

  // 6.3 — API inbound token inválido
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
  const badJson = await badRes.json().catch(() => ({}))

  // 6.3 — API inbound token válido
  const payload = {
    nome: `Lead Inbound ${suffix}`,
    email: `inbound-${suffix}@teste.ragnar.dev`,
    telefone: `1198${suffix}`,
    mensagem: 'Mensagem de teste go-live bloco 6',
    token,
  }
  const goodRes = await fetch(`${APP_URL}/api/inbound/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const goodJson = await goodRes.json().catch(() => ({}))

  let leadOk = false
  let cardOk = false
  if (goodRes.status === 201 && goodJson.card_id) {
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
    leadOk =
      lead?.canal_id === canal.id &&
      lead?.empresa_id === EMPRESA_ID
    cardOk =
      card?.pipeline_id === PIPELINE_ID &&
      card?.stage_id === STAGE_ID &&
      card?.lead_id === goodJson.lead_id
  }

  const tests = {
    '6.1_criar_canal': Boolean(canal?.id) && canal.status === 'connected',
    '6.2_roteamento':
      route?.pipeline_id === PIPELINE_ID &&
      route?.stage_id === STAGE_ID &&
      route?.org_id === EMPRESA_ID,
    '6.3_token_invalido': badRes.status === 404,
    '6.3_api_inbound_ok': goodRes.status === 201 && goodJson.success === true,
    '6.3_lead_criado': leadOk,
    '6.3_card_no_funil': cardOk,
  }

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(`Falha: ${JSON.stringify({ tests, badRes: badRes.status, goodRes: goodRes.status, goodJson })}`)
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        canal_id: canal.id,
        canal_token: token,
        lead_id: goodJson.lead_id,
        card_id: goodJson.card_id,
        tests,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
