/**
 * Bloco 9 — WhatsApp / Evolution em PRODUÇÃO (9.1–9.7).
 * Usa tenant de scripts/supabase/out/prod-test-tenant.json
 *
 * Uso: node scripts/supabase/block9-test-whatsapp-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function evolutionPayload(instanceName, phone, text, msgId) {
  return {
    event: 'MESSAGES_UPSERT',
    instance: instanceName,
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe: false,
        id: msgId,
      },
      pushName: 'Teste Go-Live Bloco 9 Prod',
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  }
}

const results = {}

function pass(id, note) {
  results[id] = { ok: true, note }
}

function fail(id, note) {
  results[id] = { ok: false, note }
}

async function main() {
  const env = loadEnv(envProd)
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const evoUrl = env.WHATSAPP_API_URL_PROD || 'https://evo.rn3.tec.br'
  const evoToken = env.WHATSAPP_API_TOKEN_PROD
  const webhookUrl =
    getWebhookUrl(env, { production: true })
  const APP_URL = getAppPublicUrl(env, { production: true })

  if (!url || !serviceKey || !evoToken) {
    console.error('Configure Supabase e Evolution em .env.production')
    process.exit(1)
  }
  if (!existsSync(tenantFile)) {
    console.error('Rode block3/block4 em prod antes')
    process.exit(1)
  }

  const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
  const EMPRESA_ID = tenant.empresa_id
  const PIPELINE_ID = tenant.pipeline_id
  if (!PIPELINE_ID) throw new Error('pipeline_id ausente no tenant')

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: stage, error: stageErr } = await admin
    .from('pipeline_stages')
    .select('id, nome')
    .eq('pipeline_id', PIPELINE_ID)
    .order('ordem')
    .limit(1)
    .single()
  if (stageErr || !stage) throw new Error(`Etapa: ${stageErr?.message || 'não encontrada'}`)

  const suffix = Date.now().toString().slice(-6)
  const instanceName = `golive_whatsapp_prod_${suffix}`
  const testPhone = `5511986${suffix}`

  const createRes = await fetch(`${evoUrl}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: evoToken },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        enabled: true,
        url: webhookUrl,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    }),
  })
  const createData = await createRes.json()
  if (!createRes.ok) {
    fail('9.1', JSON.stringify(createData))
    throw new Error(`9.1 evolution create: ${JSON.stringify(createData)}`)
  }

  let qr =
    createData?.qrcode?.base64 ||
    createData?.base64 ||
    createData?.qrcode ||
    null

  if (!qr) {
    const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
      headers: { apikey: evoToken },
    })
    const connectData = await connectRes.json()
    qr = connectData?.base64 || connectData?.qrcode?.base64 || connectData?.code || null
  }

  if (qr && qr.length > 20) {
    pass('9.1', `instância ${instanceName} · QR base64 OK`)
  } else {
    fail('9.1', `QR ausente (len=${qr?.length ?? 0})`)
  }

  const { data: canal, error: canalErr } = await admin
    .from('crm_canais')
    .insert({
      empresa_id: EMPRESA_ID,
      nome: `WhatsApp Teste Prod ${suffix}`,
      tipo: 'whatsapp',
      provider: 'evolution',
      provider_id: instanceName,
      provider_token: evoToken,
      status: 'pairing',
      settings: { apiUrl: evoUrl, instanceName },
      ia_config: { ativo: true, timeout: 0, prompt_base: '' },
    })
    .select('id')
    .single()
  if (canalErr) throw new Error(`canal db: ${canalErr.message}`)

  await admin.from('crm_canais_roteamento').insert({
    canal_id: canal.id,
    org_id: EMPRESA_ID,
    pipeline_id: PIPELINE_ID,
    stage_id: stage.id,
  })

  const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, {
    headers: { apikey: evoToken },
  })
  const stateData = stateRes.ok ? await stateRes.json() : {}
  const evoState = stateData?.instance?.state || stateData?.state || 'unknown'

  if (
    ['connecting', 'open', 'close', 'pairing', 'qrcode'].some((s) =>
      String(evoState).toLowerCase().includes(s === 'pairing' ? 'connect' : s),
    ) || evoState !== 'unknown'
  ) {
    pass('9.2', `state=${evoState}`)
  } else {
    fail('9.2', `state=${evoState}`)
  }

  const msgId1 = `golive-in-prod-${suffix}`
  const wh1 = await fetch(`${APP_URL}/api/webhooks/evolution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      evolutionPayload(
        instanceName,
        testPhone,
        'Qual é o prazo de entrega para clientes go-live?',
        msgId1,
      ),
    ),
  })
  const wh1Json = await wh1.json().catch(() => ({}))

  await sleep(10000)

  const { data: lead } = await admin
    .from('crm_leads')
    .select('id, telefone, canal_id')
    .eq('empresa_id', EMPRESA_ID)
    .eq('telefone', testPhone)
    .maybeSingle()

  const sessaoId = wh1Json.conversaId
  const { data: interacoes } = await admin
    .from('crm_interacoes')
    .select('id, role, content, metadata')
    .eq('lead_id', lead?.id)
    .order('created_at', { ascending: true })

  const userMsg = interacoes?.find((i) => i.role === 'user')
  const aiMsg = interacoes?.find((i) => i.role === 'assistant' && i.metadata?.is_ai === true)

  if (wh1.ok && userMsg) {
    pass('9.3', `interação user ${userMsg.id}`)
  } else {
    fail('9.3', `wh1=${wh1.status}, userMsg=${Boolean(userMsg)}`)
  }

  if (wh1Json.aiTriggered === true || aiMsg) {
    pass('9.4', wh1Json.aiTriggered ? 'aiTriggered=true' : `assistant ${aiMsg?.id}`)
  } else {
    fail('9.4', JSON.stringify({ aiTriggered: wh1Json.aiTriggered, aiMsg: Boolean(aiMsg) }))
  }

  if (sessaoId) {
    await admin
      .from('crm_conversas')
      .update({
        status: 'human',
        last_human_interaction: new Date().toISOString(),
      })
      .eq('sessao_id', sessaoId)
  }

  const msgId2 = `golive-in2-prod-${suffix}`
  const wh2 = await fetch(`${APP_URL}/api/webhooks/evolution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      evolutionPayload(instanceName, testPhone, 'Mensagem após takeover do operador', msgId2),
    ),
  })
  const wh2Json = await wh2.json().catch(() => ({}))
  await sleep(2000)

  if (wh2Json.aiTriggered === false) {
    pass('9.5', '2ª msg sem IA após status human')
  } else {
    fail('9.5', `aiTriggered=${wh2Json.aiTriggered}`)
  }

  if (lead?.id && lead.canal_id === canal.id) {
    pass('9.6', `lead ${lead.id}`)
  } else {
    fail('9.6', JSON.stringify(lead))
  }

  const { data: card } = await admin
    .from('crm_cards')
    .select('id, pipeline_id, stage_id, lead_id')
    .eq('lead_id', lead?.id)
    .eq('pipeline_id', PIPELINE_ID)
    .maybeSingle()

  if (card?.stage_id === stage.id) {
    pass('9.7', `card ${card.id} · ${stage.nome}`)
  } else {
    fail('9.7', JSON.stringify(card))
  }

  tenant.whatsapp_canal_id = canal.id
  tenant.whatsapp_instance = instanceName
  writeFileSync(tenantFile, JSON.stringify(tenant, null, 2))

  const allOk = Object.values(results).every((r) => r.ok)
  console.log(
    JSON.stringify(
      {
        ok: allOk,
        app_url: APP_URL,
        evo_url: evoUrl,
        tests: results,
        instanceName,
        canal_id: canal.id,
        lead_id: lead?.id,
        sessao_id: sessaoId,
        card_id: card?.id,
        evoState,
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
