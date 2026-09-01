/**
 * Valida os 4 usuários Monte Sinai — Supabase direto + app prod.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env.production') })

const USERS = [
  'admin@montesinaiatacado.com.br',
  'vendedor@montesinaiatacado.com.br',
  'logistica@montesinaiatacado.com.br',
  'financeiro@montesinaiatacado.com.br',
]
const PASSWORD = 'hugin123@2026'
const APP = 'https://app.huginflow.com'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

async function testDirect(email) {
  const sb = createClient(url, anon)
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) return { ok: false, error: error.message }
  await sb.auth.signOut()
  return { ok: true, id: data.user?.id?.slice(0, 8) }
}

async function testApp(email) {
  const form = new FormData()
  form.set('email', email)
  form.set('password', PASSWORD)
  const res = await fetch(`${APP}/api/auth/login`, { method: 'POST', body: form, redirect: 'manual' })
  const loc = res.headers.get('location')
  if (loc?.includes('/cockpit') && !loc.includes('0.0.0.0')) {
    return { ok: true, location: loc, cookies: (res.headers.getSetCookie?.() ?? []).length }
  }
  if (loc?.includes('error=')) {
    return { ok: false, error: decodeURIComponent(loc.split('error=')[1]?.split('&')[0] || ''), location: loc }
  }
  return { ok: false, error: `HTTP ${res.status}`, body: (await res.text()).slice(0, 100) }
}

async function checkUserAdmin(email) {
  if (!service) return { skip: true }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = list?.users?.find((u) => u.email?.toLowerCase() === email)
  if (!user) return { exists: false }
  return {
    exists: true,
    confirmed: Boolean(user.email_confirmed_at),
    banned: Boolean(user.banned_until),
    lastSignIn: user.last_sign_in_at,
  }
}

console.log('Projeto:', url)
console.log('Senha testada:', PASSWORD)
console.log('')

const loginHtml = await (await fetch(`${APP}/login`, { cache: 'no-store' })).text()
const usesApiRoute = loginHtml.includes('/api/auth/login')
console.log('Form login prod usa /api/auth/login:', usesApiRoute ? 'SIM' : 'NAO (deploy antigo?)')
console.log('')

let allOk = true

for (const email of USERS) {
  console.log('---', email, '---')
  const meta = await checkUserAdmin(email)
  if (meta.skip) console.log('[admin] service role ausente — pulando metadados')
  else if (!meta.exists) console.log('[admin] USUÁRIO NÃO EXISTE NO AUTH')
  else console.log('[admin] exists, confirmed:', meta.confirmed, '| banned:', meta.banned, '| last_sign_in:', meta.lastSignIn ?? 'nunca')

  const direct = await testDirect(email)
  console.log('[supabase]', direct.ok ? `OK (${direct.id}…)` : `FAIL — ${direct.error}`)

  const app = await testApp(email)
  console.log('[app]', app.ok ? `OK → ${app.location}` : `FAIL — ${app.error}`)
  if (app.location) console.log('       redirect:', app.location)

  if (!direct.ok || !app.ok) allOk = false
  console.log('')
}

process.exit(allOk ? 0 : 1)
