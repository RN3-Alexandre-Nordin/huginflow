'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { isDeptSessionsEnabled } from '@/lib/omnichannel/dept-sessions-constants'
import { normalizeWhatsAppPhone } from '@/lib/omnichannel/phone'
import { isOmniMessageDeleted, markOmniMetadataDeleted } from '@/lib/omnichannel/omni-message-deleted'
import { ActiveSpeakerService } from '@/lib/omnichannel/ChatThreadService'
import { canConsultCard, isTenantAdmin } from '@/lib/crm/cardConsultaAccess'

/** Uma entrada por thread (última mensagem de cada sessao_id). */
function dedupeSessoes<T extends { sessao_id: string; created_at?: string; updated_at?: string }>(
  rows: T[],
): T[] {
  const bySessao = new Map<string, T>()
  for (const row of rows) {
    const key = row.sessao_id
    const prev = bySessao.get(key)
    const rowTime = new Date(row.updated_at ?? row.created_at ?? 0).getTime()
    const prevTime = prev
      ? new Date(prev.updated_at ?? prev.created_at ?? 0).getTime()
      : -1
    if (!prev || rowTime >= prevTime) {
      bySessao.set(key, row)
    }
  }
  return Array.from(bySessao.values()).sort(
    (a, b) =>
      new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
      new Date(a.updated_at ?? a.created_at ?? 0).getTime(),
  )
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

async function getUserDepartamentoIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('usuarios_departamentos')
    .select('departamento_id')
    .eq('usuario_id', userId)
  return (data ?? []).map((r) => r.departamento_id).filter(Boolean)
}

/**
 * Operador acessa a sessão WhatsApp se:
 * - for o atribuído da conversa / fila sem dono, OU
 * - for responsável do card, OU
 * - pertencer ao mesmo departamento do funil do card, OU
 * - o grupo dele tiver acesso ao funil do card (pipeline_grupo_acesso).
 */
async function operadorPodeAcessarSessao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: NonNullable<Awaited<ReturnType<typeof getMyProfile>>>,
  sessaoId: string,
  conversa?: { atribuido_a_id?: string | null; status?: string | null } | null,
): Promise<boolean> {
  if (me.role_global !== 'operador') return true

  if (conversa) {
    if (conversa.atribuido_a_id === me.id) return true
    if (!conversa.atribuido_a_id && conversa.status === 'human') return true
  }

  const cardIds = new Set<string>()

  const { data: cardsByConversa } = await supabase
    .from('crm_cards')
    .select('id, responsavel_id, pipeline_id, pipelines(departamento_id)')
    .eq('conversa_id', sessaoId)
    .eq('empresa_id', me.empresa_id)

  for (const c of cardsByConversa ?? []) {
    cardIds.add(c.id)
  }

  const { data: thread } = await supabase
    .from('crm_chat_threads')
    .select('card_id')
    .eq('id', sessaoId)
    .maybeSingle()

  if (thread?.card_id) cardIds.add(thread.card_id)

  if (cardIds.size === 0) return false

  let cards = cardsByConversa ?? []
  const missingIds = [...cardIds].filter((id) => !cards.some((c) => c.id === id))
  if (missingIds.length > 0) {
    const { data: extra } = await supabase
      .from('crm_cards')
      .select('id, responsavel_id, pipeline_id, pipelines(departamento_id)')
      .in('id', missingIds)
      .eq('empresa_id', me.empresa_id)
    cards = [...cards, ...(extra ?? [])]
  }

  const userDeptIds = await getUserDepartamentoIds(supabase, me.id)
  const pipelineIds = [...new Set(cards.map((c) => c.pipeline_id).filter(Boolean))]

  let grupoPipelineIds = new Set<string>()
  if (me.grupo_id && pipelineIds.length > 0) {
    const { data: pga } = await supabase
      .from('pipeline_grupo_acesso')
      .select('pipeline_id')
      .eq('grupo_id', me.grupo_id)
      .in('pipeline_id', pipelineIds)
    grupoPipelineIds = new Set((pga ?? []).map((r) => r.pipeline_id))
  }

  for (const card of cards) {
    const deptId =
      firstRelation(
        (card as { pipelines?: { departamento_id?: string | null } | { departamento_id?: string | null }[] | null })
          .pipelines,
      )?.departamento_id ?? null

    if (
      canConsultCard(me, userDeptIds, {
        responsavel_id: card.responsavel_id,
        departamento_id: deptId,
      })
    ) {
      return true
    }

    // Fallback: grupo do operador tem acesso ao funil (mesmo sem usuarios_departamentos)
    if (card.pipeline_id && grupoPipelineIds.has(card.pipeline_id)) {
      return true
    }
  }

  return false
}

export async function getOmniConversas() {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado', data: [] }

  const supabase = await createClient()

  let query = supabase
    .from('crm_conversas')
    .select(`
      *,
      crm_leads (
        nome,
        telefone,
        whatsapp
      )
    `)
    .order('created_at', { ascending: false })
    .limit(300)

  if (me.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me.empresa_id)
  }

  const { data: rows, error } = await query
  if (error) return { error: error.message, data: [] }

  let sessoes = dedupeSessoes(rows ?? [])

  if (me.role_global === 'operador') {
    const filtered: typeof sessoes = []
    for (const c of sessoes) {
      const row = c as { atribuido_a_id?: string | null; status?: string | null; sessao_id: string }
      if (await operadorPodeAcessarSessao(supabase, me, row.sessao_id, row)) {
        filtered.push(c)
      }
    }
    sessoes = filtered
  }

  const data = sessoes.slice(0, 50).map((row) => ({
    ...row,
    id: row.sessao_id,
  }))

  return { data }
}

/** Carrega sessao_id a partir do card (fallback do deep link / painel WhatsApp). */
export async function getSessaoIdByCardId(cardId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado', data: null as string | null }

  const supabase = await createClient()

  let query = supabase
    .from('crm_cards')
    .select('conversa_id, empresa_id, responsavel_id, lead_id, pipeline_id, pipelines(departamento_id)')
    .eq('id', cardId)

  if (me.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me.empresa_id)
  }

  const { data: card, error } = await query.maybeSingle()
  if (error) return { error: error.message, data: null }
  if (!card) return { error: 'Card não encontrado', data: null }

  // Acesso ao WhatsApp do card: mesma regra de consulta (responsável / depto / grupo do funil)
  if (me.role_global === 'operador') {
    const userDeptIds = await getUserDepartamentoIds(supabase, me.id)
    const deptId =
      firstRelation(
        (card as { pipelines?: { departamento_id?: string | null } | { departamento_id?: string | null }[] | null })
          .pipelines,
      )?.departamento_id ?? null

    let allowedByCard = canConsultCard(me, userDeptIds, {
      responsavel_id: card.responsavel_id,
      departamento_id: deptId,
    })

    if (!allowedByCard && me.grupo_id && card.pipeline_id) {
      const { data: pga } = await supabase
        .from('pipeline_grupo_acesso')
        .select('pipeline_id')
        .eq('grupo_id', me.grupo_id)
        .eq('pipeline_id', card.pipeline_id)
        .maybeSingle()
      allowedByCard = Boolean(pga)
    }

    if (!allowedByCard) {
      return { error: 'Sem permissão para a conversa WhatsApp deste card', data: null }
    }
  }

  const resolved = await resolveWhatsAppSessaoForCard(supabase, {
    cardId,
    conversaId: card.conversa_id,
    leadId: card.lead_id,
    empresaId: card.empresa_id,
  })

  if (!resolved) return { error: 'Card sem conversa vinculada', data: null }

  return { data: resolved }
}

/**
 * Escolhe a sessão WhatsApp com histórico real.
 * Evita thread órfã vazia criada no handover quando as msgs estão na sessão inbound.
 */
async function resolveWhatsAppSessaoForCard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    cardId: string
    conversaId: string | null
    leadId: string | null
    empresaId: string
  },
): Promise<string | null> {
  const candidates = new Set<string>()
  if (input.conversaId) candidates.add(input.conversaId)

  const { data: threadByCard } = await supabase
    .from('crm_chat_threads')
    .select('id')
    .eq('card_id', input.cardId)
    .neq('status', 'closed')
    .order('updated_at', { ascending: false })
    .limit(3)

  for (const t of threadByCard ?? []) {
    if (t.id) candidates.add(t.id)
  }

  if (input.leadId) {
    const { data: leadInteracoes } = await supabase
      .from('crm_interacoes')
      .select('conversa_id')
      .eq('lead_id', input.leadId)
      .eq('empresa_id', input.empresaId)
      .not('conversa_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)

    for (const row of leadInteracoes ?? []) {
      if (row.conversa_id) candidates.add(row.conversa_id)
    }

    const { data: leadConversas } = await supabase
      .from('crm_conversas')
      .select('sessao_id')
      .eq('lead_id', input.leadId)
      .eq('empresa_id', input.empresaId)
      .order('created_at', { ascending: false })
      .limit(50)

    for (const row of leadConversas ?? []) {
      if (row.sessao_id) candidates.add(row.sessao_id)
    }
  }

  if (candidates.size === 0) return null

  let best: string | null = null
  let bestScore = -1

  for (const sessaoId of candidates) {
    const [{ count: interacoesCount }, { count: conversasCount }] = await Promise.all([
      supabase
        .from('crm_interacoes')
        .select('id', { count: 'exact', head: true })
        .eq('conversa_id', sessaoId),
      supabase
        .from('crm_conversas')
        .select('id', { count: 'exact', head: true })
        .eq('sessao_id', sessaoId),
    ])

    const score = (interacoesCount ?? 0) + (conversasCount ?? 0)
    // Prefere a conversa_id do card em empate; senão a com mais histórico
    const tieBreak = sessaoId === input.conversaId ? 0.5 : 0
    if (score + tieBreak > bestScore) {
      bestScore = score + tieBreak
      best = sessaoId
    }
  }

  // Se a sessão escolhida tem histórico e difere da gravada no card, corrige o vínculo
  if (best && best !== input.conversaId && bestScore >= 1) {
    await supabase
      .from('crm_cards')
      .update({ conversa_id: best, updated_at: new Date().toISOString() })
      .eq('id', input.cardId)
      .eq('empresa_id', input.empresaId)
  }

  return best ?? input.conversaId
}

/** Carrega uma sessão específica (deep link a partir do card). */
export async function getOmniConversaBySessao(sessaoId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado', data: null }

  const supabase = await createClient()

  let query = supabase
    .from('crm_conversas')
    .select(`
      *,
      crm_leads (
        nome,
        telefone,
        whatsapp
      )
    `)
    .eq('sessao_id', sessaoId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (me.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me.empresa_id)
  }

  const { data: rows, error } = await query
  if (error) return { error: error.message, data: null }
  const row = rows?.[0]
  if (row) {
    const allowed = await operadorPodeAcessarSessao(supabase, me, sessaoId, row)
    if (!allowed) return { error: 'Sem permissão para esta conversa', data: null }
    return {
      data: {
        ...row,
        id: row.sessao_id,
      },
    }
  }

  // Fallback: sessão só em thread/interações (sem linhas em crm_conversas)
  const { data: thread } = await supabase
    .from('crm_chat_threads')
    .select('id, empresa_id, lead_id, status, external_id')
    .eq('id', sessaoId)
    .maybeSingle()

  if (thread) {
    if (me.role_global !== 'superadmin' && thread.empresa_id !== me.empresa_id) {
      return { error: 'Sem permissão para esta conversa', data: null }
    }

    const allowedThread = await operadorPodeAcessarSessao(supabase, me, sessaoId, {
      status: thread.status,
      atribuido_a_id: null,
    })
    if (!allowedThread) return { error: 'Sem permissão para esta conversa', data: null }

    let leadFromThread: {
      nome?: string | null
      telefone?: string | null
      whatsapp?: string | null
    } | null = null
    if (thread.lead_id) {
      const { data: leadRow } = await supabase
        .from('crm_leads')
        .select('nome, telefone, whatsapp')
        .eq('id', thread.lead_id)
        .maybeSingle()
      leadFromThread = leadRow
    }

    return {
      data: {
        id: sessaoId,
        sessao_id: sessaoId,
        empresa_id: thread.empresa_id,
        lead_id: thread.lead_id,
        external_id: thread.external_id,
        status: thread.status,
        crm_leads: leadFromThread,
      },
    }
  }

  // Fallback: card com conversa_id + histórico só em crm_interacoes
  // (comum após triagem/handover sem gravar crm_conversas/thread)
  let cardQuery = supabase
    .from('crm_cards')
    .select('id, empresa_id, lead_id, conversa_id, cliente_nome, titulo, responsavel_id')
    .eq('conversa_id', sessaoId)
    .limit(1)
  if (me.role_global !== 'superadmin') {
    cardQuery = cardQuery.eq('empresa_id', me.empresa_id)
  }
  const { data: cardByConversa } = await cardQuery.maybeSingle()
  if (!cardByConversa) return { error: 'Conversa não encontrada', data: null }

  const allowedCard = await operadorPodeAcessarSessao(supabase, me, sessaoId, null)
  if (!allowedCard) return { error: 'Sem permissão para esta conversa', data: null }

  let leadFromCard: {
    nome?: string | null
    telefone?: string | null
    whatsapp?: string | null
  } | null = null
  if (cardByConversa.lead_id) {
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('nome, telefone, whatsapp')
      .eq('id', cardByConversa.lead_id)
      .maybeSingle()
    leadFromCard = leadRow
  }

  const { data: lastMsg } = await supabase
    .from('crm_interacoes')
    .select('content, created_at, role')
    .eq('conversa_id', sessaoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const externalId =
    leadFromCard?.telefone || leadFromCard?.whatsapp || null

  return {
    data: {
      id: sessaoId,
      sessao_id: sessaoId,
      empresa_id: cardByConversa.empresa_id,
      lead_id: cardByConversa.lead_id,
      external_id: externalId,
      status: 'human',
      last_message: lastMsg?.content ?? cardByConversa.titulo ?? null,
      updated_at: lastMsg?.created_at ?? null,
      role: lastMsg?.role ?? null,
      crm_leads: leadFromCard ?? {
        nome: cardByConversa.cliente_nome,
        telefone: null,
        whatsapp: null,
      },
    },
  }
}

export async function getOmniMensagens(sessaoId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado', data: [] }

  const supabase = await createClient()

  const { data: conversa, error: convErr } = await supabase
    .from('crm_conversas')
    .select('sessao_id, empresa_id, atribuido_a_id, status')
    .eq('sessao_id', sessaoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let empresaId = conversa?.empresa_id ?? null
  let accessSnapshot: { atribuido_a_id?: string | null; status?: string | null } | null =
    conversa ?? null

  if (convErr) {
    return { error: convErr.message, data: [] }
  }

  // Sessão pode existir só como thread + crm_interacoes (sem linhas em crm_conversas)
  if (!conversa) {
    const { data: thread } = await supabase
      .from('crm_chat_threads')
      .select('id, empresa_id, status')
      .eq('id', sessaoId)
      .maybeSingle()

    if (thread) {
      empresaId = thread.empresa_id
      accessSnapshot = { status: thread.status, atribuido_a_id: null }
    } else {
      const { data: card } = await supabase
        .from('crm_cards')
        .select('id, empresa_id, responsavel_id')
        .eq('conversa_id', sessaoId)
        .limit(1)
        .maybeSingle()
      if (!card) return { error: 'Conversa não encontrada', data: [] }
      empresaId = card.empresa_id
      accessSnapshot = null
    }
  }

  if (me.role_global !== 'superadmin' && empresaId && empresaId !== me.empresa_id) {
    return { error: 'Sem permissão para esta conversa', data: [] }
  }

  const allowed = await operadorPodeAcessarSessao(supabase, me, sessaoId, accessSnapshot)
  if (!allowed) return { error: 'Sem permissão para esta conversa', data: [] }

  const { data, error } = await supabase
    .from('crm_interacoes')
    .select('*, usuarios(nome_completo)')
    .eq('conversa_id', sessaoId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return { error: error.message, data: [] }

  const { data: historicoRows } = await supabase
    .from('crm_conversas')
    .select('content, created_at, metadata')
    .eq('sessao_id', sessaoId)
    .order('created_at', { ascending: true })
    .limit(200)

  const deletedHistorico = (historicoRows ?? []).filter((row) => isOmniMessageDeleted(row.metadata))

  function overlayDeleted<T extends { content: string; created_at: string; metadata?: unknown }>(
    row: T,
  ): T {
    if (isOmniMessageDeleted(row.metadata)) return row
    const hit = deletedHistorico.find(
      (hist) =>
        hist.content === row.content &&
        Math.abs(new Date(hist.created_at).getTime() - new Date(row.created_at).getTime()) < 15_000,
    )
    if (!hit) return row
    return {
      ...row,
      metadata: markOmniMetadataDeleted(row.metadata),
    }
  }

  // Fallback: histórico legado só em crm_conversas
  if (!data?.length) {
    const { data: legacyRows } = await supabase
      .from('crm_conversas')
      .select('id, content, role, created_at, metadata, atribuido_a_id')
      .eq('sessao_id', sessaoId)
      .order('created_at', { ascending: true })
      .limit(200)

    if (legacyRows?.length) {
      return {
        data: legacyRows.map((row) => {
          const marked = overlayDeleted(row)
          return {
            id: marked.id,
            content: marked.content,
            role: marked.role as 'user' | 'assistant' | 'system',
            created_at: marked.created_at,
            user_id: marked.atribuido_a_id,
            metadata: marked.metadata,
            usuarios: null,
          }
        }),
      }
    }
  }

  return { data: (data ?? []).map((row) => overlayDeleted(row)) }
}

type OmniRedirectCardRow = {
  id: string
  titulo: string | null
  cliente_nome: string | null
  valor: number | null
  descricao: string | null
  observacao: string | null
  responsavel_id: string | null
  data_prazo: string | null
  stage_id: string
  lead_id: string | null
  pipeline_id: string
  conversa_id: string | null
  pipelines: {
    id: string
    nome: string
    pipeline_stages: { id: string; nome: string; ordem: number | null }[] | null
  } | null
}

function asOmniRedirectCard(data: unknown): OmniRedirectCardRow {
  const row = data as OmniRedirectCardRow
  return {
    ...row,
    pipelines: firstRelation(row.pipelines),
  }
}

/**
 * Resolve card aberto da sessão (respeita RLS: só stages do grupo do operador).
 * Fallbacks: conversa_id → thread.card_id → card aberto do lead (ainda sob RLS).
 */
async function findOpenCardForSessao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: NonNullable<Awaited<ReturnType<typeof getMyProfile>>>,
  sessaoId: string,
  cardIdHint?: string | null,
): Promise<{ card: OmniRedirectCardRow | null; error?: string }> {
  const select = `
    id, titulo, cliente_nome, valor, descricao, observacao, responsavel_id, data_prazo,
    stage_id, lead_id, pipeline_id, conversa_id,
    pipelines ( id, nome, pipeline_stages ( id, nome, ordem ) )
  `

  if (cardIdHint) {
    let q = supabase
      .from('crm_cards')
      .select(select)
      .eq('id', cardIdHint)
      .eq('finalizado', false)

    if (me.role_global !== 'superadmin') {
      q = q.eq('empresa_id', me.empresa_id)
    }

    const { data, error } = await q.maybeSingle()
    if (error) return { card: null, error: error.message }
    if (!data) {
      // Hint existe mas RLS/grupo bloqueou — deixa o caller montar mensagem de outro depto
      return { card: null }
    }
    const row = asOmniRedirectCard(data)
    if (row.conversa_id && row.conversa_id !== sessaoId) {
      const { data: thread } = await supabase
        .from('crm_chat_threads')
        .select('card_id')
        .eq('id', sessaoId)
        .maybeSingle()
      if (thread?.card_id !== row.id) {
        return { card: null, error: 'Card não pertence a esta conversa' }
      }
    }
    return { card: row }
  }

  // 1) conversa_id no card
  {
    let q = supabase
      .from('crm_cards')
      .select(select)
      .eq('conversa_id', sessaoId)
      .eq('finalizado', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (me.role_global !== 'superadmin') {
      q = q.eq('empresa_id', me.empresa_id)
    }

    const { data, error } = await q.maybeSingle()
    if (error) return { card: null, error: error.message }
    if (data) return { card: asOmniRedirectCard(data) }
  }

  // 2) thread.card_id (só se o card for visível via RLS)
  {
    const { data: thread } = await supabase
      .from('crm_chat_threads')
      .select('card_id')
      .eq('id', sessaoId)
      .maybeSingle()

    if (thread?.card_id) {
      let q = supabase
        .from('crm_cards')
        .select(select)
        .eq('id', thread.card_id)
        .eq('finalizado', false)

      if (me.role_global !== 'superadmin') {
        q = q.eq('empresa_id', me.empresa_id)
      }

      const { data, error } = await q.maybeSingle()
      if (error) return { card: null, error: error.message }
      if (data) return { card: asOmniRedirectCard(data) }
    }
  }

  return { card: null }
}

type InaccessibleCardDiag = {
  id: string
  titulo: string | null
  responsavel_id: string | null
  pipeline_id: string
  conversa_id: string | null
  pipelines:
    | { nome: string; departamento_id: string | null }
    | { nome: string; departamento_id: string | null }[]
    | null
}

/**
 * Diagnóstico (admin): card aberto existe (nesta sessão, no lead ou no mesmo telefone),
 * mas está inacessível ao grupo/departamento do operador — evita o falso "nenhum card".
 */
async function describeInaccessibleCardForSessao(
  me: NonNullable<Awaited<ReturnType<typeof getMyProfile>>>,
  sessaoId: string,
  cardIdHint?: string | null,
): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const empresaId = me.empresa_id
    if (!empresaId && me.role_global !== 'superadmin') return null

    const select = `
      id, titulo, responsavel_id, pipeline_id, conversa_id,
      pipelines ( nome, departamento_id )
    `

    const loadOpenCardById = async (id: string) => {
      let q = admin.from('crm_cards').select(select).eq('id', id).eq('finalizado', false)
      if (me.role_global !== 'superadmin') q = q.eq('empresa_id', empresaId!)
      const { data } = await q.maybeSingle()
      return (data as InaccessibleCardDiag | null) ?? null
    }

    let card: InaccessibleCardDiag | null = null

    if (cardIdHint) {
      card = await loadOpenCardById(cardIdHint)
    }

    if (!card) {
      let q = admin
        .from('crm_cards')
        .select(select)
        .eq('conversa_id', sessaoId)
        .eq('finalizado', false)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (me.role_global !== 'superadmin') q = q.eq('empresa_id', empresaId!)
      const { data } = await q.maybeSingle()
      card = (data as InaccessibleCardDiag | null) ?? null
    }

    const { data: thread } = await admin
      .from('crm_chat_threads')
      .select('card_id, lead_id, external_id, empresa_id')
      .eq('id', sessaoId)
      .maybeSingle()

    if (!card && thread?.card_id) {
      card = await loadOpenCardById(thread.card_id)
    }

    // Mesmo lead: card aberto em outro funil/sessão (ex.: Financeiro vê chat, card no Comercial)
    if (!card && thread?.lead_id) {
      let q = admin
        .from('crm_cards')
        .select(select)
        .eq('lead_id', thread.lead_id)
        .eq('finalizado', false)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (me.role_global !== 'superadmin') q = q.eq('empresa_id', empresaId!)
      const { data } = await q.maybeSingle()
      card = (data as InaccessibleCardDiag | null) ?? null
    }

    // Mesmo telefone / threads irmãs (quando lead_id diverge entre sessões)
    if (!card && thread?.external_id) {
      let siblingsQ = admin
        .from('crm_chat_threads')
        .select('id, card_id')
        .eq('external_id', thread.external_id)
        .neq('id', sessaoId)
      if (thread.empresa_id) siblingsQ = siblingsQ.eq('empresa_id', thread.empresa_id)
      else if (empresaId) siblingsQ = siblingsQ.eq('empresa_id', empresaId!)

      const { data: siblings } = await siblingsQ.limit(40)
      const siblingIds = (siblings ?? []).map((s) => s.id).filter(Boolean)
      const siblingCardIds = (siblings ?? [])
        .map((s) => s.card_id)
        .filter((id): id is string => Boolean(id))

      if (siblingIds.length > 0) {
        let q = admin
          .from('crm_cards')
          .select(select)
          .in('conversa_id', siblingIds)
          .eq('finalizado', false)
          .order('updated_at', { ascending: false })
          .limit(1)
        if (me.role_global !== 'superadmin') q = q.eq('empresa_id', empresaId!)
        const { data } = await q.maybeSingle()
        card = (data as InaccessibleCardDiag | null) ?? null
      }

      if (!card && siblingCardIds.length > 0) {
        let q = admin
          .from('crm_cards')
          .select(select)
          .in('id', siblingCardIds)
          .eq('finalizado', false)
          .order('updated_at', { ascending: false })
          .limit(1)
        if (me.role_global !== 'superadmin') q = q.eq('empresa_id', empresaId!)
        const { data } = await q.maybeSingle()
        card = (data as InaccessibleCardDiag | null) ?? null
      }
    }

    if (!card) return null

    const pipe = firstRelation(card.pipelines)
    let deptoNome = 'outro departamento'
    if (pipe?.departamento_id) {
      const { data: depto } = await admin
        .from('departamentos')
        .select('nome')
        .eq('id', pipe.departamento_id)
        .maybeSingle()
      if (depto?.nome?.trim()) deptoNome = depto.nome.trim()
    }

    let respNome = 'um colega'
    if (card.responsavel_id) {
      const { data: resp } = await admin
        .from('usuarios')
        .select('nome_completo')
        .eq('id', card.responsavel_id)
        .maybeSingle()
      if (resp?.nome_completo?.trim()) respNome = resp.nome_completo.trim()
    }

    const funilNome = pipe?.nome?.trim() || 'outro funil'
    const sameSession =
      card.conversa_id === sessaoId || thread?.card_id === card.id
    const escopo = sameSession
      ? 'vinculado a esta conversa'
      : 'aberto deste cliente (em outra sessão/funil)'

    return `Há um card ${escopo} no departamento ${deptoNome} (funil ${funilNome}), mas ele não está acessível para o seu usuário. Responsável: ${respNome}. Consulte o resumo no painel Contexto do cliente à direita — Encaminhar só é permitido no funil do seu departamento.`
  } catch (err) {
    console.error('[omni] describeInaccessibleCardForSessao', err)
    return null
  }
}

/** Card aberto vinculado à sessão (para exibir ação no header do chat). */
export async function getLinkedCardBySessao(sessaoId: string, cardIdHint?: string | null) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado', data: null as { id: string; titulo: string } | null }

  const supabase = await createClient()

  const { data: convRows } = await supabase
    .from('crm_conversas')
    .select('atribuido_a_id, status')
    .eq('sessao_id', sessaoId)
    .order('updated_at', { ascending: false })
    .limit(1)

  const allowed = await operadorPodeAcessarSessao(supabase, me, sessaoId, convRows?.[0] ?? null)
  if (!allowed) return { error: 'Sem permissão para esta conversa', data: null }

  const { card, error } = await findOpenCardForSessao(supabase, me, sessaoId, cardIdHint)
  if (error) return { error, data: null }
  if (!card) return { data: null }

  return {
    data: {
      id: card.id,
      titulo: card.titulo || card.cliente_nome || 'Card',
    },
  }
}

/** Contexto completo para encaminhar card a partir do chat omnichannel. */
export async function getCardForOmniRedirect(sessaoId: string, cardIdHint?: string | null) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }

  if (!hasPermission(me, 'cards', 'edit')) {
    return { error: 'Sem permissão para encaminhar cards' }
  }

  const supabase = await createClient()

  const { data: convRows } = await supabase
    .from('crm_conversas')
    .select('atribuido_a_id, status')
    .eq('sessao_id', sessaoId)
    .order('updated_at', { ascending: false })
    .limit(1)

  const allowed = await operadorPodeAcessarSessao(supabase, me, sessaoId, convRows?.[0] ?? null)
  if (!allowed) return { error: 'Sem permissão para esta conversa' }

  const { card, error } = await findOpenCardForSessao(supabase, me, sessaoId, cardIdHint)
  if (error) return { error }
  if (!card) {
    const inaccessible = await describeInaccessibleCardForSessao(me, sessaoId, cardIdHint)
    if (inaccessible) return { error: inaccessible }
    return {
      error:
        'Nenhum card aberto vinculado a esta conversa. Finalize a venda ou vincule um card no funil.',
    }
  }

  const stages = [...(card.pipelines?.pipeline_stages ?? [])].sort(
    (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0),
  )

  return {
    data: {
      card: {
        id: card.id,
        titulo: card.titulo || '',
        cliente_nome: card.cliente_nome,
        valor: card.valor,
        descricao: card.descricao,
        observacao: card.observacao,
        responsavel_id: card.responsavel_id,
        data_prazo: card.data_prazo,
        stage_id: card.stage_id,
        lead_id: card.lead_id,
      },
      pipelineId: card.pipeline_id,
      pipelineName: card.pipelines?.nome ?? 'Funil atual',
      stages,
      canMove: hasPermission(me, 'cards', 'move'),
    },
  }
}

export type OmniCustomerContextLead = {
  id: string | null
  nome: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  empresa_cliente: string | null
  cargo: string | null
  documento: string | null
  created_at: string | null
  registered: boolean
}

export type OmniCustomerContextCard = {
  id: string
  titulo: string
  solicitacao: string
  pipeline_id: string
  pipeline_nome: string
  stage_nome: string
  departamento_id: string | null
  departamento_nome: string | null
  finalizado: boolean
  created_at: string
  isCurrentSession: boolean
  canOpen: boolean
}

export type OmniCustomerContext = {
  lead: OmniCustomerContextLead
  currentSessionCard: OmniCustomerContextCard | null
  recentCards: OmniCustomerContextCard[]
  otherDepartmentCards: OmniCustomerContextCard[]
  activeSpeaker: {
    departamentoNome: string | null
    isOtherDepartment: boolean
  } | null
  stats: {
    totalCards90d: number
    openCount: number
  }
}

type ContextCardRow = {
  id: string
  titulo: string | null
  descricao: string | null
  observacao: string | null
  finalizado: boolean | null
  created_at: string
  pipeline_id: string
  conversa_id: string | null
  responsavel_id: string | null
  lead_id: string | null
  pipelines:
    | {
        id: string
        nome: string
        departamento_id: string | null
        departamentos: { id: string; nome: string } | { id: string; nome: string }[] | null
      }
    | {
        id: string
        nome: string
        departamento_id: string | null
        departamentos: { id: string; nome: string } | { id: string; nome: string }[] | null
      }[]
    | null
  pipeline_stages: { nome: string } | { nome: string }[] | null
}

function cardSolicitacao(card: Pick<ContextCardRow, 'titulo' | 'descricao' | 'observacao'>): string {
  const obs = card.observacao?.trim()
  if (obs) return obs.length > 120 ? `${obs.slice(0, 117)}…` : obs
  const desc = card.descricao?.trim()
  if (desc) return desc.length > 120 ? `${desc.slice(0, 117)}…` : desc
  const titulo = card.titulo?.trim()
  return titulo || 'Sem descrição'
}

function normalizeContextCard(
  row: ContextCardRow,
  opts: {
    sessaoId: string
    userDeptIds: string[]
    me: NonNullable<Awaited<ReturnType<typeof getMyProfile>>>
    isTenantAdmin: boolean
  },
): OmniCustomerContextCard {
  const pipeline = firstRelation(row.pipelines)
  const stage = firstRelation(row.pipeline_stages)
  const departamento = firstRelation(pipeline?.departamentos ?? null)
  const departamentoId = pipeline?.departamento_id ?? departamento?.id ?? null
  const accessOpts = {
    responsavel_id: row.responsavel_id,
    departamento_id: departamentoId,
  }

  return {
    id: row.id,
    titulo: row.titulo?.trim() || 'Card',
    solicitacao: cardSolicitacao(row),
    pipeline_id: row.pipeline_id,
    pipeline_nome: pipeline?.nome ?? 'Funil',
    stage_nome: stage?.nome ?? '—',
    departamento_id: departamentoId,
    departamento_nome: departamento?.nome ?? null,
    finalizado: row.finalizado === true,
    created_at: row.created_at,
    isCurrentSession: row.conversa_id === opts.sessaoId && row.finalizado !== true,
    canOpen: hasPermission(opts.me, 'cards', 'view'),
  }
}

async function resolveActiveSpeaker(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: string,
  sessaoId: string,
  phone: string | null,
  userDeptIds: string[],
): Promise<OmniCustomerContext['activeSpeaker']> {
  if (!isDeptSessionsEnabled() || !phone) return null

  const externalId = normalizeWhatsAppPhone(phone)
  if (!externalId) return null

  const { data: canal } = await supabase
    .from('crm_canais')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'whatsapp')
    .limit(1)
    .maybeSingle()

  if (!canal) return null

  const speaker = await ActiveSpeakerService.get(supabase, empresaId, canal.id, externalId)
  if (!speaker?.active_departamento_id && !speaker?.active_sessao_id) return null

  let departamentoNome: string | null = null
  if (speaker.active_departamento_id) {
    const { data: dep } = await supabase
      .from('departamentos')
      .select('nome')
      .eq('id', speaker.active_departamento_id)
      .maybeSingle()
    departamentoNome = dep?.nome ?? null
  }

  const isActiveHere = speaker.active_sessao_id === sessaoId
  const isOtherDepartment =
    !isActiveHere &&
    !!speaker.active_departamento_id &&
    !userDeptIds.includes(speaker.active_departamento_id)

  if (!departamentoNome && !isOtherDepartment) return null

  return {
    departamentoNome,
    isOtherDepartment: isOtherDepartment || (!isActiveHere && !!departamentoNome),
  }
}

/** Lead, cards do atendimento e histórico para o painel lateral do chat. */
export async function getOmniCustomerContext(sessaoId: string, cardIdHint?: string | null) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' as const }

  const supabase = await createClient()

  let convQuery = supabase
    .from('crm_conversas')
    .select(`
      sessao_id,
      empresa_id,
      lead_id,
      atribuido_a_id,
      status,
      crm_leads (
        id,
        nome,
        telefone,
        whatsapp,
        email,
        empresa_cliente,
        cargo,
        documento,
        created_at
      )
    `)
    .eq('sessao_id', sessaoId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (me.role_global !== 'superadmin') {
    convQuery = convQuery.eq('empresa_id', me.empresa_id)
  }

  const { data: convRows, error: convErr } = await convQuery
  if (convErr) return { error: convErr.message }
  const conversa = convRows?.[0]
  if (!conversa) return { error: 'Conversa não encontrada' }

  const allowed = await operadorPodeAcessarSessao(supabase, me, sessaoId, conversa)
  if (!allowed) return { error: 'Sem permissão para esta conversa' }

  const userDeptIds = await getUserDepartamentoIds(supabase, me.id)
  const tenantAdmin = isTenantAdmin(me)

  const { card: sessionCardRow } = await findOpenCardForSessao(
    supabase,
    me,
    sessaoId,
    cardIdHint,
  )

  const leadFromConversa = firstRelation(
    (conversa as {
      crm_leads?:
        | {
            id: string
            nome: string | null
            telefone: string | null
            whatsapp: string | null
            email: string | null
            empresa_cliente: string | null
            cargo: string | null
            documento: string | null
            created_at: string | null
          }
        | {
            id: string
            nome: string | null
            telefone: string | null
            whatsapp: string | null
            email: string | null
            empresa_cliente: string | null
            cargo: string | null
            documento: string | null
            created_at: string | null
          }[]
        | null
    }).crm_leads,
  )

  let leadId = conversa.lead_id ?? sessionCardRow?.lead_id ?? leadFromConversa?.id ?? null

  let leadRecord: OmniCustomerContextLead | null = null

  if (leadId) {
    let leadQ = supabase
      .from('crm_leads')
      .select(
        'id, nome, telefone, whatsapp, email, empresa_cliente, cargo, documento, created_at',
      )
      .eq('id', leadId)

    if (me.role_global !== 'superadmin') {
      leadQ = leadQ.eq('empresa_id', me.empresa_id)
    }

    const { data: leadRow } = await leadQ.maybeSingle()
    if (leadRow) {
      leadRecord = {
        ...leadRow,
        registered: true,
      }
    }
  }

  const fallbackLead = leadFromConversa

  const lead: OmniCustomerContextLead = leadRecord ?? {
    id: fallbackLead?.id ?? null,
    nome: fallbackLead?.nome ?? null,
    telefone: fallbackLead?.telefone ?? null,
    whatsapp: fallbackLead?.whatsapp ?? null,
    email: fallbackLead?.email ?? null,
    empresa_cliente: fallbackLead?.empresa_cliente ?? null,
    cargo: fallbackLead?.cargo ?? null,
    documento: fallbackLead?.documento ?? null,
    created_at: fallbackLead?.created_at ?? null,
    registered: Boolean(leadId || fallbackLead?.id),
  }

  const cardSelect = `
    id, titulo, descricao, observacao, finalizado, created_at, pipeline_id, conversa_id,
    responsavel_id, lead_id,
    pipelines ( id, nome, departamento_id, departamentos ( id, nome ) ),
    pipeline_stages ( nome )
  `

  let allCards: ContextCardRow[] = []

  if (leadId) {
    let cardsQ = supabase
      .from('crm_cards')
      .select(cardSelect)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(25)

    if (me.role_global !== 'superadmin') {
      cardsQ = cardsQ.eq('empresa_id', me.empresa_id)
    }

    const { data: cardRows } = await cardsQ
    allCards = (cardRows ?? []) as ContextCardRow[]
  } else if (sessionCardRow) {
    let cardQ = supabase
      .from('crm_cards')
      .select(cardSelect)
      .eq('id', sessionCardRow.id)

    if (me.role_global !== 'superadmin') {
      cardQ = cardQ.eq('empresa_id', me.empresa_id)
    }

    const { data: single } = await cardQ.maybeSingle()
    if (single) allCards = [single as ContextCardRow]
  }

  const cardOpts = { sessaoId, userDeptIds, me, isTenantAdmin: tenantAdmin }
  const normalized = allCards.map((row) => normalizeContextCard(row, cardOpts))

  let currentSessionCard =
    normalized.find((c) => c.isCurrentSession) ??
    (sessionCardRow
      ? normalized.find((c) => c.id === sessionCardRow.id) ?? null
      : null)

  if (!currentSessionCard && sessionCardRow) {
    const pipeline = sessionCardRow.pipelines
    const stage = pipeline?.pipeline_stages?.[0]
    currentSessionCard = {
      id: sessionCardRow.id,
      titulo: sessionCardRow.titulo?.trim() || 'Card',
      solicitacao: cardSolicitacao(sessionCardRow),
      pipeline_id: sessionCardRow.pipeline_id,
      pipeline_nome: pipeline?.nome ?? 'Funil',
      stage_nome: stage?.nome ?? '—',
      departamento_id: null,
      departamento_nome: null,
      finalizado: false,
      created_at: new Date().toISOString(),
      isCurrentSession: true,
      canOpen: canConsultCard(me, userDeptIds, {
        responsavel_id: sessionCardRow.responsavel_id,
        departamento_id: null,
      }),
    }
  }

  const withoutCurrent = normalized.filter((c) => c.id !== currentSessionCard?.id)
  const recentCards = withoutCurrent.filter((c) => c.canOpen).slice(0, 3)
  const otherDepartmentCards = withoutCurrent.filter((c) => !c.canOpen)

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const recent90 = normalized.filter(
    (c) => new Date(c.created_at).getTime() >= ninetyDaysAgo.getTime(),
  )

  const phone = lead.telefone || lead.whatsapp
  const activeSpeaker = await resolveActiveSpeaker(
    supabase,
    conversa.empresa_id,
    sessaoId,
    phone,
    userDeptIds,
  )

  const context: OmniCustomerContext = {
    lead,
    currentSessionCard,
    recentCards,
    otherDepartmentCards,
    activeSpeaker,
    stats: {
      totalCards90d: recent90.length,
      openCount: normalized.filter((c) => !c.finalizado).length,
    },
  }

  return { data: context }
}
