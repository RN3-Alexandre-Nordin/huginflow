/**
 * Deploy produção: migration must_change_password + senhas Monte Sinai + flags.
 *
 * Requer em .env ou .env.production:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_DB_PASSWORD_PROD  (DDL via Postgres)
 *
 * Uso:
 *   node scripts/supabase/prod-deploy/deploy-first-login-prod.mjs
 */
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../../..')
const PROD_REF = 'zmypzexefjbovuknjlid'

config({ path: resolve(root, '.env.production') })
config({ path: resolve(root, '.env'), override: true })
config({ path: resolve(root, '.env.local'), override: true })

const MONTESINAI_EMAILS = [
  'vendedor@montesinaiatacado.com.br',
  'admin@montesinaiatacado.com.br',
  'logistica@montesinaiatacado.com.br',
  'financeiro@montesinaiatacado.com.br',
]
const PASSWORD = 'hugin123@2026'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbPass = process.env.SUPABASE_DB_PASSWORD_PROD

if (!url || !serviceKey) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

async function applyMigration() {
  if (!dbPass) {
    console.warn('SUPABASE_DB_PASSWORD_PROD ausente — pulando DDL (aplique a migration manualmente no SQL Editor).')
    return false
  }

  const migrationPath = resolve(root, 'supabase/migrations/202608281200_usuarios_must_change_password.sql')
  const sql = readFileSync(migrationPath, 'utf8').trim()
  const version = '202608281200_usuarios_must_change_password'
  const name = 'usuarios_must_change_password'

  const pgUrl = `postgresql://postgres.${PROD_REF}:${encodeURIComponent(dbPass)}@db.${PROD_REF}.supabase.co:5432/postgres`
  const client = new pg.Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ($1, $2)
       ON CONFLICT (version) DO NOTHING`,
      [version, name],
    )
    await client.query('COMMIT')
    console.log('OK migration:', version)
    return true
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (/already exists|duplicate column/i.test(err.message)) {
      console.log('Migration já aplicada (coluna existe).')
      return true
    }
    throw err
  } finally {
    await client.end()
  }
}

async function syncAuthAndFlags(sb) {
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) throw listErr

  for (const email of MONTESINAI_EMAILS) {
    const user = list.users.find((u) => u.email?.toLowerCase() === email)
    if (!user) {
      console.error('NOT FOUND Auth:', email)
      continue
    }

    const { error: pwErr } = await sb.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
    })
    if (pwErr) {
      console.error('FAIL senha', email, pwErr.message)
      continue
    }

    const { data: perfil, error: pErr } = await sb
      .from('usuarios')
      .select('id, empresa_id, nome_completo, role_global')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (pErr?.message?.includes('must_change_password')) {
      console.log('OK senha Auth', email, '(coluna must_change_password ainda não existe)')
      continue
    }

    if (perfil) {
      const { error: flagErr } = await sb
        .from('usuarios')
        .update({ must_change_password: false })
        .eq('id', perfil.id)
        .eq('empresa_id', perfil.empresa_id)

      if (flagErr) {
        console.error('FAIL flag', email, flagErr.message)
        continue
      }
      console.log('OK', email, '—', perfil.nome_completo, '| must_change_password=false')
    } else {
      console.log('OK senha Auth', email, '(sem perfil usuarios)')
    }
  }
}

async function verifyLogin(sbAnon) {
  const { error } = await sbAnon.auth.signInWithPassword({
    email: 'admin@montesinaiatacado.com.br',
    password: PASSWORD,
  })
  if (error) {
    console.error('Verificação login falhou:', error.message)
  } else {
    console.log('Verificação login OK: admin@montesinaiatacado.com.br')
    await sbAnon.auth.signOut()
  }
}

async function main() {
  console.log('=== Deploy first-login prod ===\n')
  await applyMigration()

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await syncAuthAndFlags(sb)

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (anonKey) {
    const sbAnon = createClient(url, anonKey)
    await verifyLogin(sbAnon)
  }

  console.log('\nConcluído.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
