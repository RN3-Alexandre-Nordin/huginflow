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

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

/**
 * Fonte única da autorização de sessão Omnichannel.
 * Admins acessam somente seu tenant; operadores também precisam pertencer ao
 * departamento/funil da thread, ser responsáveis pelo card ou estar atribuídos.
 */
export async function canAccessOmniSession(
  supabase: SupabaseClient,
  me: OmniAccessProfile,
  sessaoId: string,
  conversa?: { atribuido_a_id?: string | null } | null,
): Promise<boolean> {
  if (!me.empresa_id) return false
  if (me.role_global !== 'operador') return true
  if (conversa?.atribuido_a_id === me.id) return true

  const userDeptIds = await getUserDepartamentoIds(supabase, me.id, me.grupo_id)
  const { data: thread } = await supabase
    .from('crm_chat_threads')
    .select('card_id, departamento_id, pipeline_id, empresa_id')
    .eq('id', sessaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  if (thread && thread.empresa_id !== me.empresa_id) return false

  if (isDeptSessionsEnabled() && thread) {
    if (thread.departamento_id) return userDeptIds.includes(thread.departamento_id)
    if (thread.pipeline_id) {
      if (!me.grupo_id) return false
      const { data: access } = await supabase
        .from('pipeline_grupo_acesso')
        .select('pipeline_id')
        .eq('grupo_id', me.grupo_id)
        .eq('pipeline_id', thread.pipeline_id)
        .maybeSingle()
      return Boolean(access)
    }
  } else {
    if (thread?.departamento_id && userDeptIds.includes(thread.departamento_id)) return true
    if (thread?.pipeline_id && me.grupo_id) {
      const { data: access } = await supabase
        .from('pipeline_grupo_acesso')
        .select('pipeline_id')
        .eq('grupo_id', me.grupo_id)
        .eq('pipeline_id', thread.pipeline_id)
        .maybeSingle()
      if (access) return true
    }
  }

  const cardIds = new Set<string>()
  const { data: cardsByConversation } = await supabase
    .from('crm_cards')
    .select('id, responsavel_id, pipeline_id, pipelines(departamento_id), empresa_id')
    .eq('conversa_id', sessaoId)
    .eq('empresa_id', me.empresa_id)

  for (const card of cardsByConversation ?? []) {
    if (card.empresa_id === me.empresa_id) cardIds.add(card.id)
  }
  if (thread?.card_id) cardIds.add(thread.card_id)
  if (cardIds.size === 0) return false

  let cards = (cardsByConversation ?? []).filter((card) => card.empresa_id === me.empresa_id)
  const missingIds = [...cardIds].filter((id) => !cards.some((card) => card.id === id))
  if (missingIds.length > 0) {
    const { data: extra } = await supabase
      .from('crm_cards')
      .select('id, responsavel_id, pipeline_id, pipelines(departamento_id), empresa_id')
      .in('id', missingIds)
      .eq('empresa_id', me.empresa_id)
    cards = [...cards, ...((extra ?? []).filter((card) => card.empresa_id === me.empresa_id))]
  }

  const pipelineIds = [...new Set(cards.map((card) => card.pipeline_id).filter(Boolean))]
  let allowedPipelines = new Set<string>()
  if (me.grupo_id && pipelineIds.length > 0) {
    const { data } = await supabase
      .from('pipeline_grupo_acesso')
      .select('pipeline_id')
      .eq('grupo_id', me.grupo_id)
      .in('pipeline_id', pipelineIds)
    allowedPipelines = new Set((data ?? []).map((row) => row.pipeline_id))
  }

  return cards.some((card) => {
    const departamentoId =
      firstRelation(
        (
          card as {
            pipelines?:
              | { departamento_id?: string | null }
              | { departamento_id?: string | null }[]
              | null
          }
        ).pipelines,
      )?.departamento_id ?? null

    return (
      canConsultCard(me, userDeptIds, {
        responsavel_id: card.responsavel_id,
        departamento_id: departamentoId,
      }) ||
      Boolean(card.pipeline_id && allowedPipelines.has(card.pipeline_id))
    )
  })
}
