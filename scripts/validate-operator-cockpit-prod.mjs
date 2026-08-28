/**
 * Valida cockpit do operador Monte Sinai em prod — métricas reais vs mock.
 * Uso: node scripts/validate-operator-cockpit-prod.mjs [email]
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env.production') })

const APP = 'https://app.huginflow.com'
const PASSWORD = 'hugin123@2026'
const MONTE_EMPRESA = '415854c0-84a4-489f-a357-2cc0142b6b65'
const OPERATORS = [
  'vendedor@montesinaiatacado.com.br',
  'logistica@montesinaiatacado.com.br',
  'financeiro@montesinaiatacado.com.br',
]
const emailArg = process.argv[2]
const emails = emailArg ? [emailArg] : OPERATORS

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function tomorrowStr() {
  const d = new Date(todayStr())
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

async function login(email) {
  const form = new FormData()
  form.set('email', email)
  form.set('password', PASSWORD)
  const res = await fetch(`${APP}/api/auth/login`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
  })
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const ok = res.headers.get('location')?.includes('/cockpit')
  return { ok, cookies }
}

async function fetchCockpitHtml(cookies) {
  const res = await fetch(`${APP}/cockpit`, { headers: { Cookie: cookies } })
  return res.text()
}

async function queryMetrics(admin, usuarioId) {
  const today = todayStr()
  const tomorrow = tomorrowStr()

  const { count: atrasados } = await admin
    .from('crm_cards')
    .select('*', { count: 'exact', head: true })
    .eq('responsavel_id', usuarioId)
    .eq('finalizado', false)
    .lt('data_prazo', today)

  const { count: hoje } = await admin
    .from('crm_cards')
    .select('*', { count: 'exact', head: true })
    .eq('responsavel_id', usuarioId)
    .eq('finalizado', false)
    .gte('data_prazo', today)
    .lt('data_prazo', tomorrow)

  const { count: movimentacoes } = await admin
    .from('crm_cards_history')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('acao', 'STATUS_CHANGED')
    .gte('created_at', today)

  const { data: cards } = await admin
    .from('crm_cards')
    .select('stage_id, pipeline_stages(nome)')
    .eq('responsavel_id', usuarioId)
    .eq('finalizado', false)

  const grouping = {}
  for (const c of cards ?? []) {
    const name = c.pipeline_stages?.nome ?? 'Sem Nome'
    grouping[name] = (grouping[name] ?? 0) + 1
  }
  const sorted = Object.entries(grouping).sort((a, b) => b[1] - a[1])
  const gargalo = sorted[0] ? `${sorted[0][1]} em ${sorted[0][0]}` : 'Fluindo'

  const { data: activities } = await admin
    .from('crm_cards')
    .select('id, titulo, data_prazo, pipelines(nome), pipeline_stages(nome)')
    .eq('responsavel_id', usuarioId)
    .eq('finalizado', false)
    .order('data_prazo', { ascending: true })

  return { atrasados: atrasados ?? 0, hoje: hoje ?? 0, movimentacoes: movimentacoes ?? 0, gargalo, activities: activities ?? [] }
}

async function queryWhatsApp(admin, usuarioId, role) {
  const { data: rows } = await admin
    .from('crm_conversas')
    .select('sessao_id, created_at, updated_at, atribuido_a_id, status, crm_leads(nome, telefone)')
    .eq('empresa_id', MONTE_EMPRESA)
    .order('created_at', { ascending: false })
    .limit(300)

  const bySessao = new Map()
  for (const row of rows ?? []) {
    const prev = bySessao.get(row.sessao_id)
    const t = new Date(row.updated_at ?? row.created_at).getTime()
    const pt = prev ? new Date(prev.updated_at ?? prev.created_at).getTime() : -1
    if (!prev || t >= pt) bySessao.set(row.sessao_id, row)
  }
  let sessoes = [...bySessao.values()]
  if (role === 'operador') {
    sessoes = sessoes.filter((c) => c.atribuido_a_id === usuarioId || !c.atribuido_a_id)
  }
  return sessoes.slice(0, 10)
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log('=== Validação Cockpit Operador — Monte Sinai (prod) ===\n')

const dashboardHtmlCheck = await fetch(`${APP}/login`).then((r) => r.text())
const hasMockWhatsApp =
  dashboardHtmlCheck.includes('Carlos Eduardo') && dashboardHtmlCheck.includes('Bruno Oliveira')
console.log('Código deployado — fila WhatsApp mock no dashboard:', hasMockWhatsApp ? 'SIM (hardcoded)' : 'não detectado no HTML público')
console.log('')

let allOk = true

for (const email of emails) {
  console.log(`--- ${email} ---`)

  const { data: usuario } = await admin
    .from('usuarios')
    .select('id, nome_completo, role_global, grupo_id, empresa_id')
    .eq('email', email)
    .single()

  if (!usuario) {
    console.log('FAIL: usuário não encontrado em usuarios')
    allOk = false
    console.log('')
    continue
  }

  console.log(`Perfil: ${usuario.nome_completo} | role: ${usuario.role_global} | id: ${usuario.id.slice(0, 8)}…`)

  const session = await login(email)
  if (!session.ok) {
    console.log('FAIL: login')
    allOk = false
    console.log('')
    continue
  }

  const html = await fetchCockpitHtml(session.cookies)
  const seesOperatorDashboard = html.includes('Cockpit do Operador')
  const seesManagerDashboard = html.includes('Cockpit do Gestor') || html.includes('Dashboard Gerencial')
  console.log('Dashboard exibido:', seesOperatorDashboard ? 'Operador ✓' : seesManagerDashboard ? 'Gestor (inesperado)' : 'indeterminado')

  if (usuario.role_global === 'operador' && !seesOperatorDashboard) {
    console.log('WARN: operador deveria ver Cockpit do Operador')
  }

  const metrics = await queryMetrics(admin, usuario.id)
  console.log('Métricas (Supabase — fonte real):')
  console.log(`  Movimentações hoje: ${metrics.movimentacoes}`)
  console.log(`  Cards atrasados:    ${metrics.atrasados}`)
  console.log(`  Atividades hoje:    ${metrics.hoje}`)
  console.log(`  Gargalo:            ${metrics.gargalo}`)
  console.log(`  Cards abertos (feed): ${metrics.activities.length}`)
  if (metrics.activities.length > 0) {
    for (const a of metrics.activities.slice(0, 3)) {
      console.log(`    · ${a.titulo} | prazo: ${a.data_prazo ?? '—'} | ${a.pipelines?.nome ?? '?'}`)
    }
    if (metrics.activities.length > 3) console.log(`    … +${metrics.activities.length - 3}`)
  }

  const whatsapp = await queryWhatsApp(admin, usuario.id, usuario.role_global)
  console.log(`WhatsApp real (crm_conversas, filtrado operador): ${whatsapp.length} thread(s)`)
  for (const w of whatsapp.slice(0, 3)) {
    const lead = w.crm_leads?.nome ?? w.crm_leads?.telefone ?? 'Lead sem nome'
    console.log(`    · ${lead} | status: ${w.status ?? '—'} | atribuído: ${w.atribuido_a_id ? w.atribuido_a_id.slice(0, 8) + '…' : 'livre'}`)
  }
  if (whatsapp.length === 0) console.log('    (nenhuma conversa — fila real vazia)')

  const mockInPage = html.includes('Carlos Eduardo') && html.includes('Maria Fernanda')
  console.log('Fila WhatsApp NO dashboard (/cockpit):', mockInPage ? 'MOCK (Carlos/Bruno/Maria — NÃO é dado real)' : 'sem mock visível')
  console.log('Link "Ver Todos":', html.includes('href="/cockpit/chat"') ? 'QUEBRADO (/cockpit/chat)' : html.includes('/cockpit/crm/chat') ? 'OK (/cockpit/crm/chat)' : '?')

  console.log('')
}

console.log('--- Resumo ---')
console.log('REAL: KPIs (movimentações, atrasados, hoje, gargalo) + feed Atividades → crm_cards / crm_cards_history')
console.log('MOCK: widget "Fila WhatsApp" no dashboard → nomes fictícios; dados reais estão em /cockpit/crm/chat')
console.log('')

process.exit(allOk ? 0 : 1)
