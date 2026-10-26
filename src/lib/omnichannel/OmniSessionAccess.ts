import type { SupabaseClient } from '@supabase/supabase-js'
import { canConsultCard } from '@/lib/crm/cardConsultaAccess'
import { getUserDepartamentoIds } from '@/lib/crm/userDepartamentos'
import { isDeptSessionsEnabled } from '@/lib/omnichannel/dept-sessions-constants'

type OmniAccessProfile = {
  id: string
  empresa_id?: string | null
  grupo_id?: string | null
  role_global?: string | null
}

export type OmniSessionRef = {
  sessaoId: string
  conversa?: { atribuido_a_id?: string | null } | null
}

type ThreadAccessRow = {
  id: string
  card_id: string | null
  departamento_id: string | null
  pipeline_id: string | null
}

type CardAccessRow = {
  id: string
  conversa_id: string | null
  responsavel_id: string | null
  pipeline_id: string | null
  pipelines?: { departamento_id?: string | null } | { departamento_id?: string | null }[] | null
}

const CARD_ACCESS_SELECT = 'id, conversa_id, responsavel_id, pipeline_id, pipelines(departamento_id)'

/** PostgREST envia `in.(...)` na URL — lotes evitam estourar o limite de tamanho. */
const IN_FILTER_CHUNK = 100

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

async function selectInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  if (ids.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK) {
    chunks.push(ids.slice(i, i + IN_FILTER_CHUNK))
  }
  const results = await Promise.all(chunks.map((chunk) => run(chunk)))
  return results.flatMap((result) => result.data ?? [])
}

/**
 * Fonte única da autorização de sessão Omnichannel, em lote.
 * Admins acessam somente seu tenant; operadores também precisam pertencer ao
 * departamento/funil da thread, ser responsáveis pelo card ou estar atribuídos.
 *
 * Custo fixo (~5 queries) independentemente do número de sessões — listas não podem
 * chamar a checagem sessão a sessão.
 */
export async function filterAccessibleOmniSessions(
  supabase: SupabaseClient,
  me: OmniAccessProfile,
  sessions: OmniSessionRef[],
): Promise<Set<string>> {
  const allowed = new Set<string>()
  const empresaId = me.empresa_id
  if (!empresaId || sessions.length === 0) return allowed

  if (me.role_global !== 'operador') {
    for (const session of sessions) allowed.add(session.sessaoId)
    return allowed
  }

  const pendingIds = new Set<string>()
  for (const session of sessions) {
    if (session.conversa?.atribuido_a_id === me.id) allowed.add(session.sessaoId)
    else pendingIds.add(session.sessaoId)
  }
  for (const id of allowed) pendingIds.delete(id)
  const sessaoIds = [...pendingIds]
  if (sessaoIds.length === 0) return allowed

  const [userDeptIds, threads, grupoPipelines, cardsByConversation] = await Promise.all([
    getUserDepartamentoIds(supabase, me.id, me.grupo_id),
    selectInChunks<ThreadAccessRow>(sessaoIds, (chunk) =>
      supabase
        .from('crm_chat_threads')
        .select('id, card_id, departamento_id, pipeline_id')
        .eq('empresa_id', empresaId)
        .in('id', chunk),
    ),
    me.grupo_id
      ? supabase
          .from('pipeline_grupo_acesso')
          .select('pipeline_id')
          .eq('grupo_id', me.grupo_id)
          .then((result) => (result.data ?? []) as { pipeline_id: string }[])
      : Promise.resolve([] as { pipeline_id: string }[]),
    selectInChunks<CardAccessRow>(sessaoIds, (chunk) =>
      supabase
        .from('crm_cards')
        .select(CARD_ACCESS_SELECT)
        .eq('empresa_id', empresaId)
        .in('conversa_id', chunk),
    ),
  ])

  const deptSet = new Set(userDeptIds)
  const allowedPipelines = new Set(grupoPipelines.map((row) => row.pipeline_id))
  const threadById = new Map(threads.map((thread) => [thread.id, thread]))
  const cardById = new Map(cardsByConversation.map((card) => [card.id, card]))

  const missingCardIds = [
    ...new Set(
      threads
        .map((thread) => thread.card_id)
        .filter((id): id is string => Boolean(id) && !cardById.has(id as string)),
    ),
  ]
  const threadCards = await selectInChunks<CardAccessRow>(missingCardIds, (chunk) =>
    supabase
      .from('crm_cards')
      .select(CARD_ACCESS_SELECT)
      .eq('empresa_id', empresaId)
      .in('id', chunk),
  )
  for (const card of threadCards) cardById.set(card.id, card)

  const cardsBySessao = new Map<string, CardAccessRow[]>()
  for (const card of cardsByConversation) {
    if (!card.conversa_id) continue
    const list = cardsBySessao.get(card.conversa_id) ?? []
    list.push(card)
    cardsBySessao.set(card.conversa_id, list)
  }

  const deptSessions = isDeptSessionsEnabled()

  for (const sessaoId of sessaoIds) {
    const thread = threadById.get(sessaoId)

    if (deptSessions && thread) {
      if (thread.departamento_id) {
        if (deptSet.has(thread.departamento_id)) allowed.add(sessaoId)
        continue
      }
      if (thread.pipeline_id) {
        if (me.grupo_id && allowedPipelines.has(thread.pipeline_id)) allowed.add(sessaoId)
        continue
      }
    } else {
      if (thread?.departamento_id && deptSet.has(thread.departamento_id)) {
        allowed.add(sessaoId)
        continue
      }
      if (thread?.pipeline_id && me.grupo_id && allowedPipelines.has(thread.pipeline_id)) {
        allowed.add(sessaoId)
        continue
      }
    }

    const cards = [...(cardsBySessao.get(sessaoId) ?? [])]
    if (thread?.card_id && !cards.some((card) => card.id === thread.card_id)) {
      const threadCard = cardById.get(thread.card_id)
      if (threadCard) cards.push(threadCard)
    }

    const canSee = cards.some((card) => {
      const departamentoId = firstRelation(card.pipelines)?.departamento_id ?? null
      return (
        canConsultCard(me, userDeptIds, {
          responsavel_id: card.responsavel_id,
          departamento_id: departamentoId,
        }) || Boolean(card.pipeline_id && allowedPipelines.has(card.pipeline_id))
      )
    })
    if (canSee) allowed.add(sessaoId)
  }

  return allowed
}

export async function canAccessOmniSession(
  supabase: SupabaseClient,
  me: OmniAccessProfile,
  sessaoId: string,
  conversa?: { atribuido_a_id?: string | null } | null,
): Promise<boolean> {
  const allowed = await filterAccessibleOmniSessions(supabase, me, [{ sessaoId, conversa }])
  return allowed.has(sessaoId)
}
