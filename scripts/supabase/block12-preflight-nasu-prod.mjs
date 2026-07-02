/**
 * Bloco 12 — pré-voo go-live NASU em produção.
 * Verifica pré-requisitos antes da sessão com o cliente (sábado).
 *
 * Uso: node scripts/supabase/block12-preflight-nasu-prod.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envProd = resolve(root, '.env.production')

const NASU_EMPRESA_ID = '2b87fa27-a1da-4a6b-b7c9-8cfef5685ce7'
const APP_URL = 'https://app.ragnar.ia.br'

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

async function fetchHealth() {
  try {
    const res = await fetch(`${APP_URL}/api/health/omnichannel`, { signal: AbortSignal.timeout(15000) })
    return { status: res.status, body: await res.json() }
  } catch (e) {
    return { status: 0, error: e.message }
  }
}

async function main() {
  const env = loadEnv(envProd)
  const checks = {}

  // Health / infra
  const health = await fetchHealth()
  const h = health.body ?? {}
  checks['health_site'] = health.status === 200
  checks['health_evolution'] = h.checks?.evolutionReachable === true
  checks['health_openai'] = h.checks?.openaiApiKeyConfigured === true || h.openaiApiKeyConfigured === true
  checks['health_webhook_app'] = String(h.webhookUrl ?? '').includes('app.ragnar.ia.br')

  // Supabase NASU tenant (via MCP SQL would need service role — use fetch to REST if key present)
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.production')
    process.exit(1)
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  }

  async function count(table, filter) {
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`)
    url.searchParams.set('select', 'id')
    if (filter) Object.entries(filter).forEach(([k, v]) => url.searchParams.set(k, `eq.${v}`))
    const res = await fetch(url, { headers: { ...headers, Prefer: 'count=exact' } })
    const range = res.headers.get('content-range') ?? '*/0'
    const total = Number(range.split('/')[1] ?? 0)
    return { total, ok: res.ok, status: res.status }
  }

  const { data: empresa } = await fetch(
    `${supabaseUrl}/rest/v1/empresas?id=eq.${NASU_EMPRESA_ID}&select=id,nome,ativo,status,ai_model,ai_provider`,
    { headers },
  ).then((r) => r.json()).then((rows) => ({ data: rows?.[0] }))

  const usuarios = await count('usuarios', { empresa_id: NASU_EMPRESA_ID })
  const gestores = await fetch(
    `${supabaseUrl}/rest/v1/usuarios?empresa_id=eq.${NASU_EMPRESA_ID}&role_global=eq.admin&select=id,email`,
    { headers },
  ).then((r) => r.json())
  const operadores = await fetch(
    `${supabaseUrl}/rest/v1/usuarios?empresa_id=eq.${NASU_EMPRESA_ID}&role_global=eq.operador&select=id,email`,
    { headers },
  ).then((r) => r.json())
  const funis = await count('pipelines', { empresa_id: NASU_EMPRESA_ID })
  const canais = await count('crm_canais', { empresa_id: NASU_EMPRESA_ID })
  const grupos = await count('grupos_acesso', { empresa_id: NASU_EMPRESA_ID })

  checks['nasu_ativa'] = empresa?.ativo === true && empresa?.status === 'active'
  checks['nasu_openai'] = empresa?.ai_provider === 'openai' && String(empresa?.ai_model ?? '').startsWith('gpt')
  checks['nasu_gestor'] = Array.isArray(gestores) && gestores.length >= 1
  checks['nasu_operador'] = Array.isArray(operadores) && operadores.length >= 1
  checks['nasu_grupos'] = grupos.total >= 2
  checks['nasu_funil'] = funis.total >= 1
  checks['nasu_canal'] = canais.total >= 1

  const blockers = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  const ready = blockers.length === 0

  console.log(JSON.stringify({
    ok: ready,
    empresa_id: NASU_EMPRESA_ID,
    empresa_nome: empresa?.nome,
    ai_model: empresa?.ai_model,
    ai_provider: empresa?.ai_provider,
    counts: {
      usuarios: usuarios.total,
      gestores: gestores?.length ?? 0,
      operadores: operadores?.length ?? 0,
      funis: funis.total,
      canais: canais.total,
      grupos: grupos.total,
    },
    gestor_emails: gestores?.map((u) => u.email) ?? [],
    operador_emails: operadores?.map((u) => u.email) ?? [],
    health: {
      evolutionUrl: h.evolutionApiUrl,
      webhookUrl: h.webhookUrl,
      evolutionReachable: h.checks?.evolutionReachable,
    },
    checks,
    blockers,
    next_steps: ready
      ? ['Agendar sessão UAT Bloco 12 com gestor e operador NASU']
      : [
          !checks.health_evolution && 'Corrigir Evolution prod + deploy (Bloco 1 prod)',
          !checks.health_openai && 'Configurar OPENAI_API_KEY em prod + deploy',
          !checks.health_webhook_app && 'Webhook → app.ragnar.ia.br/api/webhooks/evolution',
          !checks.nasu_openai && 'Atualizar NASU: ai_provider=openai, ai_model=gpt-4o',
          !checks.nasu_gestor && 'Criar gestor NASU (block12-bootstrap-nasu-prod.mjs)',
          !checks.nasu_operador && 'Criar operador NASU (block12-bootstrap-nasu-prod.mjs)',
          !checks.nasu_funil && 'Criar funil padrão NASU',
          !checks.nasu_canal && 'Criar canal WhatsApp + QR (UI superadmin)',
        ].filter(Boolean),
  }, null, 2))

  if (!ready) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
