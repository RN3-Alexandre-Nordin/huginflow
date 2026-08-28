/**
 * Bloco 10A — chat interno da equipe (dev) na Empresa Teste Go-Live.
 *
 * Uso: node scripts/supabase/block10a-test-chat-interno.mjs
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
const OPERADOR_EMAIL = 'golive-operador-510160@teste.huginflow.com'
const PASSWORD = 'HuginDevTest1!'
const OUTRA_EMPRESA_ID = '415854c0-84a4-489f-a357-2cc0142b6b65'

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

async function login(sb, email) {
  const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login ${email}: ${error.message}`)
}

async function loadMe(sb) {
  const { data: { user } } = await sb.auth.getUser()
  const { data } = await sb.from('usuarios').select('id, nome_completo, empresa_id')
    .eq('auth_user_id', user.id).single()
  return data
}

async function sendMessage(sb, me, content, context_type, context_id = null, related_card_id = null) {
  const row = {
    empresa_id: me.empresa_id,
    sender_id: me.id,
    content,
    context_type,
    context_id,
  }
  if (related_card_id) row.related_card_id = related_card_id
  const { data, error } = await sb.from('chat_messages').insert(row)
    .select('id, content, context_type, related_card_id').single()
  if (error) throw new Error(error.message)
  return data
}

async function getMessages(sb, context_type, context_id = null) {
  let q = sb.from('chat_messages').select('id, content, context_type, context_id, empresa_id')
    .eq('empresa_id', EMPRESA_ID).order('created_at', { ascending: true })
  if (context_type === 'global') {
    q = q.in('context_type', ['global', 'card'])
  } else {
    q = q.eq('context_type', context_type)
    if (context_id) q = q.eq('context_id', context_id)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

async function main() {
  const env = loadEnvLocal()
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: card } = await admin.from('crm_cards').select('id, titulo')
    .eq('empresa_id', EMPRESA_ID).eq('finalizado', false).limit(1).maybeSingle()
  if (!card?.id) throw new Error('Nenhum card ativo na empresa teste — rode Bloco 4')
  const cardLabel = `[Card: ${card.titulo}]`

  const suffix = Date.now().toString().slice(-6)
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  // 10A.1 — mensagem global (gestor)
  await login(sb, GESTOR_EMAIL)
  const gestor = await loadMe(sb)
  const globalMsg = `Mensagem global teste go-live ${suffix}`
  await sendMessage(sb, gestor, globalMsg, 'global')
  const globalFeed = await getMessages(sb, 'global')
  const gestorNome = gestor.nome_completo || 'Gestor Teste'

  // 10A.6 — direcionar card no chat global (# → [Card: Título])
  const directCardMsg = `Equipe, atenção em ${cardLabel} — prioridade ${suffix}`
  const directed = await sendMessage(sb, gestor, directCardMsg, 'global', null, card.id)
  await sb.auth.signOut()

  // 10A.2 — mensagem no card
  await login(sb, GESTOR_EMAIL)
  const gestor2 = await loadMe(sb)
  const cardMsg = `Discussão interna no card ${suffix}`
  await sendMessage(sb, gestor2, cardMsg, 'card', card.id)
  const cardMsgs = await getMessages(sb, 'card', card.id)
  await sb.auth.signOut()

  // 10A.3 — menção @nome (operador lê)
  await login(sb, OPERADOR_EMAIL)
  const operador = await loadMe(sb)
  const mention = `[${gestorNome}] pode revisar o card ${suffix}?`
  await sendMessage(sb, operador, mention, 'card', card.id)
  const mentionMsgs = await getMessages(sb, 'card', card.id)
  await sb.auth.signOut()

  // 10A.4 — DM gestor ↔ operador
  await login(sb, GESTOR_EMAIL)
  const gestor3 = await loadMe(sb)
  const dmText = `DM interno teste ${suffix}`
  await sendMessage(sb, gestor3, dmText, 'direct', operador.id)
  await sb.auth.signOut()

  await login(sb, OPERADOR_EMAIL)
  const { data: dmMsgs, error: dmErr } = await sb.from('chat_messages').select('content, context_type')
    .eq('empresa_id', EMPRESA_ID).eq('context_type', 'direct')
    .or(`and(sender_id.eq.${gestor3.id},context_id.eq.${operador.id}),and(sender_id.eq.${operador.id},context_id.eq.${gestor3.id})`)
  if (dmErr) throw new Error(dmErr.message)
  await sb.auth.signOut()

  // 10A.5 — isolamento: gestor não vê chat de outra empresa
  const { data: outroUser } = await admin.from('usuarios').select('id')
    .eq('empresa_id', OUTRA_EMPRESA_ID).limit(1).maybeSingle()
  if (outroUser?.id) {
    await admin.from('chat_messages').insert({
      empresa_id: OUTRA_EMPRESA_ID,
      sender_id: outroUser.id,
      content: `msg outra empresa ${suffix}`,
      context_type: 'global',
    })
  }
  await login(sb, GESTOR_EMAIL)
  const { data: leak } = await sb.from('chat_messages').select('id')
    .eq('empresa_id', OUTRA_EMPRESA_ID)
  await sb.auth.signOut()

  // 10A.6 — operador vê direcionamento no feed global
  await login(sb, OPERADOR_EMAIL)
  const operadorGlobal = await getMessages(sb, 'global')
  await sb.auth.signOut()

  const tests = {
    '10A.1_mensagem_global': globalFeed.some((m) => m.content === globalMsg),
    '10A.2_chat_no_card': cardMsgs.some((m) => m.content === cardMsg),
    '10A.3_mencao_nome': mentionMsgs.some((m) => m.content.includes(`[${gestorNome}]`)),
    '10A.4_dm_direto': (dmMsgs ?? []).some((m) => m.content === dmText),
    '10A.5_isolamento_empresa': (leak ?? []).length === 0,
    '10A.6_direcionar_card_global': operadorGlobal.some((m) => m.content.includes(cardLabel)),
    '10A.6_related_card_id': directed.related_card_id === card.id,
  }

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(JSON.stringify({ tests, card_id: card.id }, null, 2))
  }

  console.log(JSON.stringify({ ok: true, tests, card_id: card.id }, null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
