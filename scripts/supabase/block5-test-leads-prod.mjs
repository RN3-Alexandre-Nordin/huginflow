/**
 * Bloco 5 — leads em PRODUÇÃO (5.1–5.4).
 * Usa tenant de scripts/supabase/out/prod-test-tenant.json
 *
 * Uso: node scripts/supabase/block5-test-leads-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getAppPublicUrl, getWebhookUrl } from './_platform-env.mjs'

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

if (!url || !anonKey) {
  console.error('Configure Supabase em .env.production')
  process.exit(1)
}

if (!existsSync(tenantFile)) {
  console.error('Rode block3-bootstrap-test-empresa-prod.mjs antes')
  process.exit(1)
}

const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
const EMPRESA_ID = tenant.empresa_id
const GESTOR_EMAIL = tenant.gestor_email
const PASSWORD = tenant.password

const sb = createClient(url, anonKey)
const results = {}

function pass(id, note) {
  results[id] = { ok: true, note }
}

function fail(id, note) {
  results[id] = { ok: false, note }
}

async function main() {
  const { error: loginErr } = await sb.auth.signInWithPassword({
    email: GESTOR_EMAIL,
    password: PASSWORD,
  })
  if (loginErr) throw new Error(`Login: ${loginErr.message}`)

  const suffix = Date.now().toString().slice(-6)
  const nome = `Lead Teste Go-Live ${suffix}`
  const telefone = `119${suffix}`

  const { data: lead, error: createErr } = await sb
    .from('crm_leads')
    .insert({
      nome,
      telefone,
      whatsapp: telefone,
      email: `lead-${suffix}@teste.huginflow.com`,
      empresa_cliente: 'Empresa Cliente Teste',
      cargo: 'Comprador',
      empresa_id: EMPRESA_ID,
    })
    .select('id, nome, telefone')
    .single()
  if (createErr) {
    fail('5.1', createErr.message)
    throw new Error(createErr.message)
  }
  pass('5.1', `lead ${lead.id}`)

  const { data: byNome, error: searchNomeErr } = await sb
    .from('crm_leads')
    .select('id, nome')
    .eq('empresa_id', EMPRESA_ID)
    .ilike('nome', `%${suffix}%`)
  const { data: byTel, error: searchTelErr } = await sb
    .from('crm_leads')
    .select('id, telefone')
    .eq('empresa_id', EMPRESA_ID)
    .or(`telefone.ilike.%${suffix}%,whatsapp.ilike.%${suffix}%`)

  if (searchNomeErr || searchTelErr) {
    fail('5.2', searchNomeErr?.message || searchTelErr?.message)
  } else if (
    (byNome?.length ?? 0) >= 1 &&
    byNome?.some((l) => l.id === lead.id) &&
    (byTel?.length ?? 0) >= 1 &&
    byTel?.some((l) => l.id === lead.id)
  ) {
    pass('5.2', 'busca por nome e telefone/whatsapp')
  } else {
    fail('5.2', `nome=${byNome?.length}, tel=${byTel?.length}`)
  }

  const nomeEditado = `Lead Editado ${suffix}`
  const { error: editErr } = await sb
    .from('crm_leads')
    .update({
      nome: nomeEditado,
      cargo: 'Gerente Comercial',
      empresa_cliente: 'Empresa Cliente Atualizada',
    })
    .eq('id', lead.id)
    .eq('empresa_id', EMPRESA_ID)
  if (editErr) {
    fail('5.3', editErr.message)
  } else {
    const { data: edited } = await sb
      .from('crm_leads')
      .select('nome, cargo, empresa_cliente')
      .eq('id', lead.id)
      .single()
    if (edited?.nome === nomeEditado && edited?.cargo === 'Gerente Comercial') {
      pass('5.3', 'nome, cargo, empresa cliente')
    } else {
      fail('5.3', JSON.stringify(edited))
    }
  }

  const { error: delErr } = await sb
    .from('crm_leads')
    .delete()
    .eq('id', lead.id)
    .eq('empresa_id', EMPRESA_ID)
  const { data: deletedCheck } = await sb
    .from('crm_leads')
    .select('id')
    .eq('id', lead.id)
    .maybeSingle()

  if (delErr) {
    fail('5.4', delErr.message)
  } else if (deletedCheck === null) {
    pass('5.4', `lead ${lead.id} removido`)
  } else {
    fail('5.4', 'lead ainda existe')
  }

  await sb.auth.signOut()

  const allOk = Object.values(results).every((r) => r.ok)
  console.log(JSON.stringify({ ok: allOk, empresa_id: EMPRESA_ID, lead_id: lead.id, tests: results }, null, 2))
  if (!allOk) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
