import type { SupabaseClient } from '@supabase/supabase-js'

export type CardChangeNotifyInput = {
  supabase: SupabaseClient
  empresaId: string
  cardId: string
  cardTitulo: string
  /** Quem fez a alteração (usuário humano). Null = IA/sistema. */
  actorId: string | null
  actorNome: string
  /** Quem deve ser avisado (responsável atual ou anterior). */
  notifyUserId: string | null | undefined
  /** Resumo curto: "alterou a observação", "moveu para NEGOCIAÇÃO", etc. */
  changeSummary: string
}

/**
 * Avisa o responsável no chat interno do card via menção `[Nome Completo]`.
 * Reaproveita inbox + som já existentes. Não notifica se o ator é o próprio responsável.
 */
export async function notifyCardResponsavelOnChange(
  input: CardChangeNotifyInput,
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const {
    supabase,
    empresaId,
    cardId,
    cardTitulo,
    actorId,
    actorNome,
    notifyUserId,
    changeSummary,
  } = input

  if (!notifyUserId) {
    return { ok: false, skipped: 'sem_responsavel' }
  }
  if (actorId && actorId === notifyUserId) {
    return { ok: false, skipped: 'mesmo_ator' }
  }

  const { data: target, error: targetErr } = await supabase
    .from('usuarios')
    .select('id, nome_completo')
    .eq('id', notifyUserId)
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (targetErr || !target?.nome_completo) {
    return { ok: false, error: targetErr?.message ?? 'responsavel_nao_encontrado' }
  }

  const senderId = await resolveChatSenderId(supabase, empresaId, actorId, notifyUserId)
  if (!senderId) {
    return { ok: false, error: 'sem_remetente_chat' }
  }

  const title = (cardTitulo || 'Card').trim().slice(0, 120)
  const summary = changeSummary.trim().slice(0, 280)
  const content = `[${target.nome_completo}] ${actorNome} alterou o card "${title}": ${summary}`

  const { error } = await supabase.from('chat_messages').insert({
    empresa_id: empresaId,
    sender_id: senderId,
    content,
    context_type: 'card',
    context_id: cardId,
    related_card_id: cardId,
  })

  if (error) {
    console.error('[notifyCardResponsavel]', error.message)
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

/**
 * Notifica o responsável atual e, se houve troca de responsável, também o anterior / o novo.
 */
export async function notifyCardAssignmentAndChanges(opts: {
  supabase: SupabaseClient
  empresaId: string
  cardId: string
  cardTitulo: string
  actorId: string | null
  actorNome: string
  previousResponsavelId: string | null | undefined
  nextResponsavelId: string | null | undefined
  /** Mudanças além da atribuição (observação, estágio, etc.). */
  otherChanges: string[]
}): Promise<void> {
  const {
    supabase,
    empresaId,
    cardId,
    cardTitulo,
    actorId,
    actorNome,
    previousResponsavelId,
    nextResponsavelId,
    otherChanges,
  } = opts

  const prev = previousResponsavelId || null
  const next = nextResponsavelId || null
  const assigneeChanged = prev !== next

  if (assigneeChanged && next) {
    let newNome = 'outro operador'
    const { data: u } = await supabase
      .from('usuarios')
      .select('nome_completo')
      .eq('id', next)
      .maybeSingle()
    if (u?.nome_completo) newNome = u.nome_completo

    await notifyCardResponsavelOnChange({
      supabase,
      empresaId,
      cardId,
      cardTitulo,
      actorId,
      actorNome,
      notifyUserId: next,
      changeSummary:
        otherChanges.length > 0
          ? `você passou a ser o responsável. Também: ${otherChanges.join('; ')}`
          : 'você passou a ser o responsável deste card',
    })

    if (prev) {
      await notifyCardResponsavelOnChange({
        supabase,
        empresaId,
        cardId,
        cardTitulo,
        actorId,
        actorNome,
        notifyUserId: prev,
        changeSummary: `card transferido para ${newNome}`,
      })
    }
    return
  }

  if (next && otherChanges.length > 0) {
    await notifyCardResponsavelOnChange({
      supabase,
      empresaId,
      cardId,
      cardTitulo,
      actorId,
      actorNome,
      notifyUserId: next,
      changeSummary: otherChanges.join('; '),
    })
  }
}

async function resolveChatSenderId(
  supabase: SupabaseClient,
  empresaId: string,
  actorId: string | null,
  excludeUserId: string,
): Promise<string | null> {
  if (actorId && actorId !== excludeUserId) return actorId

  const { data } = await supabase
    .from('usuarios')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .neq('id', excludeUserId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

export function diffCrmCardChanges(
  before: {
    titulo?: string | null
    descricao?: string | null
    valor?: number | null
    cliente_nome?: string | null
    observacao?: string | null
    responsavel_id?: string | null
    data_prazo?: string | null
    stage_id?: string | null
    pipeline_id?: string | null
    finalizado?: boolean | null
  },
  after: {
    titulo?: string | null
    descricao?: string | null
    valor?: number | null
    cliente_nome?: string | null
    observacao?: string | null
    responsavel_id?: string | null
    data_prazo?: string | null
    stage_id?: string | null
    pipeline_id?: string | null
    finalizado?: boolean | null
  },
): string[] {
  const changes: string[] = []
  if (before.titulo !== after.titulo) changes.push('atualizou o título')
  if (before.descricao !== after.descricao) changes.push('atualizou a descrição')
  if (Number(before.valor ?? 0) !== Number(after.valor ?? 0)) changes.push('alterou o valor')
  if (before.cliente_nome !== after.cliente_nome) changes.push('atualizou o cliente')
  if ((before.observacao ?? '') !== (after.observacao ?? '')) {
    changes.push('atualizou a observação')
  }
  if ((before.data_prazo ?? null) !== (after.data_prazo ?? null)) {
    changes.push('alterou o prazo')
  }
  if (Boolean(before.finalizado) !== Boolean(after.finalizado)) {
    changes.push(after.finalizado ? 'marcou como finalizado' : 'reativou o card')
  }
  if (before.stage_id && after.stage_id && before.stage_id !== after.stage_id) {
    changes.push('moveu de estágio')
  }
  if (before.pipeline_id && after.pipeline_id && before.pipeline_id !== after.pipeline_id) {
    changes.push('transferiu de funil')
  }
  return changes
}
