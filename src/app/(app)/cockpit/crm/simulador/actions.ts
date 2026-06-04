'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { GeminiChatService } from '@/lib/crm/GeminiChatService'

export async function processChat(phone: string, name: string, message: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'simulador', 'view')) {
    return { error: 'Sem permissão para utilizar o simulador.' }
  }

  const supabase = await createClient()
  const targetEmpresaId = me?.empresa_id

  if (!targetEmpresaId) return { error: 'Empresa não identificada para carregar configurações de IA.' }

  const cleanPhone = phone.replace(/\D/g, '')

  let leadId: string

  const { data: existingLead } = await supabase
    .from('crm_leads')
    .select('id, nome')
    .eq('telefone', cleanPhone)
    .eq('empresa_id', targetEmpresaId)
    .maybeSingle()

  if (existingLead) {
    leadId = existingLead.id
  } else {
    const { data: newLead, error: leadError } = await supabase
      .from('crm_leads')
      .insert([
        {
          nome: name,
          telefone: cleanPhone,
          empresa_id: targetEmpresaId,
          canal_id: null,
        },
      ])
      .select('id')
      .single()

    if (leadError) return { error: 'Falha ao criar lead: ' + leadError.message }
    leadId = newLead.id
  }

  await supabase.from('crm_interacoes').insert([
    {
      empresa_id: targetEmpresaId,
      lead_id: leadId,
      contact_phone: cleanPhone,
      contact_name: name,
      role: 'user',
      content: message,
    },
  ])

  const aiResult = await GeminiChatService.generateReply(supabase, {
    empresaId: targetEmpresaId,
    leadId,
    contactPhone: cleanPhone,
    contactName: name,
    message,
  })

  if (!aiResult.success) {
    return { error: aiResult.error }
  }

  await supabase.from('crm_interacoes').insert([
    {
      empresa_id: targetEmpresaId,
      lead_id: leadId,
      contact_phone: cleanPhone,
      contact_name: name,
      role: 'assistant',
      content: aiResult.response,
    },
  ])

  revalidatePath('/cockpit/crm/simulador')
  return { success: true, response: aiResult.response }
}

/**
 * Recupera as interações existentes para a página
 */
export async function getChatHistory(phone: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'simulador', 'view')) {
    return []
  }

  const supabase = await createClient()
  const cleanPhone = phone.replace(/\D/g, '')
  const { data } = await supabase
    .from('crm_interacoes')
    .select('*')
    .eq('contact_phone', cleanPhone)
    .eq('empresa_id', me?.empresa_id ?? '')
    .order('created_at', { ascending: true })

  return data || []
}
