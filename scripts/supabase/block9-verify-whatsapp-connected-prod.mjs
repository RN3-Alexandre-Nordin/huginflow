/**
 * Valida WhatsApp conectado em PROD (pós-QR escaneado).
 * Uso: node scripts/supabase/block9-verify-whatsapp-connected-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
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
      pushName: 'Teste Real Go-Live',
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  }
}

async function main() {
  const env = loadEnv(envProd)
  const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
  const evoUrl = env.WHATSAPP_API_URL_PROD || 'https://evo.rn3.tec.br'
  const evoToken = env.WHATSAPP_API_TOKEN_PROD
  const APP_URL = getAppPublicUrl(env, { production: true })
  const instanceName = tenant.whatsapp_instance
  const canalId = tenant.whatsapp_canal_id
  const EMPRESA_ID = tenant.empresa_id

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, {
    headers: { apikey: evoToken },
  })
  const stateData = stateRes.ok ? await stateRes.json() : {}
  const evoState = stateData?.instance?.state || stateData?.state || 'unknown'

  const instRes = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
    headers: { apikey: evoToken },
  })
  const instData = instRes.ok ? await instRes.json() : []
  const inst = Array.isArray(instData) ? instData[0] : instData?.instance?.[0] || instData

  const { data: canal } = await admin
    .from('crm_canais')
    .select('id, status, provider_id, settings')
    .eq('id', canalId)
    .single()

  const suffix = Date.now().toString().slice(-6)
  const testPhone = `5511985${suffix}`
  const msgId = `golive-real-prod-${suffix}`

  const whRes = await fetch(`${APP_URL}/api/webhooks/evolution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      evolutionPayload(
        instanceName,
        testPhone,
        'Teste real pós-conexão: qual o prazo de entrega go-live?',
        msgId,
      ),
    ),
  })
  const whJson = await whRes.json().catch(() => ({}))
  await sleep(12000)

  const { data: lead } = await admin
    .from('crm_leads')
    .select('id, telefone, canal_id')
    .eq('empresa_id', EMPRESA_ID)
    .eq('telefone', testPhone)
    .maybeSingle()

  const { data: aiMsg } = await admin
    .from('crm_interacoes')
    .select('id, content, metadata')
    .eq('lead_id', lead?.id)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const tests = {
    '9.2_open': String(evoState).toLowerCase() === 'open',
    '9.2_canal_status':
      canal?.status === 'connected' || canal?.status === 'pairing' || evoState === 'open',
    '9.3_webhook_pos_conexao': whRes.ok && Boolean(lead?.id),
    '9.4_ia_pos_conexao': whJson.aiTriggered === true || aiMsg?.metadata?.is_ai === true,
  }

  console.log(
    JSON.stringify(
      {
        ok: Object.values(tests).every(Boolean),
        evoState,
        instance: {
          name: inst?.name || instanceName,
          owner: inst?.ownerJid || inst?.owner || null,
          profileName: inst?.profileName || null,
        },
        canal: { id: canal?.id, status: canal?.status },
        webhook: { status: whRes.status, body: whJson },
        lead_id: lead?.id,
        ai_preview: aiMsg?.content?.slice(0, 160),
        tests,
      },
      null,
      2,
    ),
  )

  if (!Object.values(tests).every(Boolean)) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
