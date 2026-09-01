import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeWhatsAppPhone } from '@/lib/omnichannel/phone'

/** Busca lead pelo telefone ou cria um novo na empresa. */
export async function resolveOrCreateLead(
  supabase: SupabaseClient,
  empresaId: string,
  phoneRaw: string,
  name: string,
): Promise<{ leadId: string } | { error: string }> {
  const cleanPhone = normalizeWhatsAppPhone(phoneRaw)
  if (cleanPhone.length < 10) {
    return { error: 'Telefone inválido (mínimo 10 dígitos).' }
  }

  const { data: existing } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('telefone', cleanPhone)
    .maybeSingle()

  if (existing?.id) {
    return { leadId: existing.id }
  }

  const { data: byWhatsapp } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('whatsapp', cleanPhone)
    .maybeSingle()

  if (byWhatsapp?.id) {
    return { leadId: byWhatsapp.id }
  }

  const leadName = name.trim() || 'Cliente'
  const { data: newLead, error } = await supabase
    .from('crm_leads')
    .insert({
      nome: leadName,
      telefone: cleanPhone,
      whatsapp: cleanPhone,
      empresa_id: empresaId,
    })
    .select('id')
    .single()

  if (error || !newLead?.id) {
    return { error: error?.message ?? 'Falha ao criar lead.' }
  }

  return { leadId: newLead.id }
}

/** Vincula lead ao card se ainda não tiver. */
export async function linkLeadToCard(
  supabase: SupabaseClient,
  cardId: string,
  empresaId: string,
  leadId: string,
): Promise<void> {
  await supabase
    .from('crm_cards')
    .update({ lead_id: leadId })
    .eq('id', cardId)
    .eq('empresa_id', empresaId)
}
