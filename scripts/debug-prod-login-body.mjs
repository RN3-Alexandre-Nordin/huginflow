const APP = process.argv[2] || 'https://app.huginflow.com'
const EMAIL = 'admin@montesinaiatacado.com.br'
const PASSWORD = 'hugin123@2026'

const html = await (await fetch(`${APP}/login`)).text()
const m = html.match(/name="\$ACTION_ID_([^"]+)"/)
if (!m) {
  console.error('No ACTION_ID')
  process.exit(1)
}
const actionId = m[1]

for (const mode of ['plain', 'next-action']) {
  const form = new FormData()
  form.set(`$ACTION_ID_${actionId}`, '')
  form.set('email', EMAIL)
  form.set('password', PASSWORD)

  const headers = {}
  if (mode === 'next-action') {
    headers['Next-Action'] = actionId
    headers['Accept'] = 'text/x-component'
  }

  const res = await fetch(`${APP}/login`, {
    method: 'POST',
    headers,
    body: form,
    redirect: 'manual',
  })

  console.log(`\n=== ${mode} ===`)
  console.log('status:', res.status)
  console.log('location:', res.headers.get('location'))
  const text = await res.text()
  console.log('body (first 1200 chars):')
  console.log(text.slice(0, 1200))
}
