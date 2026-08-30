import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
function loadEnv(path) {
  const o = {}
  if (!existsSync(path)) return o
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}
const env = loadEnv(resolve(root, '.env.production'))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const NASU = '2b87fa27-a1da-4a6b-b7c9-8cfef5685ce7'
const testEmail = `probe.firstlogin.${Date.now()}@nasu.com.br`
const tempPass = 'TempProbe@2026'
const newPass = 'NewProbe@2026'

console.log('A) Cleanup orphan antonio.pereira@nasu.com.br')
{
  const orphanEmail = 'antonio.pereira@nasu.com.br'
  const { data: profile } = await admin.from('usuarios').select('id').eq('email', orphanEmail).maybeSingle()
  if (!profile) {
    let page = 1
    let orphanId = null
    while (page <= 10) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      const hit = data.users.find((u) => u.email?.toLowerCase() === orphanEmail)
      if (hit) { orphanId = hit.id; break }
      if (data.users.length < 200) break
      page++
    }
    if (orphanId) {
      const { error } = await admin.auth.admin.deleteUser(orphanId)
      console.log(error ? 'fail ' + error.message : 'deleted Auth orphan')
    } else console.log('no Auth orphan')
  } else console.log('profile already exists')
}

console.log('B) E2E createUsuario shape')
const { data: authData, error: authErr } = await admin.auth.admin.createUser({
  email: testEmail,
  password: tempPass,
  email_confirm: true,
  user_metadata: { nome_completo: 'Probe First Login', role_global: 'operador' },
})
if (authErr) throw authErr
const id = authData.user.id
const { error: insErr } = await admin.from('usuarios').insert([{
  id,
  auth_user_id: id,
  email: testEmail,
  nome_completo: 'Probe First Login',
  empresa_id: NASU,
  role_global: 'operador',
  must_change_password: true,
}])
if (insErr) {
  await admin.auth.admin.deleteUser(id)
  throw insErr
}
console.log('created', testEmail, 'must_change_password=true')

const { data: row } = await admin.from('usuarios').select('must_change_password').eq('id', id).single()
console.log('flag', row)

console.log('C) Login + clear flag (simula changeMyPassword)')
const login = await anon.auth.signInWithPassword({ email: testEmail, password: tempPass })
if (login.error) throw login.error
const upd = await anon.auth.updateUser({ password: newPass })
if (upd.error) throw upd.error
const { error: flagErr } = await admin.from('usuarios').update({ must_change_password: false }).eq('id', id)
if (flagErr) throw flagErr
const { data: after } = await admin.from('usuarios').select('must_change_password').eq('id', id).single()
console.log('after change', after)

console.log('D) Cleanup probe')
await admin.from('usuarios').delete().eq('id', id)
await admin.auth.admin.deleteUser(id)
console.log('probe removed')

console.log('E) Final inventory')
const { data: all } = await admin.from('usuarios').select('email,must_change_password').order('email')
console.table(all)
console.log('ALL GREEN')
