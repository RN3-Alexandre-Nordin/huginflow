/**
 * Apply must_change_password to prod + cleanup orphan Auth + verify.
 * Uses Contas token (Management API) or SUPABASE_DB_PASSWORD_PROD (pg).
 */
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../../..')
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

const env = {
  ...loadEnv(resolve(root, '.env.production')),
  ...loadEnv(resolve(root, '.env')),
  ...loadEnv(resolve(root, '.env.local')),
}

const SQL = `
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.usuarios.must_change_password IS
  'Quando true, o usuário deve alterar a senha antes de acessar o cockpit.';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('202608281200_usuarios_must_change_password', 'usuarios_must_change_password')
ON CONFLICT (version) DO NOTHING;

UPDATE public.usuarios
SET must_change_password = false
WHERE lower(email) IN (
  'vendedor@montesinaiatacado.com.br',
  'admin@montesinaiatacado.com.br',
  'logistica@montesinaiatacado.com.br',
  'financeiro@montesinaiatacado.com.br',
  'alexandre.nordin@nasu.com.br'
);
`

async function applyViaPg() {
  const dbPass = process.env.SUPABASE_DB_PASSWORD_PROD || env.SUPABASE_DB_PASSWORD_PROD
  if (!dbPass) return false
  const pgUrl = `postgresql://postgres.${PROD_REF}:${encodeURIComponent(dbPass)}@db.${PROD_REF}.supabase.co:5432/postgres`
  const client = new pg.Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(SQL)
    await client.query('COMMIT')
    console.log('OK DDL via Postgres')
    return true
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
}

async function applyViaManagementApi() {
  const contasPath = resolve(root, 'Contas Ragnar.txt')
  if (!existsSync(contasPath)) return false
  const contas = readFileSync(contasPath, 'utf8')
  const sbp = (contas.match(/sbp_[a-zA-Z0-9]+/) || [])[0]
  if (!sbp) return false

  const url = `https://api.supabase.com/v1/projects/${PROD_REF}/database/query`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sbp}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  })
  const text = await res.text()
  console.log('Management API status', res.status, text.slice(0, 400))
  return res.ok
}

async function main() {
  console.log('=== Apply must_change_password PROD ===')

  let applied = false
  try {
    applied = await applyViaPg()
  } catch (e) {
    console.warn('PG failed:', e.message)
  }
  if (!applied) {
    applied = await applyViaManagementApi()
  }
  if (!applied) {
    console.error('Não foi possível aplicar DDL (sem DB password nem Management API).')
    process.exit(1)
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // verify column
  const { data: sample, error: selErr } = await admin
    .from('usuarios')
    .select('email, must_change_password')
    .limit(5)
  if (selErr) {
    console.error('VERIFY FAIL:', selErr.message)
    process.exit(1)
  }
  console.log('VERIFY column OK sample:', sample)

  // cleanup orphan antonio auth-only
  const orphanEmail = 'antonio.pereira@nasu.com.br'
  const { data: profile } = await admin.from('usuarios').select('id').eq('email', orphanEmail).maybeSingle()
  if (!profile) {
    let page = 1
    let orphanId = null
    while (page <= 10) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      const hit = data.users.find((u) => u.email?.toLowerCase() === orphanEmail)
      if (hit) {
        orphanId = hit.id
        break
      }
      if (data.users.length < 200) break
      page++
    }
    if (orphanId) {
      const { error: delErr } = await admin.auth.admin.deleteUser(orphanId)
      console.log(delErr ? `ORPHAN delete FAIL: ${delErr.message}` : `ORPHAN Auth deleted: ${orphanEmail}`)
    } else {
      console.log('No orphan Auth for', orphanEmail)
    }
  } else {
    console.log('Profile already exists for', orphanEmail)
  }

  // test insert shape used by createUsuario
  const probe = await admin.from('usuarios').insert([{
    id: '00000000-0000-4000-8000-000000000099',
    auth_user_id: '00000000-0000-4000-8000-000000000099',
    email: 'probe-must-change@example.invalid',
    nome_completo: 'probe',
    empresa_id: '2b87fa27-a1da-4a6b-b7c9-8cfef5685ce7',
    role_global: 'operador',
    must_change_password: true,
  }]).select('id,must_change_password')
  if (probe.error) {
    console.error('PROBE insert FAIL (createUsuario still broken):', probe.error.message)
  } else {
    console.log('PROBE insert OK must_change_password=', probe.data?.[0]?.must_change_password)
    await admin.from('usuarios').delete().eq('id', '00000000-0000-4000-8000-000000000099')
    console.log('PROBE row cleaned')
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
