/**
 * Valida login Monte Sinai em prod (Supabase direto + server action Next.js).
 * Uso: node scripts/validate-prod-login.mjs [appUrl]
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
]
const PASSWORD = 'hugin123@2026'
const APP = process.argv[2] || 'https://app.huginflow.com'

function decodeJwtRef(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).ref
  } catch {
    return null
  }
}

async function testSupabaseDirect(email) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) return { ok: false, error: error.message }
  await sb.auth.signOut()
  return { ok: true, userId: data.user?.id?.slice(0, 8) }
}

async function testAppLogin(email) {
  const form = new FormData()
  form.set('email', email)
  form.set('password', PASSWORD)

  const res = await fetch(`${APP}/api/auth/login`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
  })

  const location = res.headers.get('location')
  const setCookie = res.headers.getSetCookie?.() ?? []

  if (location?.includes('/cockpit')) {
    return { ok: true, location, hasCookie: setCookie.length > 0 }
  }

  if (location?.includes('error=')) {
    const err = decodeURIComponent(location.split('error=')[1]?.split('&')[0] || '')
    return { ok: false, error: err, location }
  }

  const text = await res.text()
  return {
    ok: false,
    error: `HTTP ${res.status}`,
    preview: text.slice(0, 200),
  }
}

console.log('App:', APP)
console.log('Supabase ref:', decodeJwtRef(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))

const health = await (await fetch(`${APP}/api/health/omnichannel`)).json()
console.log('Health keysAligned:', health.supabaseKeysAligned, '| url:', health.supabaseProjectRef, '| anon:', health.supabaseAnonKeyRef)
console.log('')

let allOk = true

for (const email of USERS) {
  const direct = await testSupabaseDirect(email)
  console.log(`[direct] ${email}:`, direct.ok ? `OK (${direct.userId}…)` : `FAIL — ${direct.error}`)

  const app = await testAppLogin(email)
  console.log(`[app]    ${email}:`, app.ok ? `OK → ${app.location} (cookie: ${app.hasCookie})` : `FAIL — ${app.error}`)
  if (app.location) console.log('         location:', app.location)
  if (!direct.ok || !app.ok) allOk = false
  console.log('')
}

process.exit(allOk ? 0 : 1)
