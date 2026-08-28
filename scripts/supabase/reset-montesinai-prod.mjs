/**
 * Redefine senha dos operadores Monte Sinai em PROD.
 * Uso: node scripts/supabase/reset-montesinai-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: resolve(root, '.env.production') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = 'hugin123@2026'

const EMAILS = [
  'vendedor@montesinaiatacado.com.br',
  'admin@montesinaiatacado.com.br',
  'logistica@montesinaiatacado.com.br',
  'financeiro@montesinaiatacado.com.br',
]

if (!url || !key) {
  console.error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.production')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listErr) {
  console.error(listErr.message)
  process.exit(1)
}

for (const email of EMAILS) {
  const user = list.users.find((u) => u.email?.toLowerCase() === email)
  if (!user) {
    console.error('NOT FOUND:', email)
    continue
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: PASSWORD,
    email_confirm: true,
  })
  console.log(email, error ? `FAIL: ${error.message}` : 'OK')
}

console.log('\nSenha aplicada:', PASSWORD)
console.log('Projeto:', url)
