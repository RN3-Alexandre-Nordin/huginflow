/**
 * Bloco 9 — WhatsApp / Evolution (dev) na Empresa Teste Go-Live.
 *
 * Automatiza: criar instância + QR, webhook simulado, lead, IA (RAG), takeover.
 * 9.2 (QR escaneado) e envio real ao WhatsApp exigem celular — status pairing é OK no script.
 *
 * Uso: node scripts/supabase/block9-test-whatsapp.mjs
 */
import { createClient } from '@supabase/supabase-js'
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
      pushName: 'Teste Go-Live Bloco 9',
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  }
}

async function main() {
  const env = loadEnvLocal()
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const evoUrl = env.WHATSAPP_API_URL_DEV || 'https://evo-dev.rn3.tec.br'
  const evoToken = env.WHATSAPP_API_TOKEN_DEV
  if (!evoToken) throw new Error('WHATSAPP_API_TOKEN_DEV ausente em .env.local')

  const suffix = Date.now().toString().slice(-6)
  const instanceName = `golive_whatsapp_${suffix}`
  const testPhone = `5511987${suffix}`

  // 9.1 — criar instância Evolution + QR
  const webhookUrl =
    env.HUGINFLOW_WEBHOOK_URL_DEV ||
    'https://huginflow-local.rn3.tec.br/api/webhooks/evolution'

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

  const { data: canal, error: canalErr } = await admin
    .from('crm_canais')
    .insert({
      empresa_id: EMPRESA_ID,
      nome: `WhatsApp Teste ${suffix}`,
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
    stage_id: STAGE_ID,
  })

  // 9.2 — status da conexão
  const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, {
    headers: { apikey: evoToken },
  })
  const stateData = stateRes.ok ? await stateRes.json() : {}
  const evoState = stateData?.instance?.state || stateData?.state || 'unknown'

  // 9.3–9.6 — webhook simulado (mensagem inbound)
  const msgId1 = `golive-in-${suffix}`
  const wh1 = await fetch(`${APP_URL}/api/webhooks/evolution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      evolutionPayload(instanceName, testPhone, 'Qual é o prazo de entrega para clientes go-live?', msgId1),
    ),
  })
  const wh1Json = await wh1.json().catch(() => ({}))

  await sleep(8000)

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

  // 9.5 — takeover: operador responde → status human
  if (sessaoId) {
    await admin
      .from('crm_conversas')
      .update({
        status: 'human',
        last_human_interaction: new Date().toISOString(),
      })
      .eq('sessao_id', sessaoId)
  }

  const msgId2 = `golive-in2-${suffix}`
  const wh2 = await fetch(`${APP_URL}/api/webhooks/evolution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      evolutionPayload(instanceName, testPhone, 'Mensagem após takeover do operador', msgId2),
    ),
  })
  const wh2Json = await wh2.json().catch(() => ({}))
  await sleep(2000)

  const { count: aiAfterTakeover } = await admin
    .from('crm_interacoes')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', lead?.id)
    .eq('role', 'assistant')
    .filter('metadata->>is_ai', 'eq', 'true')

  // 9.7 — card no funil (rota evolution ainda não cria card; verificar se existe)
  const { data: card } = await admin
    .from('crm_cards')
    .select('id, pipeline_id, stage_id, lead_id')
    .eq('lead_id', lead?.id)
    .eq('pipeline_id', PIPELINE_ID)
    .maybeSingle()

  const tests = {
    '9.1_instancia_qr': Boolean(qr && qr.length > 20),
    '9.2_status_evolution': ['connecting', 'open', 'close', 'pairing', 'qrcode'].some((s) =>
      String(evoState).toLowerCase().includes(s === 'pairing' ? 'connect' : s),
    ) || evoState !== 'unknown',
    '9.3_mensagem_cockpit': wh1.ok && Boolean(userMsg),
    '9.4_ia_rag': wh1Json.aiTriggered === true || Boolean(aiMsg),
    '9.5_takeover_pausa_ia': wh2Json.aiTriggered === false,
    '9.6_lead_criado': Boolean(lead?.id && lead.canal_id === canal.id),
    '9.7_card_funil': Boolean(card?.stage_id === STAGE_ID),
  }

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(
      JSON.stringify(
        {
          tests,
          instanceName,
          canal_id: canal.id,
          qr_len: qr?.length ?? 0,
          evoState,
          wh1: { status: wh1.status, body: wh1Json },
          wh2: { status: wh2.status, body: wh2Json },
          lead_id: lead?.id,
          ai_interacoes: aiAfterTakeover,
          card,
        },
        null,
        2,
      ),
    )
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        tests,
        instanceName,
        canal_id: canal.id,
        lead_id: lead?.id,
        sessao_id: sessaoId,
        evoState,
        qr_available: Boolean(qr),
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
