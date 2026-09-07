/**
 * Redefine senha Auth + limpa must_change_password.
 * Uso (não imprime a senha):
 *   node scripts/supabase/set-user-password.mjs --env .env.local email@x.com 'Senha'
 *   node scripts/supabase/set-user-password.mjs --env .env.production email@x.com 'Senha'
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const args = process.argv.slice(2)
const envIdx = args.indexOf('--env')
const envFile = envIdx >= 0 ? args[envIdx + 1] : '.env.local'
const rest = args.filter((_, i) => i !== envIdx && i !== envIdx + 1)
const email = rest[0]?.trim().toLowerCase()
const password = rest[1]

if (!email || !password) {
  console.error("Uso: node set-user-password.mjs --env .env.local <email> '<senha>'")
  process.exit(1)
}

const abs = resolve(process.cwd(), envFile)
if (!existsSync(abs)) {
  console.error(`Arquivo não encontrado: ${abs}`)
  process.exit(1)
}

function loadEnv(file) {
  const o = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return o
}

const env = loadEnv(abs)
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error(`Faltam URL/SERVICE_ROLE em ${envFile}`)
  process.exit(1)
}

const ref = url.replace('https://', '').split('.')[0]
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
  console.error(`[${ref}] Auth user não encontrado: ${email}`)
  process.exit(1)
}

const { error: pwErr } = await sb.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
})
if (pwErr) {
  console.error(`[${ref}] Erro senha:`, pwErr.message)
  process.exit(1)
}

const { data: perfil, error: perfilErr } = await sb
  .from('usuarios')
  .update({ must_change_password: false, ativo: true })
  .or(`auth_user_id.eq.${user.id},email.ilike.${email}`)
  .select('id, email, ativo, role_global, must_change_password')
  .maybeSingle()

if (perfilErr) {
  console.warn(`[${ref}] Senha Auth OK; perfil:`, perfilErr.message)
} else {
  console.log(
    JSON.stringify({
      ok: true,
      env: envFile,
      ref,
      email,
      auth_user_id: user.id,
      perfil: perfil
        ? {
            ativo: perfil.ativo,
            role_global: perfil.role_global,
            must_change_password: perfil.must_change_password,
          }
        : null,
    }),
  )
}
