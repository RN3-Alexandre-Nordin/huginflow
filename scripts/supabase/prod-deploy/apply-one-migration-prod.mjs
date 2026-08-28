/**
 * Aplica uma migration SQL no Supabase de produção.
 *
 * Requer SUPABASE_DB_PASSWORD_PROD em .env ou variável de ambiente.
 *
 *   node scripts/supabase/prod-deploy/apply-one-migration-prod.mjs supabase/migrations/202607021930_knowledge_base_select_rls.sql
 */
import pg from 'pg'
import { config } from 'dotenv'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../../..')

config({ path: resolve(root, '.env.production') })
config({ path: resolve(root, '.env') })
config({ path: resolve(root, '.env.local'), override: true })

const PROD_REF = 'zmypzexefjbovuknjlid'
const migrationPath = process.argv[2]

if (!migrationPath) {
  console.error('Usage: node apply-one-migration-prod.mjs <path-to.sql>')
  process.exit(1)
}

const pass = process.env.SUPABASE_DB_PASSWORD_PROD
if (!pass) {
  console.error('Defina SUPABASE_DB_PASSWORD_PROD em .env')
  process.exit(1)
}

const absPath = resolve(root, migrationPath)
if (!existsSync(absPath)) {
  console.error(`Arquivo não encontrado: ${absPath}`)
  process.exit(1)
}

const sql = readFileSync(absPath, 'utf8').trim()
const version = basename(absPath, '.sql')
const name = version.replace(/^\d+_/, '')

const url = `postgresql://postgres.${PROD_REF}:${encodeURIComponent(pass)}@db.${PROD_REF}.supabase.co:5432/postgres`
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

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
  console.log(JSON.stringify({ ok: true, version, name, target: PROD_REF }, null, 2))
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2))
  process.exit(1)
} finally {
  await client.end()
}
