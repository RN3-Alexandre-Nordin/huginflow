/**
 * Bloco 8 — simulador de IA em PRODUÇÃO (8.1–8.3).
 * Usa tenant de scripts/supabase/out/prod-test-tenant.json
 *
 * Uso: node scripts/supabase/block8-test-simulador-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envProd = resolve(root, '.env.production')
const tenantFile = resolve(__dirname, 'out/prod-test-tenant.json')

const EMBEDDING_MODEL = 'text-embedding-3-large'
const DEFAULT_MODEL = 'gpt-4o'

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

function getOpenAiKey(env) {
  let key = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || ''
  const corruptIdx = key.search(/N8N_WEBHOOK=/)
  if (corruptIdx > 0) key = key.slice(0, corruptIdx)
  return key.trim()
}

function hasPermission(user, module, action) {
  if (!user) return false
  if (user.role_global === 'superadmin') return true
  if (!user.grupos_acesso) return false
  if (user.grupos_acesso.is_admin === true) return true
  const perms = user.grupos_acesso.permissoes || {}
  return (perms[module] || []).includes(action)
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

async function generateReply(sb, openai, empresaId, message) {
  const { data: empresa } = await sb
    .from('empresas')
    .select('ai_context_prompt, ai_model')
    .eq('id', empresaId)
    .single()

  const model = empresa?.ai_model?.trim() || DEFAULT_MODEL

  let extraContext = 'Nenhuma informação específica encontrada na base de conhecimento.'
  const emb = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: message })
  const queryEmbedding = emb.data[0]?.embedding ?? []

  const { data: kbContext, error: rpcError } = await sb.rpc('match_knowledge_base', {
    query_embedding: queryEmbedding,
    match_threshold: 0.4,
    match_count: 5,
    org_id: empresaId,
  })

  if (!rpcError && kbContext?.length) {
    extraContext = kbContext
      .map((c) => `[${c.category || 'Geral'}]: ${c.content}`)
      .join('\n')
  }

  const personality = (empresa?.ai_context_prompt || 'Você é um assistente comercial prestativo.')
    .replace(/%22/g, '"')
    .trim()

  const prompt = `${personality}

INSTRUÇÕES:
1. Use a BASE DE CONHECIMENTO como fonte de verdade para fatos da empresa.
2. Se a informação não estiver na base, diga educadamente que vai verificar — não invente preços ou prazos.

BASE DE CONHECIMENTO:
${extraContext}

Pergunta do cliente: ${message}`

  const chat = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
  })

  return {
    text: chat.choices[0]?.message?.content?.trim() ?? '',
    kbHits: kbContext?.length ?? 0,
    extraContext,
  }
}

function responseUsesKnowledge(text) {
  const t = text.toLowerCase()
  return (t.includes('5') && (t.includes('dia') || t.includes('útei') || t.includes('utei'))) ||
    t.includes('prazo de entrega')
}

function responseAvoidsInvention(text) {
  const t = text.toLowerCase()
  const hasFakePrice = /r\$\s*[\d.,]+/.test(t) && t.includes('9999')
  const cautious =
    t.includes('verificar') ||
    t.includes('não tenho') ||
    t.includes('nao tenho') ||
    t.includes('não encontrei') ||
    t.includes('nao encontrei') ||
    t.includes('não possuo') ||
    t.includes('desculpe') ||
    t.includes('infelizmente')
  return !hasFakePrice && (cautious || !t.includes('xpto'))
}

const results = {}

function pass(id, note) {
  results[id] = { ok: true, note }
}

function fail(id, note) {
  results[id] = { ok: false, note }
}

async function main() {
  const env = loadEnv(envProd)
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const openaiKey = getOpenAiKey(env)

  if (!url || !anonKey) {
    console.error('Configure Supabase em .env.production')
    process.exit(1)
  }
  if (!openaiKey) throw new Error('OPENAI_API_KEY ausente')
  if (!existsSync(tenantFile)) {
    console.error('Rode block3/block7 em prod antes')
    process.exit(1)
  }

  const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
  const EMPRESA_ID = tenant.empresa_id
  const GESTOR_EMAIL = tenant.gestor_email
  const OPERADOR_EMAIL = tenant.operador_email
  const PASSWORD = tenant.password

  const openai = new OpenAI({ apiKey: openaiKey })
  const sb = createClient(url, anonKey)

  await sb.auth.signInWithPassword({ email: GESTOR_EMAIL, password: PASSWORD })
  const gestor = await loadProfile(sb)
  if (hasPermission(gestor, 'simulador', 'view')) {
    pass('8.1_gestor', 'simulador.view OK')
  } else {
    fail('8.1_gestor', 'sem permissão simulador.view')
  }
  await sb.auth.signOut()

  await sb.auth.signInWithPassword({ email: OPERADOR_EMAIL, password: PASSWORD })
  const operador = await loadProfile(sb)
  if (hasPermission(operador, 'simulador', 'view')) {
    pass('8.1_operador', 'simulador.view OK')
  } else {
    fail('8.1_operador', 'sem permissão simulador.view')
  }
  await sb.auth.signOut()

  await sb.auth.signInWithPassword({ email: GESTOR_EMAIL, password: PASSWORD })

  const inBaseQ = 'Qual é o prazo de entrega para clientes go-live?'
  const inBase = await generateReply(sb, openai, EMPRESA_ID, inBaseQ)

  const outBaseQ = 'Qual o preço do produto XPTO-9999 que vocês vendem?'
  const outBase = await generateReply(sb, openai, EMPRESA_ID, outBaseQ)

  await sb.auth.signOut()

  if (inBase.kbHits >= 1 && responseUsesKnowledge(inBase.text)) {
    pass('8.2', `RAG ${inBase.kbHits} hits · resposta cita prazo`)
  } else {
    fail('8.2', `kbHits=${inBase.kbHits}, text=${inBase.text.slice(0, 120)}`)
  }

  if (responseAvoidsInvention(outBase.text)) {
    pass('8.3', 'sem preço inventado · resposta cautelosa')
  } else {
    fail('8.3', outBase.text.slice(0, 120))
  }

  const actionsPath = resolve(root, 'src/app/(app)/cockpit/crm/simulador/actions.ts')
  const simChatPath = resolve(root, 'src/app/(app)/cockpit/crm/simulador/SimuladorChat.tsx')
  const actionsSrc = readFileSync(actionsPath, 'utf8')
  const simChatSrc = readFileSync(simChatPath, 'utf8')
  if (actionsSrc.includes('processChatAudio') && actionsSrc.includes('transcribeUploadedBuffer')) {
    pass('8.4', 'simulador com processChatAudio + Whisper')
  } else {
    fail('8.4', 'processChatAudio ausente em actions.ts')
  }
  if (simChatSrc.includes('Mic') && simChatSrc.includes('processChatAudio')) {
    pass('8.4_ui', 'botão de áudio no SimuladorChat')
  } else {
    fail('8.4_ui', 'UI de áudio ausente')
  }

  const allOk = Object.values(results).every((r) => r.ok)
  console.log(
    JSON.stringify(
      {
        ok: allOk,
        empresa_id: EMPRESA_ID,
        knowledge_text_source_id: tenant.knowledge_text_source_id,
        tests: results,
        inBase_preview: inBase.text.slice(0, 180),
        outBase_preview: outBase.text.slice(0, 180),
      },
      null,
      2,
    ),
  )
  if (!allOk) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
