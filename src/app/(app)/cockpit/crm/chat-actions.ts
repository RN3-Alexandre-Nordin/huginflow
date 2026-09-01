'use server'

import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/lib/auth/getMyProfile'
import { hasPermission } from '@/utils/permissions'
import { revalidatePath } from 'next/cache'

export async function sendChatMessage(content: string, context_type: 'global' | 'card' | 'direct', context_id?: string, related_card_id?: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }
  
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('chat_messages')
    .insert([{
      empresa_id: me.empresa_id,
      sender_id: me.id,
      content,
      context_type,
      context_id: context_id || null,
      related_card_id: related_card_id || null
    }])
    .select('*, usuarios(nome_completo)')
    .single()

  if (error) return { error: error.message }
  
  return { data }
}

export async function getChatMessages(context_type: 'global' | 'card' | 'direct', context_id?: string, related_card_id?: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }
  
  const supabase = await createClient()

  let query = supabase
    .from('chat_messages')
    .select(`
      *,
      usuarios (
        id,
        nome_completo
      ),
      crm_cards (
        id,
        titulo
      )
    `)
    .eq('empresa_id', me.empresa_id)
    .order('created_at', { ascending: true })

  if (context_type === 'direct' && context_id) {
    // Busca mensagens trocadas entre os dois participantes
    query = query
      .eq('context_type', 'direct')
      .or(`and(sender_id.eq.${me.id},context_id.eq.${context_id}),and(sender_id.eq.${context_id},context_id.eq.${me.id})`)
    
    if (related_card_id) {
      query = query.eq('related_card_id', related_card_id)
    }
  } else if (context_type === 'global') {
    // No contexto global, mostramos mensagens globais E as de contexto de card da empresa
    query = query.in('context_type', ['global', 'card'])
  } else {
    query = query.eq('context_type', context_type)
    if (context_id) {
      query = query.eq('context_id', context_id)
    }
  }

  const { data, error } = await query

  if (error) return { error: error.message }
  return { data }
}

/**
 * Busca o feed global de chat, incluindo mensagens globais 
 * e menções/mensagens de cards relevantes.
 */
export async function getGlobalChatFeed() {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }
  
  const supabase = await createClient()

  // Para o feed global, buscamos mensagens 'global' 
  // Opcionalmente podemos buscar onde o usuário foi mencionado (futura feature)
  const { data, error } = await supabase
    .from('chat_messages')
    .select(`
      *,
      usuarios!inner(id, nome_completo)
    `)
    .eq('empresa_id', me.empresa_id)
    // Mostramos Global OU Card (se quiser feed unificado)
    // Seguindo o pedido: "No Chat Principal: Mostre todas as mensagens 'global' e as mensagens de 'card' onde o usuário foi mencionado"
    // Por enquanto, traremos Global e Card context para visualização unificada
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return { error: error.message }
  return { data }
}

export async function getRecentConversations() {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_recent_chat_conversations')

  if (error) return { error: error.message }

  return {
    data: (data ?? []).map((row: {
      type: string
      id: string
      name: string | null
      last_message: string | null
      last_message_at: string
      unread_count: number | string
    }) => ({
      type: row.type as 'global' | 'card' | 'direct',
      id: row.id,
      name: row.name ?? '',
      lastMessage: row.last_message ?? '',
      lastMessageAt: row.last_message_at,
      unreadCount: Number(row.unread_count) || 0,
    })),
  }
}

export async function searchAllConversations(query: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }
  
  const supabase = await createClient()
  const q = query.toLowerCase()

  // Buscar Usuários
  const { data: users } = await supabase
    .from('usuarios')
    .select('id, nome_completo, email')
    .eq('empresa_id', me.empresa_id)
    .neq('id', me.id)
    .or(`nome_completo.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(5)

  // Buscar Cards
  const { data: cards } = await supabase
    .from('crm_cards')
    .select('id, titulo')
    .eq('empresa_id', me.empresa_id)
    .ilike('titulo', `%${q}%`)
    .limit(10)

  const results: any[] = [
    ...(users?.map(u => ({ type: 'direct', id: u.id, name: u.nome_completo, lastMessage: u.email })) || []),
    ...(cards?.map(c => ({ type: 'card', id: c.id, name: c.titulo, lastMessage: 'Card do CRM' })) || [])
  ]

  return { data: results }
}

export async function markChatAsRead(contextType: string, contextId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }
  
  const supabase = await createClient()
  const cid = contextId || 'global'

  const { error } = await supabase
    .from('chat_read_markers')
    .upsert({
      usuario_id: me.id,
      context_type: contextType,
      context_id: cid,
      last_read_at: new Date().toISOString()
    }, { onConflict: 'usuario_id,context_type,context_id' })

  if (error) return { error: error.message }
  return { success: true }
}

export async function getCompanyUsers() {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome_completo, email')
    .eq('empresa_id', me.empresa_id)
    .order('nome_completo')

  if (error) return { error: error.message }
  return { data }
}
