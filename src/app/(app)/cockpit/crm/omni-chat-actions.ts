'use server'

import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

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

  const { data: card } = await supabase
    .from('crm_cards')
    .select('id')
    .eq('conversa_id', sessaoId)
    .eq('responsavel_id', me.id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  return !!card
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

/** Carrega sessao_id a partir do card (fallback do deep link). */
export async function getSessaoIdByCardId(cardId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado', data: null as string | null }

  const supabase = await createClient()

  let query = supabase
    .from('crm_cards')
    .select('conversa_id, empresa_id, responsavel_id')
    .eq('id', cardId)

  if (me.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me.empresa_id)
  }

  const { data: card, error } = await query.maybeSingle()
  if (error) return { error: error.message, data: null }
  if (!card?.conversa_id) return { error: 'Card sem conversa vinculada', data: null }

  const { data: convRows } = await supabase
    .from('crm_conversas')
    .select('atribuido_a_id, status')
    .eq('sessao_id', card.conversa_id)
    .order('updated_at', { ascending: false })
    .limit(1)

  const conv = convRows?.[0] ?? null
  const allowed = await operadorPodeAcessarSessao(supabase, me, card.conversa_id, conv)
  if (!allowed) return { error: 'Sem permissão para esta conversa', data: null }

  return { data: card.conversa_id }
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
  if (!row) return { error: 'Conversa não encontrada', data: null }

  const allowed = await operadorPodeAcessarSessao(supabase, me, sessaoId, row)
  if (!allowed) return { error: 'Sem permissão para esta conversa', data: null }

  return {
    data: {
      ...row,
      id: row.sessao_id,
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

  if (convErr || !conversa) {
    return { error: 'Conversa não encontrada', data: [] }
  }

  if (me.role_global !== 'superadmin' && conversa.empresa_id !== me.empresa_id) {
    return { error: 'Sem permissão para esta conversa', data: [] }
  }

  const allowed = await operadorPodeAcessarSessao(supabase, me, sessaoId, conversa)
  if (!allowed) return { error: 'Sem permissão para esta conversa', data: [] }

  const { data, error } = await supabase
    .from('crm_interacoes')
    .select('*, usuarios(nome_completo)')
    .eq('conversa_id', sessaoId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
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
    if (!data) return { card: null, error: 'Card não encontrado' }
    const row = data as OmniRedirectCardRow
    if (row.conversa_id && row.conversa_id !== sessaoId) {
      return { card: null, error: 'Card não pertence a esta conversa' }
    }
    return { card: row }
  }

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
  return { card: (data as OmniRedirectCardRow | null) ?? null }
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
    return { error: 'Nenhum card aberto vinculado a esta conversa. Finalize a venda ou vincule um card no funil.' }
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
