/** Simula login + acesso cockpit como browser. */
const APP = 'https://app.huginflow.com'
const EMAIL = process.argv[2] || 'admin@montesinaiatacado.com.br'
const PASSWORD = 'hugin123@2026'

const form = new FormData()
form.set('email', EMAIL)
form.set('password', PASSWORD)

const login = await fetch(`${APP}/api/auth/login`, { method: 'POST', body: form, redirect: 'manual' })
const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
const loc = login.headers.get('location')
console.log('login:', login.status, loc)

const cockpit = await fetch(`${APP}/cockpit`, {
  headers: { Cookie: cookies },
  redirect: 'manual',
})
console.log('cockpit:', cockpit.status, cockpit.headers.get('location'))

const finalUrl = cockpit.headers.get('location')
  ? new URL(cockpit.headers.get('location'), APP).href
  : `${APP}/cockpit`
const page = await fetch(finalUrl, { headers: { Cookie: cookies } })
const html = await page.text()
console.log('final status:', page.status)
console.log('has login form:', html.includes('Bem-vindo de volta'))
console.log('has acesso negado:', html.includes('acesso-negado') || html.includes('Acesso negado'))
console.log('has cockpit:', html.includes('Cockpit') || html.includes('cockpit'))
console.log('title snippet:', html.match(/<title>([^<]+)/)?.[1])
