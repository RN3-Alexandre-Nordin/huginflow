const APP = 'https://app.huginflow.com'
const html = await (await fetch(`${APP}/login`)).text()
const actionId = html.match(/name="\$ACTION_ID_([^"]+)"/)[1]

async function tryLogin(email, password, mode) {
  const form = new FormData()
  form.set(`$ACTION_ID_${actionId}`, '')
  form.set('email', email)
  form.set('password', password)
  const headers = {}
  if (mode === 'next-action') {
    headers['Next-Action'] = actionId
    headers['Accept'] = 'text/x-component'
  }
  const res = await fetch(`${APP}/login`, { method: 'POST', headers, body: form, redirect: 'manual' })
  const loc = res.headers.get('location')
  const text = await res.text()
  return { status: res.status, loc, hasError: loc?.includes('error=') || text.includes('incorretos'), preview: text.slice(0, 200) }
}

const wrongPlain = await tryLogin('admin@montesinaiatacado.com.br', 'wrongpass', 'plain')
const wrongAction = await tryLogin('admin@montesinaiatacado.com.br', 'wrongpass', 'next-action')
const okAction = await tryLogin('admin@montesinaiatacado.com.br', 'hugin123@2026', 'next-action')

console.log('wrong plain:', wrongPlain)
console.log('wrong next-action:', wrongAction)
console.log('ok next-action:', okAction)
