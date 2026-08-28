/**
 * Bloco 10 — dashboard do gestor (dev) na Empresa Teste Go-Live.
 *
 * Valida getManagerDashboardMetrics / getManagerDashboardChart (mesma lógica de actions.ts).
 *
 * Uso: node scripts/supabase/block10-test-dashboard.mjs
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

const GARGALO_MIN_CARDS = 3
const CHATS_JANELA_DIAS = 30
const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

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

function startOfTodayLocal() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function startOfCurrentWeekLocal() {
  const today = startOfTodayLocal()
  const day = today.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset)
  return monday
}

function startOfCurrentMonthLocal() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function isBetween(isoDate, start, end) {
  const time = new Date(isoDate).getTime()
  return time >= start.getTime() && time < end.getTime()
}

function buildChartBuckets(periodo) {
  const now = new Date()
  if (periodo === 'dia') {
    return Array.from({ length: 6 }, (_, index) => ({
      label: `${String(index * 4).padStart(2, '0')}h`,
      valor: 0,
      criados: 0,
      concluidos: 0,
      receita: 0,
      threads: 0,
    }))
  }
  if (periodo === 'semana') {
    return WEEKDAY_LABELS.map((label) => ({
      label,
      valor: 0,
      criados: 0,
      concluidos: 0,
      receita: 0,
      threads: 0,
    }))
  }
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, index) => ({
    label: String(index + 1),
    valor: 0,
    criados: 0,
    concluidos: 0,
    receita: 0,
    threads: 0,
  }))
}

function getChartMetricMeta(metrica) {
  switch (metrica) {
    case 'entrada':
      return { subtitulo: 'Novos cards', unidade: 'count' }
    case 'receita':
      return { subtitulo: 'Receita', unidade: 'currency' }
    case 'whatsapp':
      return { subtitulo: 'Threads', unidade: 'count' }
    default:
      return { subtitulo: 'Conversão', unidade: 'percent' }
  }
}

function applyMetricValues(pontos, metrica) {
  for (const ponto of pontos) {
    if (metrica === 'entrada') ponto.valor = ponto.criados
    else if (metrica === 'receita') ponto.valor = ponto.receita
    else if (metrica === 'whatsapp') ponto.valor = ponto.threads
    else ponto.valor = ponto.criados > 0 ? Math.round((ponto.concluidos / ponto.criados) * 100) : 0
  }
}

function getBucketIndex(isoDate, periodo) {
  const date = new Date(isoDate)
  if (periodo === 'dia') return Math.min(Math.floor(date.getHours() / 4), 5)
  if (periodo === 'semana') {
    const day = date.getDay()
    return day === 0 ? 6 : day - 1
  }
  return date.getDate() - 1
}

function getChartPeriodRange(periodo) {
  const now = new Date()
  const today = startOfTodayLocal()
  if (periodo === 'dia') {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    return { start: today, end, titulo: 'Hoje' }
  }
  if (periodo === 'semana') {
    const start = startOfCurrentWeekLocal()
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    return { start, end, titulo: 'Semana' }
  }
  const start = startOfCurrentMonthLocal()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end, titulo: 'Mês' }
}

function sumCardValues(cards) {
  return (cards ?? []).reduce((total, card) => total + Number(card.valor ?? 0), 0)
}

async function getManagerDashboardMetrics(sb, empresaId) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const chatsSince = new Date(now)
  chatsSince.setDate(chatsSince.getDate() - CHATS_JANELA_DIAS)

  const [vendasMesResult, vendasMesAnteriorResult, leadsResult, chatsResult, cardsAtivosResult] =
    await Promise.all([
      sb.from('crm_cards').select('valor').eq('empresa_id', empresaId).eq('finalizado', true)
        .gte('updated_at', startOfMonth.toISOString()).lt('updated_at', startOfNextMonth.toISOString()),
      sb.from('crm_cards').select('valor').eq('empresa_id', empresaId).eq('finalizado', true)
        .gte('updated_at', startOfPrevMonth.toISOString()).lt('updated_at', startOfMonth.toISOString()),
      sb.from('crm_cards').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('finalizado', false),
      sb.from('crm_conversas').select('sessao_id').eq('empresa_id', empresaId).gte('created_at', chatsSince.toISOString()),
      sb.from('crm_cards').select('stage_id').eq('empresa_id', empresaId).eq('finalizado', false),
    ])

  if (vendasMesResult.error) throw new Error(vendasMesResult.error.message)
  if (leadsResult.error) throw new Error(leadsResult.error.message)

  const vendasMes = sumCardValues(vendasMesResult.data)
  const vendasMesAnterior = sumCardValues(vendasMesAnteriorResult.data)
  let vendasVariacaoPct = null
  if (vendasMesAnterior > 0) {
    vendasVariacaoPct = ((vendasMes - vendasMesAnterior) / vendasMesAnterior) * 100
  } else if (vendasMes > 0) vendasVariacaoPct = 100

  const chatsOperacionais = new Set((chatsResult.data ?? []).map((r) => r.sessao_id).filter(Boolean)).size
  const stageCounts = {}
  for (const card of cardsAtivosResult.data ?? []) {
    if (!card.stage_id) continue
    stageCounts[card.stage_id] = (stageCounts[card.stage_id] ?? 0) + 1
  }
  const gargalos = Object.values(stageCounts).filter((c) => c >= GARGALO_MIN_CARDS).length

  return {
    vendasMes,
    vendasVariacaoPct,
    leadsNoFunil: leadsResult.count ?? 0,
    chatsOperacionais,
    gargalos,
  }
}

async function getManagerDashboardChart(sb, empresaId, periodo, metrica) {
  const { start, end, titulo } = getChartPeriodRange(periodo)
  const { unidade } = getChartMetricMeta(metrica)
  const pontos = buildChartBuckets(periodo)
  const needsCards = metrica !== 'whatsapp'
  const needsConversas = metrica === 'whatsapp'

  const [cardsResult, conversasResult] = await Promise.all([
    needsCards
      ? sb.from('crm_cards').select('created_at, updated_at, finalizado, valor').eq('empresa_id', empresaId)
          .or(`and(created_at.gte.${start.toISOString()},created_at.lt.${end.toISOString()}),and(finalizado.eq.true,updated_at.gte.${start.toISOString()},updated_at.lt.${end.toISOString()})`)
      : Promise.resolve({ data: null, error: null }),
    needsConversas
      ? sb.from('crm_conversas').select('sessao_id, created_at').eq('empresa_id', empresaId)
          .gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
      : Promise.resolve({ data: null, error: null }),
  ])

  if (cardsResult.error) throw new Error(cardsResult.error.message)
  if (conversasResult.error) throw new Error(conversasResult.error.message)

  for (const card of cardsResult.data ?? []) {
    if (isBetween(card.created_at, start, end)) {
      pontos[getBucketIndex(card.created_at, periodo)].criados++
    }
    if (card.finalizado && card.updated_at && isBetween(card.updated_at, start, end)) {
      const bucket = getBucketIndex(card.updated_at, periodo)
      pontos[bucket].concluidos++
      pontos[bucket].receita += Number(card.valor ?? 0)
    }
  }

  if (needsConversas) {
    const threadsPorBucket = pontos.map(() => new Set())
    for (const conversa of conversasResult.data ?? []) {
      if (!conversa.sessao_id || !isBetween(conversa.created_at, start, end)) continue
      threadsPorBucket[getBucketIndex(conversa.created_at, periodo)].add(conversa.sessao_id)
    }
    pontos.forEach((p, i) => { p.threads = threadsPorBucket[i].size })
  }

  applyMetricValues(pontos, metrica)
  return { titulo, metrica, unidade, pontos }
}

function metricsAreRealNumbers(m) {
  const keys = ['vendasMes', 'leadsNoFunil', 'chatsOperacionais', 'gargalos']
  return keys.every((k) => typeof m[k] === 'number' && Number.isFinite(m[k]))
}

async function main() {
  const env = loadEnvLocal()
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  const { error: authErr } = await sb.auth.signInWithPassword({ email: GESTOR_EMAIL, password: PASSWORD })
  if (authErr) throw new Error(`login: ${authErr.message}`)

  const { data: profile } = await sb.from('usuarios').select('id, empresa_id, role_global')
    .eq('auth_user_id', (await sb.auth.getUser()).data.user.id).single()

  if (profile?.empresa_id !== EMPRESA_ID) throw new Error('gestor empresa mismatch')
  if (profile?.role_global !== 'admin') throw new Error('gestor deve ser admin')

  const metrics = await getManagerDashboardMetrics(sb, EMPRESA_ID)

  const chartDia = await getManagerDashboardChart(sb, EMPRESA_ID, 'dia', 'conversao')
  const chartSemana = await getManagerDashboardChart(sb, EMPRESA_ID, 'semana', 'conversao')
  const chartMes = await getManagerDashboardChart(sb, EMPRESA_ID, 'mes', 'conversao')

  const metricIds = ['conversao', 'entrada', 'receita', 'whatsapp']
  const chartsByMetric = {}
  for (const id of metricIds) {
    chartsByMetric[id] = await getManagerDashboardChart(sb, EMPRESA_ID, 'mes', id)
  }

  const hasActivity =
    metrics.leadsNoFunil > 0 ||
    metrics.chatsOperacionais > 0 ||
    metrics.vendasMes > 0

  const tests = {
    '10.1_kpi_numeros_reais': metricsAreRealNumbers(metrics) && hasActivity,
    '10.2_periodo_dia_semana_mes':
      chartDia.pontos.length === 6 &&
      chartSemana.pontos.length === 7 &&
      chartMes.pontos.length >= 28 &&
      chartDia.pontos.length !== chartMes.pontos.length,
    '10.3_quatro_metricas':
      metricIds.every((id) => chartsByMetric[id].metrica === id) &&
      chartsByMetric.conversao.unidade === 'percent' &&
      chartsByMetric.entrada.unidade === 'count' &&
      chartsByMetric.receita.unidade === 'currency' &&
      chartsByMetric.whatsapp.unidade === 'count',
  }

  await sb.auth.signOut()

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(JSON.stringify({
      tests,
      metrics,
      chartLengths: { dia: chartDia.pontos.length, semana: chartSemana.pontos.length, mes: chartMes.pontos.length },
      chartsByMetric: Object.fromEntries(metricIds.map((id) => [id, { unidade: chartsByMetric[id].unidade }])),
    }, null, 2))
  }

  console.log(JSON.stringify({
    ok: true,
    tests,
    metrics,
    chartBuckets: { dia: chartDia.pontos.length, semana: chartSemana.pontos.length, mes: chartMes.pontos.length },
  }, null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
