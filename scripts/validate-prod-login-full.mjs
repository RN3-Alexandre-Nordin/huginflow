/**
 * Valida login ponta a ponta em prod via /api/auth/login.
 */
const APP = process.argv[2] || 'https://app.huginflow.com'
const EMAIL = process.argv[3] || 'admin@montesinaiatacado.com.br'
const PASSWORD = process.argv[4] || 'hugin123@2026'

const form = new FormData()
form.set('email', EMAIL)
form.set('password', PASSWORD)

const loginRes = await fetch(`${APP}/api/auth/login`, {
  method: 'POST',
  body: form,
  redirect: 'manual',
})

console.log('Login POST status:', loginRes.status)
const location = loginRes.headers.get('location')
console.log('Login Location:', location)

const rawCookies = loginRes.headers.getSetCookie?.() ?? []
const cookieHeader = rawCookies.map((c) => c.split(';')[0]).join('; ')
console.log('Cookies received:', rawCookies.length)

if (!location?.includes('/cockpit') || location.includes('0.0.0.0')) {
  console.error('FAIL: redirect inválido')
  process.exit(1)
}

const cockpitPath = location.startsWith('http') ? new URL(location).pathname : location
const cockpitRes = await fetch(`${APP}${cockpitPath}`, {
  headers: { Cookie: cookieHeader },
  redirect: 'manual',
})

console.log('Cockpit status:', cockpitRes.status)

if (cockpitRes.status === 200) {
  const body = await cockpitRes.text()
  const loggedIn = !body.includes('Bem-vindo de volta')
  console.log(loggedIn ? 'OK: sessão ativa no /cockpit' : 'FAIL: cockpit parece login')
  process.exit(loggedIn ? 0 : 1)
}

if (cockpitRes.headers.get('location')?.includes('login')) {
  console.error('FAIL: redirecionado de volta ao login')
  process.exit(1)
}

console.log('OK')
process.exit(0)
