/**
 * Fase 1 — scripts DEV: SCR-INFRA-01, SCR-AUTH-01, SCR-AUTH-02
 * Emite NDJSON em TEST_RUN_EVENTS_PATH e summary parcial em TEST_RUN_DIR/scripts-summary.json
 *
 * Uso standalone:
 *   node scripts/agent/phase1-scripts.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

for (const f of ['.env.local', '.env']) {
  const p = resolve(root, f)
  if (existsSync(p)) loadDotenv({ path: p, override: false })
}

const APP_URL = (
  process.env.TEST_BASE_URL ||
  process.env.MANUAL_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000'
).replace(/\/$/, '')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const EMAIL =
  process.env.TEST_EMAIL ||
  process.env.MANUAL_EMAIL ||
  'admin@montesinaiatacado.com.br'

const PASSWORD =
  process.env.TEST_PASSWORD ||
  process.env.MANUAL_PASSWORD ||
  (EMAIL.includes('montesinai') ? 'hugin123@2026' : 'HuginDevTest1!')

const CATALOG = {
  'SCR-INFRA-01': {
    area: 'Infraestrutura',
    expectation: 'App responde em /login e o health do omnichannel está saudável.',
    passos: 'GET /login (HTTP 200) e GET /api/health/omnichannel com healthy=true.',
  },
  'SCR-AUTH-01': {
    area: 'Auth (API)',
    expectation: 'Login Supabase com credencial válida cria sessão.',
    passos: 'signInWithPassword com e-mail/senha do tenant de teste; espera session.user.',
  },
  'SCR-AUTH-02': {
    area: 'Auth (API)',
    expectation: 'Senha errada é rejeitada pelo Auth.',
    passos: 'signInWithPassword com senha inválida; espera erro Invalid login credentials.',
  },
}

const cases = []
const eventsPath = process.env.TEST_RUN_EVENTS_PATH || ''
const runDir = process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes')

function appendEvent(ev) {
  if (!eventsPath) return
  try {
    mkdirSync(dirname(eventsPath), { recursive: true })
    writeFileSync(eventsPath, `${JSON.stringify(ev)}\n`, { flag: 'a' })
  } catch {
    /* ignore */
  }
}

function record(id, status, error) {
  const meta = CATALOG[id] || { area: 'Script', expectation: id, passos: '' }
  const row = {
    id,
    title: `[${id}] ${meta.expectation}`,
    area: meta.area,
    expectation: `[${id}] ${meta.expectation}`,
    passos: meta.passos,
    status,
    error,
    durationMs: 0,
  }
  cases.push(row)
  appendEvent({
    ts: new Date().toISOString(),
    type: 'test_start',
    id,
    title: row.title,
    area: row.area,
    expectation: row.expectation,
    passos: row.passos,
    message: row.expectation,
  })
  appendEvent({
    ts: new Date().toISOString(),
    type: 'test_end',
    id,
    title: row.title,
    area: row.area,
    expectation: row.expectation,
    passos: row.passos,
    status,
    error,
    message: row.expectation,
    passed: cases.filter((c) => c.status === 'passed').length,
    failed: cases.filter((c) => c.status === 'failed').length,
    skipped: cases.filter((c) => c.status === 'skipped').length,
  })
  const icon = status === 'passed' ? '✓' : '✗'
  console.log(`  ${icon} ${id} — ${meta.expectation}${error ? ` (${error})` : ''}`)
}

async function scrInfra01() {
  const t0 = Date.now()
  try {
    const loginRes = await fetch(`${APP_URL}/login`, { signal: AbortSignal.timeout(20000) })
    if (!loginRes.ok) {
      record('SCR-INFRA-01', 'failed', `/login HTTP ${loginRes.status}`)
      cases[cases.length - 1].durationMs = Date.now() - t0
      return
    }
    const healthRes = await fetch(`${APP_URL}/api/health/omnichannel`, {
      signal: AbortSignal.timeout(20000),
    })
    const body = await healthRes.json().catch(() => ({}))
    if (!healthRes.ok || body.healthy !== true) {
      record(
        'SCR-INFRA-01',
        'failed',
        `health HTTP ${healthRes.status}, healthy=${body.healthy}`,
      )
    } else {
      record('SCR-INFRA-01', 'passed')
    }
  } catch (e) {
    record('SCR-INFRA-01', 'failed', e instanceof Error ? e.message : String(e))
  }
  cases[cases.length - 1].durationMs = Date.now() - t0
}

async function scrAuth01() {
  const t0 = Date.now()
  if (!SUPABASE_URL || !ANON_KEY) {
    record('SCR-AUTH-01', 'failed', 'NEXT_PUBLIC_SUPABASE_URL / ANON_KEY ausentes')
    cases[cases.length - 1].durationMs = Date.now() - t0
    return
  }
  try {
    const sb = createClient(SUPABASE_URL, ANON_KEY)
    const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    if (error || !data.session) {
      record('SCR-AUTH-01', 'failed', error?.message || 'sem sessão')
    } else {
      await sb.auth.signOut()
      record('SCR-AUTH-01', 'passed')
    }
  } catch (e) {
    record('SCR-AUTH-01', 'failed', e instanceof Error ? e.message : String(e))
  }
  cases[cases.length - 1].durationMs = Date.now() - t0
}

async function scrAuth02() {
  const t0 = Date.now()
  if (!SUPABASE_URL || !ANON_KEY) {
    record('SCR-AUTH-02', 'failed', 'NEXT_PUBLIC_SUPABASE_URL / ANON_KEY ausentes')
    cases[cases.length - 1].durationMs = Date.now() - t0
    return
  }
  try {
    const sb = createClient(SUPABASE_URL, ANON_KEY)
    const { error } = await sb.auth.signInWithPassword({
      email: EMAIL,
      password: 'senha-errada-agent-fase1',
    })
    if (error && /invalid login credentials/i.test(error.message)) {
      record('SCR-AUTH-02', 'passed')
    } else {
      record('SCR-AUTH-02', 'failed', error?.message || 'esperava Invalid login credentials')
    }
  } catch (e) {
    record('SCR-AUTH-02', 'failed', e instanceof Error ? e.message : String(e))
  }
  cases[cases.length - 1].durationMs = Date.now() - t0
}

async function main() {
  mkdirSync(runDir, { recursive: true })
  appendEvent({
    ts: new Date().toISOString(),
    type: 'log',
    message: `Scripts Fase 1 · ${APP_URL}`,
  })
  console.log(`\n[agent] Scripts Fase 1 · ${APP_URL}`)

  await scrInfra01()
  await scrAuth01()
  await scrAuth02()

  const passed = cases.filter((c) => c.status === 'passed').length
  const failed = cases.filter((c) => c.status === 'failed').length
  const summary = {
    ambiente: 'DEV',
    baseUrl: APP_URL,
    result: failed === 0 ? 'PASS' : 'FAIL',
    summary: { passed, failed, skipped: 0, total: cases.length },
    cases,
  }
  writeFileSync(resolve(runDir, 'scripts-summary.json'), JSON.stringify(summary, null, 2), 'utf8')

  appendEvent({
    ts: new Date().toISOString(),
    type: 'log',
    message: `Scripts Fase 1: ${passed} passou, ${failed} falhou`,
  })

  if (failed > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
