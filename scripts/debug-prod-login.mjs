/** Testa login Monte Sinai contra Supabase e app prod. */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env.production') })

const EMAIL = 'admin@montesinaiatacado.com.br'
const PASSWORD = 'hugin123@2026'
const APP = process.argv[2] || 'https://app.huginflow.com'

function decodeJwtRef(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
    return payload.ref
  } catch {
    return null
  }
}

console.log('=== Supabase direto ===')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
console.log('URL ref:', url?.match(/https:\/\/([^.]+)/)?.[1])
console.log('Anon JWT ref:', decodeJwtRef(anon))
const sb = createClient(url, anon)
const { error: e1 } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
console.log('signIn:', e1?.message || 'OK')

console.log('\n=== App prod (server action) ===')
const loginHtml = await (await fetch(`${APP}/login`)).text()
const actionMatch = loginHtml.match(/name="\$ACTION_ID_([^"]+)"/)
if (!actionMatch) {
  console.log('ACTION_ID não encontrado no HTML')
  process.exit(1)
}
const actionId = actionMatch[1]
console.log('action id:', actionId.slice(0, 12) + '...')

const body = new URLSearchParams()
body.set(`$ACTION_ID_${actionId}`, '')
body.set('email', EMAIL)
body.set('password', PASSWORD)

const res = await fetch(`${APP}/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Next-Action': actionId,
  },
  body,
  redirect: 'manual',
})

console.log('HTTP', res.status)
console.log('Location:', res.headers.get('location') || '(none)')
const setCookie = res.headers.get('set-cookie')
console.log('Set-Cookie:', setCookie ? 'present' : 'none')
if (res.status === 200) {
  const text = await res.text()
  if (text.includes('E-mail ou senha incorretos') || text.includes('Invalid login')) {
    console.log('RESULT: login falhou (erro na página)')
  } else if (text.includes('error=')) {
    console.log('RESULT: possível erro no HTML')
  } else {
    console.log('RESULT: 200 sem redirect — verificar resposta')
  }
} else if (res.status >= 300 && res.status < 400) {
  const loc = res.headers.get('location') || ''
  if (loc.includes('/cockpit')) console.log('RESULT: login OK → cockpit')
  else if (loc.includes('error')) console.log('RESULT: redirect com erro:', loc)
  else console.log('RESULT: redirect:', loc)
}

console.log('\n=== Health ===')
const health = await (await fetch(`${APP}/api/health/omnichannel`)).json()
console.log('supabaseProjectRef:', health.supabaseProjectRef)
