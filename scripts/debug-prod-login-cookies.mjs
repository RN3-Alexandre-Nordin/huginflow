const APP = 'https://app.huginflow.com'
const html = await (await fetch(`${APP}/login`)).text()
const actionId = html.match(/name="\$ACTION_ID_([^"]+)"/)[1]

const form = new FormData()
form.set(`$ACTION_ID_${actionId}`, '')
form.set('email', 'admin@montesinaiatacado.com.br')
form.set('password', 'hugin123@2026')

for (const mode of ['plain', 'next-action']) {
  const headers = {}
  if (mode === 'next-action') {
    headers['Next-Action'] = actionId
    headers['Accept'] = 'text/x-component'
  }
  const res = await fetch(`${APP}/login`, { method: 'POST', headers, body: form, redirect: 'manual' })
  const cookies = res.headers.getSetCookie?.() ?? []
  console.log(`\n${mode}: status=${res.status} location=${res.headers.get('location')}`)
  console.log('set-cookie count:', cookies.length)
  cookies.forEach((c, i) => console.log(`  [${i}]`, c.slice(0, 120)))
}
