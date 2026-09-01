/**
 * Cria Antonio Pereira na NASU (prod) se ainda não existir.
 * Senha temporária: hugin123@2026 + must_change_password=true
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
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

const NASU = '2b87fa27-a1da-4a6b-b7c9-8cfef5685ce7'
const email = 'antonio.pereira@nasu.com.br'
const password = 'hugin123@2026'
const nome = 'Antônio Carlos Silva Pereira'
const grupoComercial = 'c3b0a6bb-a2fa-42fc-a7f6-1a3186564f29' // Comecial

const { data: existing } = await admin.from('usuarios').select('id,email').eq('email', email).maybeSingle()
if (existing) {
  console.log('Já existe perfil', existing)
  process.exit(0)
}

// remove auth orphan if any
{
  let page = 1
  while (page <= 10) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) {
      await admin.auth.admin.deleteUser(hit.id)
      console.log('Removed orphan Auth', hit.id)
      break
    }
    if (data.users.length < 200) break
    page++
  }
}

const { data: authData, error: authErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { nome_completo: nome, role_global: 'operador' },
})
if (authErr) throw authErr

const id = authData.user.id
const { error: insErr } = await admin.from('usuarios').insert([{
  id,
  auth_user_id: id,
  email,
  nome_completo: nome,
  empresa_id: NASU,
  role_global: 'operador',
  grupo_id: grupoComercial,
  must_change_password: true,
  ativo: true,
}])
if (insErr) {
  await admin.auth.admin.deleteUser(id)
  throw insErr
}

const login = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth.signInWithPassword({ email, password })
console.log(login.error ? 'LOGIN FAIL ' + login.error.message : 'LOGIN OK')
console.log(JSON.stringify({ email, password, must_change_password: true, id }, null, 2))
