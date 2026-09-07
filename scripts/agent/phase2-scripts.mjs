/**
 * Fase 2 — scripts DEV: SCR-EMP-01, SCR-FUNIL-01, SCR-CHAT-01.
 *
 * Testes mutáveis exigem TEST_ALLOW_MUTATIONS=1 e credenciais TEST_* (ou MANUAL_*).
 * Todos os artefatos recebem marcador do run e são removidos em finally com filtro de tenant.
 */
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { assertDevTarget } from './test-env-guard.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
for (const file of ['.env.local', '.env']) {
  const path = resolve(root, file)
  if (existsSync(path)) loadDotenv({ path, override: false })
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.env.TEST_EMAIL || process.env.MANUAL_EMAIL
const PASSWORD = process.env.TEST_PASSWORD || process.env.MANUAL_PASSWORD
const EXPECTED_TENANT = process.env.TEST_TENANT_ID
const runKey = process.env.TEST_RUN_ID || randomUUID()
const marker = `[agent-phase2:${runKey}]`
const runDir =
  process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes', runKey)
const eventsPath = process.env.TEST_RUN_EVENTS_PATH || ''

const cases = []
const created = {
  tenantId: '',
  pipelineId: '',
  cardIds: [],
  fileIds: [],
  storagePaths: [],
  messageIds: [],
}

const CATALOG = {
  'SCR-EMP-01': {
    area: 'Empresa / tenant',
    expectation: 'Empresa e usuário de teste estão ativos e isolados pelo tenant.',
    passos:
      'Autentica o gestor, valida empresa/perfil e confirma que a consulta RLS não retorna usuários de outra empresa.',
  },
  'SCR-FUNIL-01': {
    area: 'Funil / cards',
    expectation: 'Funil, card, movimento e anexo funcionam com RLS e cleanup.',
    passos:
      'Cria funil e estágios temporários, cria/edita/move card, anexa arquivo, valida URL assinada e remove tudo ao final.',
  },
  'SCR-CHAT-01': {
    area: 'Chat interno',
    expectation: 'Mensagens global, de card e direta ficam acessíveis somente no tenant.',
    passos:
      'Cria mensagens temporárias nos três contextos, valida related_card_id e isolamento RLS, e remove tudo ao final.',
  },
}

function appendEvent(event) {
  if (!eventsPath) return
  mkdirSync(dirname(eventsPath), { recursive: true })
  writeFileSync(eventsPath, `${JSON.stringify(event)}\n`, { flag: 'a' })
}

function record(id, status, error, durationMs = 0) {
  const meta = CATALOG[id]
  const row = {
    id,
    title: `[${id}] ${meta.expectation}`,
    area: meta.area,
    expectation: `[${id}] ${meta.expectation}`,
    passos: meta.passos,
    status,
    error,
    durationMs,
  }
  cases.push(row)
  appendEvent({
    ts: new Date().toISOString(),
    type: 'test_end',
    ...row,
    passed: cases.filter((item) => item.status === 'passed').length,
    failed: cases.filter((item) => item.status === 'failed').length,
    skipped: 0,
    message: row.expectation,
  })
  console.log(`  ${status === 'passed' ? '✓' : '✗'} ${id}${error ? ` — ${error}` : ''}`)
}

function assertConfig() {
  const missing = []
  if (process.env.TEST_ALLOW_MUTATIONS !== '1') missing.push('TEST_ALLOW_MUTATIONS=1')
  if (!URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!EMAIL) missing.push('TEST_EMAIL')
  if (!PASSWORD) missing.push('TEST_PASSWORD')
  if (!EXPECTED_TENANT) missing.push('TEST_TENANT_ID')
  if (missing.length) throw new Error(`Preflight Fase 2: ausente ${missing.join(', ')}`)
  assertDevTarget()
}

function assertOk(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

async function loadContext(sb, admin) {
  const { data: auth, error: loginError } = await sb.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  assertOk(loginError, 'login')
  if (!auth.user) throw new Error('Login sem usuário')

  const { data: me, error: meError } = await sb
    .from('usuarios')
    .select('id, empresa_id, role_global, ativo, nome_completo')
    .eq('auth_user_id', auth.user.id)
    .eq('empresa_id', EXPECTED_TENANT)
    .single()
  assertOk(meError, 'perfil')
  if (!me?.empresa_id) throw new Error('Perfil sem empresa_id')
  if (me.empresa_id !== EXPECTED_TENANT) {
    throw new Error(`Tenant autenticado ${me.empresa_id} difere de TEST_TENANT_ID`)
  }
  created.tenantId = me.empresa_id

  const { data: operator, error: operatorError } = await admin
    .from('usuarios')
    .select('id, empresa_id')
    .eq('empresa_id', me.empresa_id)
    .eq('ativo', true)
    .neq('id', me.id)
    .limit(1)
    .maybeSingle()
  assertOk(operatorError, 'operador do tenant')
  if (!operator) throw new Error('Tenant de teste precisa de um segundo usuário ativo')
  return { me, operator }
}

async function scrEmp01(sb, me) {
  const { data: company, error: companyError } = await sb
    .from('empresas')
    .select('id, nome, ativo, status')
    .eq('id', me.empresa_id)
    .single()
  assertOk(companyError, 'empresa')
  if (!company || company.ativo !== true || company.status !== 'active') {
    throw new Error(`Empresa inativa: ${JSON.stringify(company)}`)
  }
  if (me.ativo !== true || !['admin', 'superadmin'].includes(me.role_global)) {
    throw new Error(`Usuário mutável deve ser admin ativo; role=${me.role_global}`)
  }

  const { data: leaks, error: leakError } = await sb
    .from('usuarios')
    .select('id, empresa_id')
    .neq('empresa_id', me.empresa_id)
    .limit(5)
  assertOk(leakError, 'isolamento usuarios')
  if ((leaks ?? []).length > 0) throw new Error('RLS retornou usuário de outro tenant')
}

async function scrFunil01(sb, me, operator) {
  const suffix = runKey.replaceAll('-', '').slice(-10)
  const { data: pipeline, error: pipelineError } = await sb
    .from('pipelines')
    .insert({
      empresa_id: me.empresa_id,
      nome: `${marker} Funil ${suffix}`,
      descricao: 'Fixture efêmera da Fase 2',
      is_public: true,
    })
    .select('id')
    .single()
  assertOk(pipelineError, 'criar funil')
  created.pipelineId = pipeline.id

  const { data: stages, error: stagesError } = await sb
    .from('pipeline_stages')
    .insert([
      { pipeline_id: pipeline.id, nome: 'ENTRADA', ordem: 0, cor: '#2BAADF' },
      { pipeline_id: pipeline.id, nome: 'VALIDAÇÃO', ordem: 1, cor: '#80B828' },
    ])
    .select('id, ordem')
    .order('ordem')
  assertOk(stagesError, 'criar estágios')
  if (!stages || stages.length !== 2) throw new Error('Estágios temporários incompletos')

  const { data: card, error: cardError } = await sb
    .from('crm_cards')
    .insert({
      empresa_id: me.empresa_id,
      pipeline_id: pipeline.id,
      stage_id: stages[0].id,
      titulo: `${marker} Card`,
      descricao: 'Fixture Fase 2',
      cliente_nome: 'Cliente automatizado',
      valor: 100,
      finalizado: false,
      stage_entered_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  assertOk(cardError, 'criar card')
  created.cardIds.push(card.id)

  const { error: editError } = await sb
    .from('crm_cards')
    .update({
      titulo: `${marker} Card editado`,
      observacao: 'Editado pelo agente de testes',
      valor: 250.5,
      responsavel_id: operator.id,
      stage_id: stages[1].id,
      stage_entered_at: new Date().toISOString(),
    })
    .eq('id', card.id)
    .eq('empresa_id', me.empresa_id)
  assertOk(editError, 'editar/mover card')

  const { data: moved, error: movedError } = await sb
    .from('crm_cards')
    .select('stage_id, responsavel_id, valor')
    .eq('id', card.id)
    .eq('empresa_id', me.empresa_id)
    .single()
  assertOk(movedError, 'validar card')
  if (
    moved.stage_id !== stages[1].id ||
    moved.responsavel_id !== operator.id ||
    Number(moved.valor) !== 250.5
  ) {
    throw new Error('Edição, atribuição ou movimento do card não persistiu')
  }

  const fileName = `phase2-${suffix}.txt`
  const storagePath = `${me.empresa_id}/${card.id}/${Date.now()}_${fileName}`
  const { error: uploadError } = await sb.storage
    .from('card_attachments')
    .upload(storagePath, Buffer.from(`${marker} anexo`, 'utf8'), {
      contentType: 'text/plain',
      upsert: false,
    })
  assertOk(uploadError, 'upload anexo')
  created.storagePaths.push(storagePath)

  const { data: file, error: fileError } = await sb
    .from('crm_card_files')
    .insert({
      empresa_id: me.empresa_id,
      card_id: card.id,
      file_name: fileName,
      file_url: storagePath,
      file_type: 'text/plain',
      uploaded_by: me.id,
    })
    .select('id')
    .single()
  assertOk(fileError, 'metadados anexo')
  created.fileIds.push(file.id)

  const { data: signed, error: signedError } = await sb.storage
    .from('card_attachments')
    .createSignedUrl(storagePath, 60)
  assertOk(signedError, 'URL assinada')
  if (!signed?.signedUrl) throw new Error('URL assinada do anexo ausente')
  return card
}

async function scrChat01(sb, me, operator, card) {
  const rows = [
    {
      empresa_id: me.empresa_id,
      sender_id: me.id,
      content: `${marker} global`,
      context_type: 'global',
    },
    {
      empresa_id: me.empresa_id,
      sender_id: me.id,
      content: `${marker} card`,
      context_type: 'card',
      context_id: card.id,
      related_card_id: card.id,
    },
    {
      empresa_id: me.empresa_id,
      sender_id: me.id,
      content: `${marker} direct`,
      context_type: 'direct',
      context_id: operator.id,
    },
  ]
  const { data: messages, error: messagesError } = await sb
    .from('chat_messages')
    .insert(rows)
    .select('id, empresa_id, content, context_type, context_id, related_card_id')
  assertOk(messagesError, 'criar mensagens')
  if (!messages || messages.length !== rows.length) throw new Error('Mensagens temporárias incompletas')
  created.messageIds.push(...messages.map((message) => message.id))

  const { data: visible, error: visibleError } = await sb
    .from('chat_messages')
    .select('id, empresa_id, context_type, related_card_id')
    .eq('empresa_id', me.empresa_id)
    .in('id', created.messageIds)
  assertOk(visibleError, 'ler mensagens')
  if ((visible ?? []).some((message) => message.empresa_id !== me.empresa_id)) {
    throw new Error('Consulta retornou mensagem de outro tenant')
  }
  if (!(visible ?? []).some((message) => message.related_card_id === card.id)) {
    throw new Error('Mensagem relacionada ao card não foi preservada')
  }

  const { data: leaks, error: leakError } = await sb
    .from('chat_messages')
    .select('id, empresa_id')
    .neq('empresa_id', me.empresa_id)
    .limit(5)
  assertOk(leakError, 'isolamento chat')
  if ((leaks ?? []).length > 0) throw new Error('RLS retornou mensagem de outro tenant')
}

async function cleanup(admin) {
  const tenantId = created.tenantId
  if (!tenantId) return
  const errors = []

  if (created.storagePaths.length) {
    const { error } = await admin.storage.from('card_attachments').remove(created.storagePaths)
    if (error) errors.push(`storage: ${error.message}`)
  }
  if (created.fileIds.length) {
    const { error } = await admin
      .from('crm_card_files')
      .delete()
      .eq('empresa_id', tenantId)
      .in('id', created.fileIds)
    if (error) errors.push(`files: ${error.message}`)
  }
  if (created.messageIds.length) {
    const { error } = await admin
      .from('chat_messages')
      .delete()
      .eq('empresa_id', tenantId)
      .in('id', created.messageIds)
    if (error) errors.push(`messages: ${error.message}`)
  }
  if (created.cardIds.length) {
    const { error } = await admin
      .from('crm_cards')
      .delete()
      .eq('empresa_id', tenantId)
      .in('id', created.cardIds)
    if (error) errors.push(`cards: ${error.message}`)
  }
  if (created.pipelineId) {
    const { error } = await admin
      .from('pipelines')
      .delete()
      .eq('empresa_id', tenantId)
      .eq('id', created.pipelineId)
    if (error) errors.push(`pipeline: ${error.message}`)
  }
  if (errors.length) throw new Error(`Cleanup Fase 2: ${errors.join('; ')}`)
}

async function main() {
  mkdirSync(runDir, { recursive: true })
  appendEvent({ ts: new Date().toISOString(), type: 'log', message: 'Scripts Fase 2' })
  console.log('\n[agent] Scripts Fase 2')

  let sb
  let admin
  try {
    assertConfig()
    sb = createClient(URL, ANON_KEY)
    admin = createClient(URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { me, operator } = await loadContext(sb, admin)

    let started = Date.now()
    try {
      await scrEmp01(sb, me)
      record('SCR-EMP-01', 'passed', undefined, Date.now() - started)
    } catch (error) {
      record('SCR-EMP-01', 'failed', error instanceof Error ? error.message : String(error), Date.now() - started)
    }

    let card
    started = Date.now()
    try {
      card = await scrFunil01(sb, me, operator)
      record('SCR-FUNIL-01', 'passed', undefined, Date.now() - started)
    } catch (error) {
      record('SCR-FUNIL-01', 'failed', error instanceof Error ? error.message : String(error), Date.now() - started)
    }

    started = Date.now()
    try {
      if (!card) throw new Error('Fixture do funil não foi criada')
      await scrChat01(sb, me, operator, card)
      record('SCR-CHAT-01', 'passed', undefined, Date.now() - started)
    } catch (error) {
      record('SCR-CHAT-01', 'failed', error instanceof Error ? error.message : String(error), Date.now() - started)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    for (const id of Object.keys(CATALOG)) {
      if (!cases.some((item) => item.id === id)) record(id, 'failed', message)
    }
  } finally {
    if (sb) await sb.auth.signOut().catch(() => {})
    if (admin) {
      try {
        await cleanup(admin)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const target = cases.find((item) => item.id === 'SCR-FUNIL-01')
        if (target) {
          target.status = 'failed'
          target.error = target.error ? `${target.error}; ${message}` : message
        }
      }
    }
  }

  const passed = cases.filter((item) => item.status === 'passed').length
  const failed = cases.filter((item) => item.status === 'failed').length
  const summary = {
    ambiente: 'DEV',
    result: failed === 0 ? 'PASS' : 'FAIL',
    summary: { passed, failed, skipped: 0, total: cases.length },
    cases,
  }
  writeFileSync(
    resolve(runDir, 'phase2-scripts-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  )
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
