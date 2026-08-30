import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PROD_REF = 'zmypzexefjbovuknjlid'

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
const contas = readFileSync(resolve(root, 'Contas Ragnar.txt'), 'utf8')
const sbp = (contas.match(/sbp_[a-zA-Z0-9]+/) || [])[0]
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sbp}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 300)}`)
  return json
}

console.log('1) Ensure migration recorded + flags')
await sql(`
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('202608281200_usuarios_must_change_password', 'usuarios_must_change_password')
ON CONFLICT (version) DO NOTHING;
`)
await sql(`
UPDATE public.usuarios
SET must_change_password = false
WHERE lower(email) IN (
  'vendedor@montesinaiatacado.com.br',
  'admin@montesinaiatacado.com.br',
  'logistica@montesinaiatacado.com.br',
  'financeiro@montesinaiatacado.com.br',
  'alexandre.nordin@nasu.com.br'
);
`)
await sql(`NOTIFY pgrst, 'reload schema'`)

console.log('2) Column + flags')
const { data: rows, error } = await admin
  .from('usuarios')
  .select('email, must_change_password, role_global, ativo')
  .order('email')
if (error) throw error
console.table(rows)

console.log('3) Probe createUsuario payload')
const probeId = '00000000-0000-4000-8000-000000000099'
const probe = await admin.from('usuarios').insert([{
  id: probeId,
  auth_user_id: probeId,
  email: 'probe-must-change@example.invalid',
  nome_completo: 'probe',
  empresa_id: '2b87fa27-a1da-4a6b-b7c9-8cfef5685ce7',
  role_global: 'operador',
  must_change_password: true,
}]).select('id,must_change_password')
if (probe.error) throw new Error('PROBE FAIL: ' + probe.error.message)
console.log('PROBE OK', probe.data)
await admin.from('usuarios').delete().eq('id', probeId)

console.log('4) Cleanup orphan antonio.pereira@nasu.com.br Auth-only')
const orphanEmail = 'antonio.pereira@nasu.com.br'
const { data: profile } = await admin.from('usuarios').select('id').eq('email', orphanEmail).maybeSingle()
if (profile) {
  console.log('Profile exists — leave as is')
} else {
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
    const { error: delErr } = await admin.auth.admin.deleteUser(orphanId)
    console.log(delErr ? 'delete fail ' + delErr.message : 'deleted Auth orphan ' + orphanEmail)
  } else {
    console.log('no Auth orphan')
  }
}

console.log('DONE — prod ready for first-login password change')
