/**
 * Bloco 2 — login e sessão em PRODUÇÃO.
 * Usa credenciais de scripts/supabase/out/prod-test-tenant.json (bootstrap bloco 3).
 *
 * Uso: node scripts/supabase/block2-test-auth-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const APP_URL = env.NEXT_PUBLIC_APP_URL || 'https://app.ragnar.ia.br'

if (!url || !anonKey) {
  console.error('Configure Supabase em .env.production')
  process.exit(1)
}

if (!existsSync(tenantFile)) {
  console.error('Rode block3-bootstrap-test-empresa-prod.mjs antes')
  process.exit(1)
}

const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
const EMAIL = tenant.gestor_email
const PASSWORD = tenant.password
const TEMP_PASSWORD = `${PASSWORD}x`

const results = {}

function pass(id, note) {
  results[id] = { ok: true, note }
}

function fail(id, note) {
  results[id] = { ok: false, note }
}

async function test21() {
  const sb = createClient(url, anonKey)
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !data.session) {
    fail('2.1', error?.message || 'sem sessão')
    return null
  }
  pass('2.1', `sessão ${data.session.user.id.slice(0, 8)}…`)
  return sb
}

async function test22() {
  const sb = createClient(url, anonKey)
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: 'senha-invalida-xyz' })
  if (error && /invalid login credentials/i.test(error.message)) {
    pass('2.2', error.message)
  } else {
    fail('2.2', error?.message || 'esperava Invalid login credentials')
  }
}

async function test23() {
  const res = await fetch(`${APP_URL}/cockpit`, { redirect: 'manual' })
  const location = res.headers.get('location') || ''
  if (res.status === 307 || res.status === 302) {
    pass('2.3', `HTTP ${res.status} → ${location}`)
  } else {
    fail('2.3', `HTTP ${res.status}, location=${location}`)
  }
}

async function test24(sb) {
  const client = sb ?? createClient(url, anonKey)
  if (!sb) {
    const { error } = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    if (error) {
      fail('2.4', `login pré-signOut: ${error.message}`)
      return
    }
  }
  await client.auth.signOut()
  const { data } = await client.auth.getSession()
  if (!data.session) {
    pass('2.4', 'signOut → sem sessão')
  } else {
    fail('2.4', 'sessão ainda ativa após signOut')
  }
}

async function test25() {
  const sb = createClient(url, anonKey)
  const { error: loginErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (loginErr) {
    fail('2.5', `login: ${loginErr.message}`)
    return
  }

  const { error: updErr } = await sb.auth.updateUser({ password: TEMP_PASSWORD })
  if (updErr) {
    fail('2.5', `updateUser: ${updErr.message}`)
    return
  }

  await sb.auth.signOut()

  const sb2 = createClient(url, anonKey)
  const { error: newLoginErr } = await sb2.auth.signInWithPassword({
    email: EMAIL,
    password: TEMP_PASSWORD,
  })
  if (newLoginErr) {
    fail('2.5', `login nova senha: ${newLoginErr.message}`)
    return
  }

  const { error: revertErr } = await sb2.auth.updateUser({ password: PASSWORD })
  await sb2.auth.signOut()

  if (revertErr) {
    fail('2.5', `reverter senha: ${revertErr.message}`)
    return
  }

  const sb3 = createClient(url, anonKey)
  const { error: finalErr } = await sb3.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (finalErr) {
    fail('2.5', `login senha original: ${finalErr.message}`)
    return
  }
  await sb3.auth.signOut()
  pass('2.5', 'updateUser + login nova senha + revertido')
}

async function test26() {
  const res = await fetch(`${APP_URL}/login`)
  const html = await res.text()
  const hasForgot =
    /forgot-password/i.test(html) ||
    /esqueci\s+(a\s+)?senha/i.test(html)
  if (!hasForgot) {
    pass('2.6', 'sem link Esqueci senha / forgot-password')
  } else {
    fail('2.6', 'link Esqueci senha ainda presente')
  }

  const senhaRes = await fetch(`${APP_URL}/cockpit/minha-conta/senha`, { redirect: 'manual' })
  const senhaLoc = senhaRes.headers.get('location') || ''
  if (senhaRes.status === 307 || senhaRes.status === 302) {
    pass('2.5_route', `/cockpit/minha-conta/senha protegida → ${senhaLoc}`)
  } else {
    fail('2.5_route', `HTTP ${senhaRes.status} (esperava redirect sem sessão)`)
  }
}

async function main() {
  const sb = await test21()
  await test22()
  await test23()
  await test24(sb)
  await test25()
  await test26()

  const allOk = Object.entries(results)
    .filter(([k]) => k.startsWith('2.'))
    .every(([, v]) => v.ok)

  console.log(JSON.stringify({
    ok: allOk,
    app_url: APP_URL,
    gestor_email: EMAIL,
    tests: results,
  }, null, 2))

  if (!allOk) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
