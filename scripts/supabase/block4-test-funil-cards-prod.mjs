/**
 * Bloco 4 — funil e cards em PRODUÇÃO (4.1–4.8).
 * Usa tenant de scripts/supabase/out/prod-test-tenant.json
 *
 * Uso: node scripts/supabase/block4-test-funil-cards-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'fs'
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
const EMPRESA_ID = tenant.empresa_id
const GESTOR_EMAIL = tenant.gestor_email
const OPERADOR_EMAIL = tenant.operador_email
const PASSWORD = tenant.password

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const sb = createClient(url, anonKey)

const results = {}

function pass(id, note) {
  results[id] = { ok: true, note }
}

function fail(id, note) {
  results[id] = { ok: false, note }
}

async function getUserIds() {
  const { data: gestor, error: gErr } = await admin
    .from('usuarios')
    .select('id')
    .eq('email', GESTOR_EMAIL)
    .eq('empresa_id', EMPRESA_ID)
    .single()
  const { data: operador, error: oErr } = await admin
    .from('usuarios')
    .select('id')
    .eq('email', OPERADOR_EMAIL)
    .eq('empresa_id', EMPRESA_ID)
    .single()
  if (gErr || oErr || !gestor || !operador) {
    throw new Error(`Usuários não encontrados: ${gErr?.message || oErr?.message}`)
  }
  return { gestorId: gestor.id, operadorId: operador.id }
}

async function main() {
  const { gestorId, operadorId } = await getUserIds()

  const { error: loginErr } = await sb.auth.signInWithPassword({
    email: GESTOR_EMAIL,
    password: PASSWORD,
  })
  if (loginErr) throw new Error(`Login gestor: ${loginErr.message}`)

  const suffix = Date.now().toString().slice(-6)
  const pipelineNome = `Funil Teste Go-Live ${suffix}`

  // 4.1 — criar funil
  const { data: pipeline, error: pErr } = await sb
    .from('pipelines')
    .insert({
      nome: pipelineNome,
      descricao: 'Funil criado no Bloco 4 — testes go-live prod',
      is_public: true,
      empresa_id: EMPRESA_ID,
    })
    .select('id, nome')
    .single()
  if (pErr) {
    fail('4.1', pErr.message)
    throw new Error(pErr.message)
  }
  pass('4.1', `${pipeline.nome} · id ${pipeline.id}`)

  const { data: stages, error: stErr } = await sb
    .from('pipeline_stages')
    .insert([
      { pipeline_id: pipeline.id, nome: 'PROSPECÇÃO', ordem: 0, cor: '#80B828' },
      { pipeline_id: pipeline.id, nome: 'NEGOCIAÇÃO', ordem: 1, cor: '#2BAADF' },
      { pipeline_id: pipeline.id, nome: 'FECHADO', ordem: 2, cor: '#1A8FBF' },
    ])
    .select('id, nome, ordem')
    .order('ordem')
  if (stErr) {
    fail('4.1', `stages: ${stErr.message}`)
    throw new Error(stErr.message)
  }

  const stageProspeccao = stages[0]
  const stageNegociacao = stages[1]

  // 4.2 — criar card
  const { data: card, error: cErr } = await sb
    .from('crm_cards')
    .insert({
      titulo: `Card Teste ${suffix}`,
      descricao: 'Card criado no Bloco 4 prod',
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
  if (cErr) {
    fail('4.2', cErr.message)
    throw new Error(cErr.message)
  }
  pass('4.2', `card ${card.id}`)

  // 4.3 — editar informações
  const novoTitulo = `Card Editado ${suffix}`
  const { error: editErr } = await sb
    .from('crm_cards')
    .update({
      titulo: novoTitulo,
      descricao: 'Descrição atualizada no teste prod',
      valor: 2500.5,
      cliente_nome: 'Cliente Atualizado',
      observacao: 'Observação de teste go-live prod',
    })
    .eq('id', card.id)
    .eq('empresa_id', EMPRESA_ID)
  if (editErr) {
    fail('4.3', editErr.message)
  } else {
    const { data: edited } = await sb
      .from('crm_cards')
      .select('titulo, valor, cliente_nome, observacao')
      .eq('id', card.id)
      .single()
    if (
      edited?.titulo === novoTitulo &&
      Number(edited?.valor) === 2500.5 &&
      edited?.cliente_nome === 'Cliente Atualizado'
    ) {
      pass('4.3', 'título, valor, cliente, observação')
    } else {
      fail('4.3', JSON.stringify(edited))
    }
  }

  // 4.4 — atribuir a operador
  const { error: assignErr } = await sb
    .from('crm_cards')
    .update({ responsavel_id: operadorId })
    .eq('id', card.id)
    .eq('empresa_id', EMPRESA_ID)
  if (assignErr) {
    fail('4.4', assignErr.message)
  } else {
    const { data: assigned } = await sb
      .from('crm_cards')
      .select('responsavel_id')
      .eq('id', card.id)
      .single()
    if (assigned?.responsavel_id === operadorId) {
      pass('4.4', `gestor → operador ${OPERADOR_EMAIL}`)
    } else {
      fail('4.4', `responsavel_id=${assigned?.responsavel_id}`)
    }
  }

  // 4.5 — anexo
  const fileName = `anexo-teste-${suffix}.txt`
  const filePath = `${EMPRESA_ID}/${card.id}/${Date.now()}_${fileName}`
  const fileContent = `Anexo de teste go-live prod ${suffix}`

  const { error: storageErr } = await sb.storage
    .from('card_attachments')
    .upload(filePath, Buffer.from(fileContent, 'utf8'), {
      contentType: 'text/plain',
      upsert: false,
    })
  if (storageErr) {
    fail('4.5', storageErr.message)
  } else {
    const { data: fileRow, error: fileDbErr } = await sb
      .from('crm_card_files')
      .insert({
        empresa_id: EMPRESA_ID,
        card_id: card.id,
        file_name: fileName,
        file_url: filePath,
        file_type: 'text/plain',
        uploaded_by: gestorId,
      })
      .select('id, file_name')
      .single()
    const { data: signed } = await sb.storage
      .from('card_attachments')
      .createSignedUrl(filePath, 60)
    if (fileDbErr) {
      fail('4.5', fileDbErr.message)
    } else if (fileRow && signed?.signedUrl) {
      pass('4.5', `storage + metadados (${fileName})`)
    } else {
      fail('4.5', 'metadados ou signed URL ausentes')
    }
  }

  // 4.6 — mover card
  const { error: moveErr } = await sb
    .from('crm_cards')
    .update({
      stage_id: stageNegociacao.id,
      stage_entered_at: new Date().toISOString(),
    })
    .eq('id', card.id)
    .eq('empresa_id', EMPRESA_ID)
  if (moveErr) {
    fail('4.6', moveErr.message)
  } else {
    const { data: moved } = await sb
      .from('crm_cards')
      .select('stage_id')
      .eq('id', card.id)
      .single()
    if (moved?.stage_id === stageNegociacao.id) {
      pass('4.6', 'PROSPECÇÃO → NEGOCIAÇÃO')
    } else {
      fail('4.6', `stage_id=${moved?.stage_id}`)
    }
  }

  // 4.7 — finalizar
  const { error: finErr } = await sb
    .from('crm_cards')
    .update({ finalizado: true })
    .eq('id', card.id)
    .eq('empresa_id', EMPRESA_ID)
  if (finErr) {
    fail('4.7', finErr.message)
  } else {
    const { data: finished } = await sb
      .from('crm_cards')
      .select('finalizado')
      .eq('id', card.id)
      .single()
    if (finished?.finalizado === true) {
      pass('4.7', 'finalizado=true')
    } else {
      fail('4.7', `finalizado=${finished?.finalizado}`)
    }
  }

  // 4.8 — excluir card temporário
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
  if (cdErr) {
    fail('4.8', cdErr.message)
  } else {
    const { error: delErr } = await sb
      .from('crm_cards')
      .delete()
      .eq('id', cardDel.id)
      .eq('empresa_id', EMPRESA_ID)
    const { data: deletedCheck } = await sb
      .from('crm_cards')
      .select('id')
      .eq('id', cardDel.id)
      .maybeSingle()
    if (delErr) {
      fail('4.8', delErr.message)
    } else if (deletedCheck === null) {
      pass('4.8', `card ${cardDel.id} removido`)
    } else {
      fail('4.8', 'card ainda existe')
    }
  }

  await sb.auth.signOut()

  const allOk = Object.values(results).every((r) => r.ok)

  const output = {
    ok: allOk,
    empresa_id: EMPRESA_ID,
    pipeline_id: pipeline.id,
    pipeline_nome: pipeline.nome,
    card_id: card.id,
    tests: results,
  }

  tenant.pipeline_id = pipeline.id
  tenant.pipeline_nome = pipeline.nome
  tenant.card_id = card.id
  writeFileSync(tenantFile, JSON.stringify(tenant, null, 2))

  console.log(JSON.stringify(output, null, 2))
  if (!allOk) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
