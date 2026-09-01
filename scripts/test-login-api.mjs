const APP = process.argv[2] || 'http://localhost:3000'
const EMAIL = process.argv[3] || 'admin@montesinaiatacado.com.br'
const PASSWORD = process.argv[4] || 'hugin123@2026'

const form = new FormData()
form.set('email', EMAIL)
form.set('password', PASSWORD)

const res = await fetch(`${APP}/api/auth/login`, {
  method: 'POST',
  body: form,
  redirect: 'manual',
})

console.log('status:', res.status)
console.log('location:', res.headers.get('location'))
console.log('cookies:', (res.headers.getSetCookie?.() ?? []).length)

if (res.headers.get('location')?.includes('/cockpit')) {
  console.log('OK')
  process.exit(0)
}
console.log('FAIL')
process.exit(1)
