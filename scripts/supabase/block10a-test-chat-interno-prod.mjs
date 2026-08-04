/**
 * Bloco 10A — chat interno da equipe em PRODUÇÃO (10A.1–10A.6).
 * Espelha block10a-test-chat-interno.mjs (dev).
 *
 * Uso: node scripts/supabase/block10a-test-chat-interno-prod.mjs
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

async function login(sb, email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
}

async function loadMe(sb) {
  const { data: { user } } = await sb.auth.getUser()
  const { data } = await sb
    .from('usuarios')
    .select('id, nome_completo, empresa_id')
    .eq('auth_user_id', user.id)
    .single()
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
  const { data, error } = await sb
    .from('chat_messages')
    .insert(row)
    .select('id, content, context_type, related_card_id')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function getMessages(sb, empresaId, context_type, context_id = null) {
  let q = sb
    .from('chat_messages')
    .select('id, content, context_type, context_id, empresa_id, related_card_id')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: true })
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
  const env = loadEnv(envProd)
  if (!existsSync(tenantFile)) {
    console.error('Rode block3/block4 em prod antes')
    process.exit(1)
  }

  const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
  const EMPRESA_ID = tenant.empresa_id
  const GESTOR_EMAIL = tenant.gestor_email
  const OPERADOR_EMAIL = tenant.operador_email
  const PASSWORD = tenant.password

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  const { data: card } = await admin
    .from('crm_cards')
    .select('id, titulo')
    .eq('empresa_id', EMPRESA_ID)
    .eq('finalizado', false)
    .limit(1)
    .maybeSingle()
  if (!card?.id) throw new Error('Nenhum card ativo — rode Bloco 4')

  const { data: outraEmpresa } = await admin
    .from('empresas')
    .select('id')
    .neq('id', EMPRESA_ID)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()
  const OUTRA_EMPRESA_ID = outraEmpresa?.id

  const cardLabel = `[Card: ${card.titulo}]`
  const suffix = Date.now().toString().slice(-6)

  await login(sb, GESTOR_EMAIL, PASSWORD)
  const gestor = await loadMe(sb)
  const globalMsg = `Mensagem global teste go-live prod ${suffix}`
  await sendMessage(sb, gestor, globalMsg, 'global')
  const globalFeed = await getMessages(sb, EMPRESA_ID, 'global')
  const gestorNome = gestor.nome_completo || 'Gestor Teste'

  const directCardMsg = `Equipe, atenção em ${cardLabel} — prioridade ${suffix}`
  const directed = await sendMessage(sb, gestor, directCardMsg, 'global', null, card.id)
  await sb.auth.signOut()

  await login(sb, GESTOR_EMAIL, PASSWORD)
  const gestor2 = await loadMe(sb)
  const cardMsg = `Discussão interna no card prod ${suffix}`
  await sendMessage(sb, gestor2, cardMsg, 'card', card.id)
  const cardMsgs = await getMessages(sb, EMPRESA_ID, 'card', card.id)
  await sb.auth.signOut()

  await login(sb, OPERADOR_EMAIL, PASSWORD)
  const operador = await loadMe(sb)
  const mention = `[${gestorNome}] pode revisar o card prod ${suffix}?`
  await sendMessage(sb, operador, mention, 'card', card.id)
  const mentionMsgs = await getMessages(sb, EMPRESA_ID, 'card', card.id)
  await sb.auth.signOut()

  await login(sb, GESTOR_EMAIL, PASSWORD)
  const gestor3 = await loadMe(sb)
  const dmText = `DM interno teste prod ${suffix}`
  await sendMessage(sb, gestor3, dmText, 'direct', operador.id)
  await sb.auth.signOut()

  await login(sb, OPERADOR_EMAIL, PASSWORD)
  const { data: dmMsgs, error: dmErr } = await sb
    .from('chat_messages')
    .select('content, context_type')
    .eq('empresa_id', EMPRESA_ID)
    .eq('context_type', 'direct')
    .or(
      `and(sender_id.eq.${gestor3.id},context_id.eq.${operador.id}),and(sender_id.eq.${operador.id},context_id.eq.${gestor3.id})`,
    )
  if (dmErr) throw new Error(dmErr.message)
  await sb.auth.signOut()

  if (OUTRA_EMPRESA_ID) {
    const { data: outroUser } = await admin
      .from('usuarios')
      .select('id')
      .eq('empresa_id', OUTRA_EMPRESA_ID)
      .limit(1)
      .maybeSingle()
    if (outroUser?.id) {
      await admin.from('chat_messages').insert({
        empresa_id: OUTRA_EMPRESA_ID,
        sender_id: outroUser.id,
        content: `msg outra empresa prod ${suffix}`,
        context_type: 'global',
      })
    }
  }

  await login(sb, GESTOR_EMAIL, PASSWORD)
  const { data: leak } = await sb
    .from('chat_messages')
    .select('id')
    .eq('empresa_id', OUTRA_EMPRESA_ID || '00000000-0000-0000-0000-000000000000')
  await sb.auth.signOut()

  await login(sb, OPERADOR_EMAIL, PASSWORD)
  const operadorGlobal = await getMessages(sb, EMPRESA_ID, 'global')
  await sb.auth.signOut()

  const tests = {
    '10A.1_mensagem_global': globalFeed.some((m) => m.content === globalMsg),
    '10A.2_chat_no_card': cardMsgs.some((m) => m.content === cardMsg),
    '10A.3_mencao_nome': mentionMsgs.some((m) => m.content.includes(`[${gestorNome}]`)),
    '10A.4_dm_direto': (dmMsgs ?? []).some((m) => m.content === dmText),
    '10A.5_isolamento_empresa': OUTRA_EMPRESA_ID ? (leak ?? []).length === 0 : true,
    '10A.6_direcionar_card_global': operadorGlobal.some((m) => m.content.includes(cardLabel)),
    '10A.6_related_card_id': directed.related_card_id === card.id,
  }

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(JSON.stringify({ tests, card_id: card.id, outra_empresa: OUTRA_EMPRESA_ID }, null, 2))
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        empresa_id: EMPRESA_ID,
        card_id: card.id,
        outra_empresa_id: OUTRA_EMPRESA_ID,
        tests,
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
