/**
 * Bloco 8 — simulador de IA (dev) na Empresa Teste Go-Live.
 *
 * Uso: node scripts/supabase/block8-test-simulador.mjs
 */
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envLocal = resolve(root, '.env.local')

const EMPRESA_ID = '645679bd-3f41-4f7d-ba10-98d97cab2a46'
const GESTOR_EMAIL = 'golive-gestor-510160@teste.ragnar.dev'
const OPERADOR_EMAIL = 'golive-operador-510160@teste.ragnar.dev'
const PASSWORD = 'RagnarDevTest1!'
const EMBEDDING_MODEL = 'text-embedding-3-large'
const DEFAULT_MODEL = 'gpt-4o'

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

async function main() {
  const env = loadEnvLocal()
  const openaiKey = env.OPENAI_API_KEY
  if (!openaiKey) throw new Error('OPENAI_API_KEY ausente')

  const openai = new OpenAI({ apiKey: openaiKey })
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  // 8.1 — gestor acessa simulador (permissão)
  await sb.auth.signInWithPassword({ email: GESTOR_EMAIL, password: PASSWORD })
  const gestor = await loadProfile(sb)
  const gestorSimOk = hasPermission(gestor, 'simulador', 'view')
  await sb.auth.signOut()

  // 8.1 — operador acessa simulador
  await sb.auth.signInWithPassword({ email: OPERADOR_EMAIL, password: PASSWORD })
  const operador = await loadProfile(sb)
  const operadorSimOk = hasPermission(operador, 'simulador', 'view')
  await sb.auth.signOut()

  // 8.2 e 8.3 — chat como gestor
  await sb.auth.signInWithPassword({ email: GESTOR_EMAIL, password: PASSWORD })

  const inBaseQ = 'Qual é o prazo de entrega para clientes go-live?'
  const inBase = await generateReply(sb, openai, EMPRESA_ID, inBaseQ)

  const outBaseQ = 'Qual o preço do produto XPTO-9999 que vocês vendem?'
  const outBase = await generateReply(sb, openai, EMPRESA_ID, outBaseQ)

  await sb.auth.signOut()

  const tests = {
    '8.1_gestor_simulador': gestorSimOk,
    '8.1_operador_simulador': operadorSimOk,
    '8.2_rag_usado': inBase.kbHits >= 1 && responseUsesKnowledge(inBase.text),
    // RAG pode retornar chunks com similaridade baixa; o critério é não inventar fatos
    '8.3_sem_inventar': responseAvoidsInvention(outBase.text),
  }

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(
      JSON.stringify({
        tests,
        inBase: { kbHits: inBase.kbHits, text: inBase.text.slice(0, 200) },
        outBase: { kbHits: outBase.kbHits, text: outBase.text.slice(0, 200) },
      }, null, 2),
    )
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        tests,
        inBase_preview: inBase.text.slice(0, 180),
        outBase_preview: outBase.text.slice(0, 180),
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
