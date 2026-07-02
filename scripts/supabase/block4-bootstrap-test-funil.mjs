/**
 * Bloco 4 — funil e cards (dev) na Empresa Teste Go-Live.
 * Executa como gestor (RLS), espelhando createPipeline + CRM card actions.
 *
 * Uso: node scripts/supabase/block4-bootstrap-test-funil.mjs
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
const PASSWORD = 'RagnarDevTest1!'

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
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('Configure Supabase em .env.local')
  process.exit(1)
}

const sb = createClient(url, anonKey)

async function login() {
  const { error } = await sb.auth.signInWithPassword({ email: GESTOR_EMAIL, password: PASSWORD })
  if (error) throw new Error(`Login gestor: ${error.message}`)
}

async function main() {
  await login()

  const suffix = Date.now().toString().slice(-6)
  const pipelineNome = `Funil Teste Go-Live ${suffix}`

  // 4.1 — criar funil
  const { data: pipeline, error: pErr } = await sb
    .from('pipelines')
    .insert({
      nome: pipelineNome,
      descricao: 'Funil criado no Bloco 4 — testes go-live',
      is_public: true,
      empresa_id: EMPRESA_ID,
    })
    .select('id, nome')
    .single()
  if (pErr) throw new Error(`4.1 pipeline: ${pErr.message}`)

  const { data: stages, error: stErr } = await sb
    .from('pipeline_stages')
    .insert([
      { pipeline_id: pipeline.id, nome: 'PROSPECÇÃO', ordem: 0, cor: '#80B828' },
      { pipeline_id: pipeline.id, nome: 'NEGOCIAÇÃO', ordem: 1, cor: '#2BAADF' },
      { pipeline_id: pipeline.id, nome: 'FECHADO', ordem: 2, cor: '#1A8FBF' },
    ])
    .select('id, nome, ordem')
    .order('ordem')
  if (stErr) throw new Error(`4.1 stages: ${stErr.message}`)

  const stageProspeccao = stages[0]
  const stageNegociacao = stages[1]

  // 4.2 — criar card
  const { data: card, error: cErr } = await sb
    .from('crm_cards')
    .insert({
      titulo: `Card Teste ${suffix}`,
      descricao: 'Card criado no Bloco 4',
      valor: 1500,
      cliente_nome: 'Cliente Teste Go-Live',
      pipeline_id: pipeline.id,
      stage_id: stageProspeccao.id,
      empresa_id: EMPRESA_ID,
      stage_entered_at: new Date().toISOString(),
      finalizado: false,
    })
    .select('id, stage_id')
    .single()
  if (cErr) throw new Error(`4.2 card: ${cErr.message}`)

  // 4.3 — mover card
  const { error: moveErr } = await sb
    .from('crm_cards')
    .update({
      stage_id: stageNegociacao.id,
      stage_entered_at: new Date().toISOString(),
    })
    .eq('id', card.id)
    .eq('empresa_id', EMPRESA_ID)
  if (moveErr) throw new Error(`4.3 move: ${moveErr.message}`)

  const { data: moved } = await sb
    .from('crm_cards')
    .select('stage_id')
    .eq('id', card.id)
    .single()

  // 4.4 — finalizar card
  const { error: finErr } = await sb
    .from('crm_cards')
    .update({ finalizado: true })
    .eq('id', card.id)
    .eq('empresa_id', EMPRESA_ID)
  if (finErr) throw new Error(`4.4 finalizar: ${finErr.message}`)

  const { data: finished } = await sb
    .from('crm_cards')
    .select('finalizado')
    .eq('id', card.id)
    .single()

  // 4.5 — excluir card (criar outro para não perder histórico do finalizado, ou excluir o mesmo)
  const { data: cardDel, error: cdErr } = await sb
    .from('crm_cards')
    .insert({
      titulo: `Card Excluir ${suffix}`,
      pipeline_id: pipeline.id,
      stage_id: stageProspeccao.id,
      empresa_id: EMPRESA_ID,
      stage_entered_at: new Date().toISOString(),
      finalizado: false,
    })
    .select('id')
    .single()
  if (cdErr) throw new Error(`4.5 card temp: ${cdErr.message}`)

  const { error: delErr } = await sb
    .from('crm_cards')
    .delete()
    .eq('id', cardDel.id)
    .eq('empresa_id', EMPRESA_ID)
  if (delErr) throw new Error(`4.5 delete: ${delErr.message}`)

  const { data: deletedCheck } = await sb
    .from('crm_cards')
    .select('id')
    .eq('id', cardDel.id)
    .maybeSingle()

  await sb.auth.signOut()

  console.log(JSON.stringify({
    ok: true,
    empresa_id: EMPRESA_ID,
    pipeline_id: pipeline.id,
    pipeline_nome: pipeline.nome,
    stages: stages.map((s) => s.nome),
    card_id: card.id,
    tests: {
      '4.1_criar_funil': true,
      '4.2_criar_card': true,
      '4.3_mover_card': moved?.stage_id === stageNegociacao.id,
      '4.4_finalizar_card': finished?.finalizado === true,
      '4.5_excluir_card': deletedCheck === null,
    },
  }, null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
