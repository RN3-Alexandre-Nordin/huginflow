/**
 * Bloco 5 — leads (dev) na Empresa Teste Go-Live.
 *
 * Uso: node scripts/supabase/block5-test-leads.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envLocal = resolve(root, '.env.local')

const EMPRESA_ID = '645679bd-3f41-4f7d-ba10-98d97cab2a46'
const GESTOR_EMAIL = 'golive-gestor-510160@teste.huginflow.com'
const PASSWORD = 'HuginDevTest1!'

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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  const { error: loginErr } = await sb.auth.signInWithPassword({
    email: GESTOR_EMAIL,
    password: PASSWORD,
  })
  if (loginErr) throw new Error(`Login: ${loginErr.message}`)

  const suffix = Date.now().toString().slice(-6)
  const nome = `Lead Teste Go-Live ${suffix}`
  const telefone = `119${suffix}`

  // 5.1 — criar lead
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
  if (createErr) throw new Error(`5.1 criar: ${createErr.message}`)

  // 5.2 — buscar por nome
  const { data: byNome, error: searchNomeErr } = await sb
    .from('crm_leads')
    .select('id, nome')
    .eq('empresa_id', EMPRESA_ID)
    .ilike('nome', `%${suffix}%`)
  if (searchNomeErr) throw new Error(`5.2 busca nome: ${searchNomeErr.message}`)

  // 5.2 — buscar por telefone
  const { data: byTel, error: searchTelErr } = await sb
    .from('crm_leads')
    .select('id, telefone')
    .eq('empresa_id', EMPRESA_ID)
    .or(`telefone.ilike.%${suffix}%,whatsapp.ilike.%${suffix}%`)
  if (searchTelErr) throw new Error(`5.2 busca tel: ${searchTelErr.message}`)

  // 5.3 — editar lead
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
  if (editErr) throw new Error(`5.3 editar: ${editErr.message}`)

  const { data: edited } = await sb
    .from('crm_leads')
    .select('nome, cargo, empresa_cliente')
    .eq('id', lead.id)
    .single()

  // 5.4 — excluir lead
  const { error: delErr } = await sb
    .from('crm_leads')
    .delete()
    .eq('id', lead.id)
    .eq('empresa_id', EMPRESA_ID)
  if (delErr) throw new Error(`5.4 excluir: ${delErr.message}`)

  const { data: deletedCheck } = await sb
    .from('crm_leads')
    .select('id')
    .eq('id', lead.id)
    .maybeSingle()

  await sb.auth.signOut()

  const tests = {
    '5.1_criar_lead': Boolean(lead?.id),
    '5.2_buscar_nome': (byNome?.length ?? 0) >= 1 && byNome?.some((l) => l.id === lead.id),
    '5.2_buscar_telefone': (byTel?.length ?? 0) >= 1 && byTel?.some((l) => l.id === lead.id),
    '5.3_editar_lead':
      edited?.nome === nomeEditado && edited?.cargo === 'Gerente Comercial',
    '5.4_excluir_lead': deletedCheck === null,
  }

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(`Falha: ${JSON.stringify(tests)}`)
  }

  console.log(JSON.stringify({ ok: true, lead_id: lead.id, tests }, null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
