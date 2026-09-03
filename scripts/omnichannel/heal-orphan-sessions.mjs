/**
 * Lista e repara sessões órfãs: card/interações sem crm_conversas ou crm_chat_threads.
 *
 * Uso (DEV):
 *   node scripts/omnichannel/heal-orphan-sessions.mjs
 *   node scripts/omnichannel/heal-orphan-sessions.mjs --dry-run
 *
 * Requer .env.local (ou .env) com NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const dryRun = process.argv.includes('--dry-run')

function loadEnv(path) {
  const o = {}
  if (!existsSync(path)) return o
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return o
}

const env = {
  ...loadEnv(resolve(root, '.env')),
  ...loadEnv(resolve(root, '.env.local')),
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function listOrphans() {
  const { data: cards, error } = await supabase
    .from('crm_cards')
    .select('id, titulo, conversa_id, empresa_id, lead_id, pipeline_id')
    .not('conversa_id', 'is', null)
    .limit(500)

  if (error) throw error

  const orphans = []
  for (const card of cards ?? []) {
    const sessaoId = card.conversa_id
    if (!sessaoId) continue

    const [{ count: convCount }, { count: threadCount }, { count: intCount }] =
      await Promise.all([
        supabase
          .from('crm_conversas')
          .select('id', { count: 'exact', head: true })
          .eq('sessao_id', sessaoId)
          .eq('empresa_id', card.empresa_id),
        supabase
          .from('crm_chat_threads')
          .select('id', { count: 'exact', head: true })
          .eq('id', sessaoId)
          .eq('empresa_id', card.empresa_id),
        supabase
          .from('crm_interacoes')
          .select('id', { count: 'exact', head: true })
          .eq('conversa_id', sessaoId)
          .eq('empresa_id', card.empresa_id),
      ])

    if ((intCount ?? 0) > 0 && (convCount ?? 0) === 0 && (threadCount ?? 0) === 0) {
      orphans.push({ ...card, interacoes: intCount })
    }
  }
  return orphans
}

async function healOne(card) {
  const sessaoId = card.conversa_id
  const empresaId = card.empresa_id

  const { data: interacoes } = await supabase
    .from('crm_interacoes')
    .select('id, role, content, metadata, created_at, contact_phone, contact_name, lead_id')
    .eq('conversa_id', sessaoId)
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: true })

  if (!interacoes?.length) return { ok: false, error: 'sem interações' }

  const leadId = card.lead_id ?? interacoes[0].lead_id
  let externalId = (interacoes[0].contact_phone || '').replace(/\D/g, '')
  if (!externalId && leadId) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('whatsapp, telefone, canal_id')
      .eq('id', leadId)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    externalId = String(lead?.whatsapp || lead?.telefone || '').replace(/\D/g, '')
  }

  let canalId = null
  if (leadId) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('canal_id')
      .eq('id', leadId)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    canalId = lead?.canal_id ?? null
  }
  if (!canalId) {
    const { data: canal } = await supabase
      .from('crm_canais')
      .select('id')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    canalId = canal?.id ?? null
  }

  if (!canalId || !externalId) {
    return { ok: false, error: `canal/external ausente canal=${canalId} phone=${externalId}` }
  }

  let departamentoId = null
  if (card.pipeline_id) {
    const { data: pipe } = await supabase
      .from('pipelines')
      .select('departamento_id')
      .eq('id', card.pipeline_id)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    departamentoId = pipe?.departamento_id ?? null
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      wouldInsertConversas: interacoes.length,
      canalId,
      departamentoId,
    }
  }

  for (const row of interacoes) {
    const role = row.role || 'system'
    const direcao = role === 'user' ? 'inbound' : 'outbound'
    const { error } = await supabase.from('crm_conversas').insert({
      sessao_id: sessaoId,
      empresa_id: empresaId,
      canal_id: canalId,
      lead_id: leadId,
      external_id: externalId,
      role,
      content: row.content ?? '',
      direcao,
      last_message: row.content ?? '',
      status: 'human',
      metadata: { ...(row.metadata || {}), healed: true },
      created_at: row.created_at,
      updated_at: row.created_at,
    })
    if (error) return { ok: false, error: error.message }
  }

  const now = new Date().toISOString()
  const { error: threadErr } = await supabase.from('crm_chat_threads').upsert(
    {
      id: sessaoId,
      empresa_id: empresaId,
      canal_id: canalId,
      external_id: externalId,
      lead_id: leadId,
      card_id: card.id,
      departamento_id: departamentoId,
      pipeline_id: card.pipeline_id,
      status: 'human',
      created_at: interacoes[0].created_at || now,
      updated_at: now,
    },
    { onConflict: 'id' },
  )
  if (threadErr) return { ok: false, error: threadErr.message }

  await supabase
    .from('crm_cards')
    .update({ conversa_id: sessaoId, updated_at: now })
    .eq('id', card.id)
    .eq('empresa_id', empresaId)

  return { ok: true, conversas: interacoes.length }
}

const orphans = await listOrphans()
console.log(`Órfãos encontrados: ${orphans.length}`)
for (const o of orphans) {
  console.log(`- ${o.titulo} card=${o.id} sessao=${o.conversa_id} msgs=${o.interacoes}`)
}

let ok = 0
let fail = 0
for (const o of orphans) {
  const r = await healOne(o)
  if (r.ok) {
    ok++
    console.log(`HEAL OK ${o.titulo}`, r)
  } else {
    fail++
    console.error(`HEAL FAIL ${o.titulo}`, r)
  }
}

console.log(`Done. ok=${ok} fail=${fail} dryRun=${dryRun}`)
