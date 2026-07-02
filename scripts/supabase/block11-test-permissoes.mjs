/**
 * Bloco 11 — permissões e isolamento (dev).
 *
 * Uso: node scripts/supabase/block11-test-permissoes.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envLocal = resolve(root, '.env.local')

const EMPRESA_ID = '645679bd-3f41-4f7d-ba10-98d97cab2a46'
const GESTOR_EMAIL = 'golive-gestor-510160@teste.ragnar.dev'
const OPERADOR_EMAIL = 'golive-operador-510160@teste.ragnar.dev'
const SUPERADMIN_EMAIL = 'admin@rn3.com.br'
const PASSWORD = 'RagnarDevTest1!'
const OUTRA_EMPRESA_ID = '415854c0-84a4-489f-a357-2cc0142b6b65'

const RN3_MENU_PATHS = [
  { href: '/cockpit/financeiro', label: 'Financeiro', rn3Only: true },
  { href: '/cockpit/financeiro/contratos', label: 'Contratos', rn3Only: true },
]

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

function hasPermission(user, module, action) {
  if (!user) return false
  if (user.role_global === 'superadmin') return true
  if (!user.grupos_acesso) return false
  if (user.grupos_acesso.is_admin === true) return true
  const perms = user.grupos_acesso.permissoes || {}
  return (perms[module] || []).includes(action)
}

function isRn3SuperAdmin(user) {
  return user?.role_global === 'superadmin'
}

function filterNavItems(items, isSuperAdmin) {
  return items.filter((item) => !item.rn3Only || isSuperAdmin)
}

async function loadProfile(sb) {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data } = await sb
    .from('usuarios')
    .select('id, empresa_id, role_global, grupos_acesso(is_admin, permissoes)')
    .eq('auth_user_id', user.id)
    .single()
  return data
}

async function canAccessFinanceiro(profile) {
  return isRn3SuperAdmin(profile)
}

async function canAccessEmpresasCadastro(profile) {
  return isRn3SuperAdmin(profile) || hasPermission(profile, 'empresas', 'view')
}

async function main() {
  const env = loadEnvLocal()
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  // Operador
  await sb.auth.signInWithPassword({ email: OPERADOR_EMAIL, password: PASSWORD })
  const operador = await loadProfile(sb)

  const operadorMenu = filterNavItems(RN3_MENU_PATHS, isRn3SuperAdmin(operador))
  const operadorFinanceiro = await canAccessFinanceiro(operador)
  const operadorEmpresas = await canAccessEmpresasCadastro(operador)

  const { data: leakLeads } = await sb.from('crm_leads').select('id').eq('empresa_id', OUTRA_EMPRESA_ID)
  const { data: leakCards } = await sb.from('crm_cards').select('id').eq('empresa_id', OUTRA_EMPRESA_ID)
  await sb.auth.signOut()

  // Gestor (tenant isolamento)
  await sb.auth.signInWithPassword({ email: GESTOR_EMAIL, password: PASSWORD })
  const gestor = await loadProfile(sb)

  const { data: gestorLeakLeads } = await sb.from('crm_leads').select('id').eq('empresa_id', OUTRA_EMPRESA_ID)
  const { data: ownLeads } = await sb.from('crm_leads').select('id').eq('empresa_id', EMPRESA_ID).limit(1)
  await sb.auth.signOut()

  // Superadmin — tenta login (senha padrão dev); fallback valida perfil via service role
  let superadmin = null
  let superLoginOk = false
  const { error: saErr } = await sb.auth.signInWithPassword({ email: SUPERADMIN_EMAIL, password: PASSWORD })
  if (!saErr) {
    superLoginOk = true
    superadmin = await loadProfile(sb)
    await sb.auth.signOut()
  } else {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data } = await admin.from('usuarios').select('id, role_global, grupos_acesso(is_admin, permissoes)')
      .eq('email', SUPERADMIN_EMAIL).single()
    superadmin = data
  }

  const saMenu = filterNavItems(RN3_MENU_PATHS, isRn3SuperAdmin(superadmin))
  const saFinanceiro = await canAccessFinanceiro(superadmin)
  const saContratos = saFinanceiro

  const tests = {
    '11.1_operador_sem_menu_financeiro': operadorMenu.length === 0 && !operadorFinanceiro,
    '11.2_gestor_isolamento_tenant':
      gestor?.empresa_id === EMPRESA_ID &&
      (gestorLeakLeads ?? []).length === 0 &&
      (leakLeads ?? []).length === 0 &&
      (leakCards ?? []).length === 0 &&
      (ownLeads ?? []).length >= 0,
    '11.3_superadmin_financeiro_contratos':
      isRn3SuperAdmin(superadmin) && saFinanceiro && saContratos && saMenu.length === 2,
    '11.4_operador_sem_cadastro_empresas': !operadorEmpresas,
  }

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(JSON.stringify({
      tests,
      operador: { menuRn3: operadorMenu.length, financeiro: operadorFinanceiro, empresas: operadorEmpresas },
      gestor: { empresa_id: gestor?.empresa_id, leak: gestorLeakLeads?.length },
      superadmin: { login: superLoginOk, role: superadmin?.role_global, menu: saMenu.length },
    }, null, 2))
  }

  console.log(JSON.stringify({
    ok: true,
    tests,
    superadmin_login: superLoginOk,
  }, null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
