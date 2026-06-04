'use server'

import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'

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
    sessoes = sessoes.filter(
      (c) =>
        (c as { atribuido_a_id?: string | null }).atribuido_a_id === me.id ||
        !(c as { atribuido_a_id?: string | null }).atribuido_a_id,
    )
  }

  const data = sessoes.slice(0, 50).map((row) => ({
    ...row,
    id: row.sessao_id,
  }))

  return { data }
}

export async function getOmniMensagens(sessaoId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado', data: [] }

  const supabase = await createClient()

  const { data: conversa, error: convErr } = await supabase
    .from('crm_conversas')
    .select('sessao_id, empresa_id')
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

  const { data, error } = await supabase
    .from('crm_interacoes')
    .select('*, usuarios(nome_completo)')
    .eq('conversa_id', sessaoId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}
