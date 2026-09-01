import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env.production') })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
const monte = authList?.users?.filter((u) => u.email?.includes('montesinai')) ?? []
console.log('Auth users montesinai:', monte.length)
for (const u of monte) {
  console.log(' -', u.email, u.id.slice(0, 8))
}

const { data: byEmail } = await admin
  .from('usuarios')
  .select('id, email, auth_user_id, empresa_id, nome, ativo')
  .ilike('email', '%montesinai%')

console.log('\nTabela usuarios (email montesinai):', byEmail?.length ?? 0)
for (const u of byEmail ?? []) {
  console.log(' -', u.email, '| auth_user_id:', u.auth_user_id?.slice(0, 8) ?? 'NULL', '| ativo:', u.ativo)
}

const { data: empresas } = await admin
  .from('empresas')
  .select('id, nome, ativo')
  .ilike('nome', '%monte%')

console.log('\nEmpresas Monte:')
for (const e of empresas ?? []) console.log(' -', e.nome, '| ativo:', e.ativo, '| id:', e.id.slice(0, 8))
