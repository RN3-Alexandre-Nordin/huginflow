'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { linkLeadToCard } from '@/lib/crm/resolveLead'
import { buildKanbanCardUrl } from '@/lib/kanban/kanban-deep-link'
import { pessoaPayloadFromForm } from '@/lib/pessoas/constants'

export type QuickLeadOption = {
  id: string
  nome: string | null
  telefone: string | null
  whatsapp: string | null
}

/** Cria lead sem redirect — para o modal Novo Card selecionar e vincular. */
export async function createQuickLead(input: {
  nome: string
  telefone?: string
  whatsapp?: string
  email?: string
}): Promise<{ success: true; lead: QuickLeadOption } | { success: false; error: string }> {
  const me = await getMyProfile()
  if (!hasPermission(me, 'leads', 'create')) {
    return { success: false, error: 'Sem permissão para criar leads.' }
  }
  if (!me?.empresa_id && me?.role_global !== 'superadmin') {
    return { success: false, error: 'Empresa não identificada.' }
  }

  const nome = input.nome.trim()
  if (!nome) return { success: false, error: 'Informe o nome do lead.' }

  const telefone = input.telefone?.trim() || null
  const whatsapp = input.whatsapp?.trim() || null
  const email = input.email?.trim() || null

  if (!telefone && !whatsapp) {
    return { success: false, error: 'Informe WhatsApp ou telefone.' }
  }

  const supabase = await createClient()
  const empresaId = me.empresa_id
  if (!empresaId) return { success: false, error: 'Empresa não identificada.' }

  const { data: newLead, error } = await supabase
    .from('crm_leads')
    .insert([{
      nome,
      telefone,
      whatsapp,
      email,
      empresa_id: empresaId,
      papeis: ['lead'],
      natureza: 'pf',
    }])
    .select('id, nome, telefone, whatsapp')
    .single()

  if (error || !newLead) {
    return { success: false, error: error?.message || 'Falha ao criar lead.' }
  }

  revalidatePath('/cockpit/crm/leads')
  return {
    success: true,
    lead: {
      id: newLead.id,
      nome: newLead.nome,
      telefone: newLead.telefone,
      whatsapp: newLead.whatsapp,
    },
  }
}

export async function createLead(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'leads', 'create')) {
    return { error: 'Sem permissão para criar pessoas.' }
  }

  const payload = pessoaPayloadFromForm(formData)
  if (!payload.nome) return { error: 'Informe o nome.' }

  const linkCardId = (formData.get('link_card_id') as string) || null
  const supabase = await createClient()
  const empresaId =
    me?.role_global === 'superadmin'
      ? ((formData.get('empresa_id') as string) || me?.empresa_id || '')
      : me?.empresa_id ?? ''

  if (!empresaId) return { error: 'Empresa não identificada.' }

  if (linkCardId && !payload.telefone && !payload.whatsapp) {
    return { error: 'Informe WhatsApp ou telefone para contato via WhatsApp.' }
  }

  const { data: newLead, error } = await supabase
    .from('crm_leads')
    .insert([{ ...payload, empresa_id: empresaId, updated_at: new Date().toISOString() }])
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (linkCardId && newLead?.id) {
    await linkLeadToCard(supabase, linkCardId, empresaId, newLead.id)
    const { data: card } = await supabase
      .from('crm_cards')
      .select('pipeline_id')
      .eq('id', linkCardId)
      .eq('empresa_id', empresaId)
      .maybeSingle()

    revalidatePath('/cockpit/crm/leads')
    if (card?.pipeline_id) {
      redirect(buildKanbanCardUrl(card.pipeline_id, linkCardId))
    }
    redirect('/cockpit/crm/funis')
  }

  revalidatePath('/cockpit/crm/leads')
  redirect('/cockpit/crm/leads')
}

export async function updateLead(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'leads', 'edit')) {
    return { error: 'Sem permissão para editar pessoas.' }
  }

  const payload = pessoaPayloadFromForm(formData)
  if (!payload.nome) return { error: 'Informe o nome.' }

  const supabase = await createClient()

  let query = supabase
    .from('crm_leads')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) return { error: error.message }

  revalidatePath('/cockpit/crm/leads')
  redirect('/cockpit/crm/leads')
}

export async function deleteLead(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'leads', 'delete')) {
    console.error('Ação negada: Sem permissão para excluir pessoas.')
    return
  }

  const id = formData.get('id') as string
  const supabase = await createClient()

  let query = supabase.from('crm_leads').delete().eq('id', id)
  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) {
    console.error('Erro ao excluir pessoa:', error.message)
    return
  }

  revalidatePath('/cockpit/crm/leads')
  redirect('/cockpit/crm/leads')
}
