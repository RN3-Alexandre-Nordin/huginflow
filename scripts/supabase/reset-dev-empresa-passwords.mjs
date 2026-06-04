/**
 * Redefine senha de todos os usuários Auth vinculados a uma empresa (por nome).
 * Uso: node scripts/supabase/reset-dev-empresa-passwords.mjs "Monte Sinai" "SenhaDev123"
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envLocal = resolve(root, '.env.local')

const empresaBusca = process.argv[2]?.trim()
const password = process.argv[3] || process.env.DEV_BOOTSTRAP_PASSWORD

if (!empresaBusca || !password) {
  console.error('Uso: node reset-dev-empresa-passwords.mjs "<nome empresa>" "<senha>"')
  process.exit(1)
}

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

const env = loadEnvLocal()
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: empresas, error: empErr } = await sb
  .from('empresas')
  .select('id, nome')
  .ilike('nome', `%${empresaBusca}%`)

if (empErr || !empresas?.length) {
  console.error('Empresa não encontrada:', empresaBusca, empErr?.message)
  process.exit(1)
}

const empresaIds = empresas.map((e) => e.id)
console.log('Empresas:', empresas.map((e) => e.nome).join(', '))

const { data: usuarios, error: uErr } = await sb
  .from('usuarios')
  .select('email, nome_completo, role_global, auth_user_id')
  .in('empresa_id', empresaIds)
  .not('email', 'is', null)

if (uErr || !usuarios?.length) {
  console.error('Nenhum usuário com e-mail nesta empresa.')
  process.exit(1)
}

let ok = 0
let fail = 0

for (const u of usuarios) {
  const email = u.email?.trim().toLowerCase()
  if (!email) continue

  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const authUser = list?.users.find((x) => x.email?.toLowerCase() === email)

  if (!authUser) {
    console.warn(`SKIP (sem Auth): ${email} — ${u.nome_completo}`)
    fail++
    continue
  }

  const { error } = await sb.auth.admin.updateUserById(authUser.id, {
    password,
    email_confirm: true,
  })

  if (error) {
    console.error(`FAIL ${email}:`, error.message)
    fail++
  } else {
    console.log(`OK ${email} (${u.role_global}) — ${u.nome_completo}`)
    ok++
  }
}

console.log(`\nConcluído: ${ok} senhas atualizadas, ${fail} falhas.`)
