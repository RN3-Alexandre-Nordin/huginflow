/**
 * Bloco 3 — valida empresa e usuários em PRODUÇÃO.
 * Lê tenant de scripts/supabase/out/prod-test-tenant.json
 *
 * Uso: node scripts/supabase/block3-test-empresa-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envProd = resolve(root, '.env.production')
const tenantFile = resolve(__dirname, 'out/prod-test-tenant.json')

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

const env = loadEnv(envProd)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  console.error('Configure Supabase em .env.production')
  process.exit(1)
}

if (!existsSync(tenantFile)) {
  console.error('Rode block3-bootstrap-test-empresa-prod.mjs antes')
  process.exit(1)
}

const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const results = {}

function pass(id, note) {
  results[id] = { ok: true, note }
}

function fail(id, note) {
  results[id] = { ok: false, note }
}

async function test30() {
  const { data, error } = await admin
    .from('empresas')
    .select('id, nome')
    .eq('id', tenant.empresa_id)
    .maybeSingle()
  if (error || !data) {
    fail('3.0', error?.message || 'empresa não encontrada')
  } else {
    pass('3.0', data.nome)
  }
}

async function test31() {
  const { data, error } = await admin
    .from('empresas')
    .select('ativo, status')
    .eq('id', tenant.empresa_id)
    .single()
  if (error) {
    fail('3.1', error.message)
    return
  }
  if (data.ativo === true && data.status === 'active') {
    pass('3.1', 'ativo=true, status=active')
  } else {
    fail('3.1', `ativo=${data.ativo}, status=${data.status}`)
  }
}

async function test32() {
  const { data, error } = await admin
    .from('empresas')
    .select('ai_model, ai_provider')
    .eq('id', tenant.empresa_id)
    .single()
  if (error) {
    fail('3.2', error.message)
    return
  }
  if (data.ai_provider === 'openai' && data.ai_model?.startsWith('gpt')) {
    pass('3.2', `${data.ai_provider}/${data.ai_model}`)
  } else {
    fail('3.2', `${data.ai_provider}/${data.ai_model}`)
  }
}

async function test33() {
  const sb = createClient(url, anonKey)
  const { data, error } = await sb.auth.signInWithPassword({
    email: tenant.gestor_email,
    password: tenant.password,
  })
  if (error || !data.user) {
    fail('3.3', error?.message || 'login falhou')
    return
  }
  const { data: usuario } = await sb
    .from('usuarios')
    .select('role_global, empresa_id')
    .eq('auth_user_id', data.user.id)
    .single()
  await sb.auth.signOut()
  if (usuario?.role_global === 'admin' && usuario?.empresa_id === tenant.empresa_id) {
    pass('3.3', `${tenant.gestor_email} — admin`)
  } else {
    fail('3.3', JSON.stringify(usuario))
  }
}

async function test34() {
  const sb = createClient(url, anonKey)
  const { data, error } = await sb.auth.signInWithPassword({
    email: tenant.operador_email,
    password: tenant.password,
  })
  if (error || !data.user) {
    fail('3.4', error?.message || 'login falhou')
    return
  }
  const { data: usuario } = await sb
    .from('usuarios')
    .select('role_global, empresa_id')
    .eq('auth_user_id', data.user.id)
    .single()
  await sb.auth.signOut()
  if (usuario?.role_global === 'operador' && usuario?.empresa_id === tenant.empresa_id) {
    pass('3.4', `${tenant.operador_email} — operador`)
  } else {
    fail('3.4', JSON.stringify(usuario))
  }
}

async function test35() {
  const sb = createClient(url, anonKey)
  const { error: loginErr } = await sb.auth.signInWithPassword({
    email: tenant.gestor_email,
    password: tenant.password,
  })
  if (loginErr) {
    fail('3.5', loginErr.message)
    return
  }
  const suffix = Date.now().toString().slice(-6)
  const novoRamo = `Validação Bloco3 ${suffix}`
  const { error: updErr } = await sb
    .from('empresas')
    .update({ ramo_atividade: novoRamo })
    .eq('id', tenant.empresa_id)
  if (updErr) {
    await sb.auth.signOut()
    fail('3.5', updErr.message)
    return
  }
  const { data: check } = await sb
    .from('empresas')
    .select('ramo_atividade')
    .eq('id', tenant.empresa_id)
    .single()
  await sb.auth.signOut()
  if (check?.ramo_atividade === novoRamo) {
    pass('3.5', `ramo_atividade=${novoRamo}`)
  } else {
    fail('3.5', `esperado ${novoRamo}, got ${check?.ramo_atividade}`)
  }
}

async function test36() {
  const { data, error } = await admin
    .from('empresas')
    .select('id, nome')
    .eq('id', tenant.empresa_id)
    .single()
  if (error || !data) {
    fail('3.6', error?.message || 'não listada')
  } else {
    pass('3.6', `superadmin vê ${data.nome}`)
  }
}

async function main() {
  await test30()
  await test31()
  await test32()
  await test33()
  await test34()
  await test35()
  await test36()

  const allOk = Object.values(results).every((r) => r.ok)

  console.log(JSON.stringify({
    ok: allOk,
    empresa_id: tenant.empresa_id,
    empresa_nome: tenant.empresa_nome,
    tests: results,
  }, null, 2))

  if (!allOk) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
