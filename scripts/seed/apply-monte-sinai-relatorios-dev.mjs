/**
 * Helper DEV: valida empresa Monte Sinai no .env.local e aponta o SQL de seed.
 * A aplicação do SQL é via MCP Supabase DEV (execute_sql) ou psql — não via PostgREST.
 *
 * Uso: node scripts/seed/apply-monte-sinai-relatorios-dev.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: resolve(root, '.env.local') })

const EMPRESA = '415854c0-84a4-489f-a357-2cc0142b6b65'
const sqlPath = resolve(root, 'scripts/seed/monte-sinai-relatorios-dev.sql')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local')
  process.exit(1)
}
if (!existsSync(sqlPath)) {
  console.error('SQL não encontrado:', sqlPath)
  process.exit(1)
}
if (/prod/i.test(url) && process.env.SEED_ALLOW_PROD !== '1') {
  console.error('URL parece PROD. Abortando. (SEED_ALLOW_PROD=1 só se consciente)')
  process.exit(1)
}

const client = createClient(url, key, { auth: { persistSession: false } })
const { data, error } = await client.from('empresas').select('id,nome').eq('id', EMPRESA).maybeSingle()
if (error) {
  console.error(error.message)
  process.exit(1)
}
console.log('Empresa:', data?.nome)
console.log('SQL:', sqlPath)
console.log('Aplique o arquivo no projeto DEV (MCP execute_sql / psql). Idempotente.')
process.exit(0)
