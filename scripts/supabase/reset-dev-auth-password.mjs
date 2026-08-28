/**
 * Redefine senha de login no Supabase DEV (após clone prod → dev).
 * Senhas do Auth não vêm no dump — use este script uma vez por e-mail.
 *
 * Uso:
 *   node scripts/supabase/reset-dev-auth-password.mjs admin@rn3.com.br "SuaSenhaDev"
 *   DEV_BOOTSTRAP_PASSWORD=xxx node scripts/supabase/reset-dev-auth-password.mjs admin@huginflow.com
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envLocal = resolve(root, '.env.local')

function loadEnvLocal() {
  if (!existsSync(envLocal)) return {}
  const o = {}
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}

const email = process.argv[2]?.trim().toLowerCase()
const password = process.argv[3] || process.env.DEV_BOOTSTRAP_PASSWORD

if (!email || !password) {
  console.error('Uso: node reset-dev-auth-password.mjs <email> <senha>')
  console.error('  ou: DEV_BOOTSTRAP_PASSWORD=... node reset-dev-auth-password.mjs <email>')
  process.exit(1)
}

const env = loadEnvLocal()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local')
  process.exit(1)
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 })
if (listErr) {
  console.error(listErr.message)
  process.exit(1)
}

const user = list.users.find((u) => u.email?.toLowerCase() === email)
if (!user) {
  console.error(`Usuário Auth não encontrado: ${email}`)
  console.error('E-mails no dev:', list.users.map((u) => u.email).filter(Boolean).join(', '))
  process.exit(1)
}

const { error } = await sb.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
})

if (error) {
  console.error('Erro ao atualizar senha:', error.message)
  process.exit(1)
}

const { data: perfil } = await sb
  .from('usuarios')
  .select('nome_completo, role_global, ativo')
  .eq('auth_user_id', user.id)
  .maybeSingle()

console.log(`OK: senha atualizada para ${email}`)
console.log(`  auth id: ${user.id}`)
if (perfil) {
  console.log(`  perfil: ${perfil.nome_completo} (${perfil.role_global}) ativo=${perfil.ativo}`)
} else {
  console.warn('  AVISO: sem linha em public.usuarios para este auth_user_id — login Auth OK, cockpit pode falhar.')
}
