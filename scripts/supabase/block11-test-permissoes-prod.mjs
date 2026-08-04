/**
 * Bloco 11 — permissões e isolamento em PRODUÇÃO (11.1–11.4).
 * Espelha block11-test-permissoes.mjs (dev).
 *
 * Uso: node scripts/supabase/block11-test-permissoes-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envProd = resolve(root, '.env.production')
const tenantFile = resolve(__dirname, 'out/prod-test-tenant.json')

const SUPERADMIN_EMAIL = 'admin@rn3.com.br'

const RN3_MENU_PATHS = [
  { href: '/cockpit/financeiro', label: 'Financeiro', rn3Only: true },
  { href: '/cockpit/financeiro/contratos', label: 'Contratos', rn3Only: true },
]

function loadEnv(path) {
  if (!existsSync(path)) return {}
  const o = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
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

async function loadSuperadminProfile(admin) {
  const { data } = await admin
    .from('usuarios')
    .select('id, empresa_id, role_global, grupos_acesso(is_admin, permissoes)')
    .eq('email', SUPERADMIN_EMAIL)
    .single()
  return data
}

async function main() {
  const env = loadEnv(envProd)
  if (!existsSync(tenantFile)) {
    console.error('Rode block3 em prod antes')
    process.exit(1)
  }

  const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
  const EMPRESA_ID = tenant.empresa_id
  const GESTOR_EMAIL = tenant.gestor_email
  const OPERADOR_EMAIL = tenant.operador_email
  const PASSWORD = tenant.password

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  const { data: outraEmpresa } = await admin
    .from('empresas')
    .select('id, nome')
    .neq('id', EMPRESA_ID)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()
  const OUTRA_EMPRESA_ID = outraEmpresa?.id
  if (!OUTRA_EMPRESA_ID) throw new Error('Nenhuma outra empresa ativa para teste de isolamento')

  await sb.auth.signInWithPassword({ email: OPERADOR_EMAIL, password: PASSWORD })
  const operador = await loadProfile(sb)

  const operadorMenu = filterNavItems(RN3_MENU_PATHS, isRn3SuperAdmin(operador))
  const operadorFinanceiro = await canAccessFinanceiro(operador)
  const operadorEmpresas = await canAccessEmpresasCadastro(operador)

  const { data: leakLeads } = await sb.from('crm_leads').select('id').eq('empresa_id', OUTRA_EMPRESA_ID)
  const { data: leakCards } = await sb.from('crm_cards').select('id').eq('empresa_id', OUTRA_EMPRESA_ID)
  await sb.auth.signOut()

  await sb.auth.signInWithPassword({ email: GESTOR_EMAIL, password: PASSWORD })
  const gestor = await loadProfile(sb)

  const { data: gestorLeakLeads } = await sb.from('crm_leads').select('id').eq('empresa_id', OUTRA_EMPRESA_ID)
  const { data: ownLeads } = await sb.from('crm_leads').select('id').eq('empresa_id', EMPRESA_ID).limit(1)
  await sb.auth.signOut()

  let superadmin = null
  let superLoginOk = false
  const superPassword = process.env.SUPERADMIN_PASSWORD || PASSWORD
  const { error: saErr } = await sb.auth.signInWithPassword({
    email: SUPERADMIN_EMAIL,
    password: superPassword,
  })
  if (!saErr) {
    superLoginOk = true
    superadmin = await loadProfile(sb)
    await sb.auth.signOut()
  } else {
    superadmin = await loadSuperadminProfile(admin)
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
    throw new Error(
      JSON.stringify(
        {
          tests,
          outra_empresa: outraEmpresa,
          operador: { menuRn3: operadorMenu.length, financeiro: operadorFinanceiro, empresas: operadorEmpresas },
          gestor: { empresa_id: gestor?.empresa_id, leak: gestorLeakLeads?.length },
          superadmin: { login: superLoginOk, role: superadmin?.role_global, menu: saMenu.length },
        },
        null,
        2,
      ),
    )
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        empresa_id: EMPRESA_ID,
        outra_empresa_id: OUTRA_EMPRESA_ID,
        outra_empresa_nome: outraEmpresa?.nome,
        tests,
        superadmin_login: superLoginOk,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
