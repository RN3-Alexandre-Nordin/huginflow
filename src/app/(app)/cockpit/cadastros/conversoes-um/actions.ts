'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { conversaoPayloadFromForm } from '@/lib/skus/constants'

const LIST_PATH = '/cockpit/cadastros/conversoes-um'

async function resolveEmpresaId(me: Awaited<ReturnType<typeof getMyProfile>>) {
  return me?.empresa_id ?? ''
}

export async function createConversaoUm(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'create') && !hasPermission(me, 'skus', 'edit')) {
    return { error: 'Sem permissão para criar conversões.' }
  }

  const payload = conversaoPayloadFromForm(formData)
  if (!payload.unidade_origem || !payload.unidade_destino) {
    return { error: 'Informe unidade origem e destino.' }
  }
  if (payload.unidade_origem === payload.unidade_destino) {
    return { error: 'Origem e destino devem ser diferentes.' }
  }
  if (payload.fator_conversao == null || payload.fator_conversao <= 0) {
    return { error: 'Informe um fator de conversão maior que zero.' }
  }

  const empresaId = await resolveEmpresaId(me)
  if (!empresaId && me?.role_global !== 'superadmin') {
    return { error: 'Empresa não identificada.' }
  }
  const emp =
    me?.role_global === 'superadmin'
      ? ((formData.get('empresa_id') as string) || empresaId)
      : empresaId
  if (!emp) return { error: 'Empresa não identificada.' }

  if (payload.sku_id) {
    const supabaseCheck = await createClient()
    const { data: sku } = await supabaseCheck
      .from('cad_skus')
      .select('id')
      .eq('id', payload.sku_id)
      .eq('empresa_id', emp)
      .maybeSingle()
    if (!sku) return { error: 'SKU inválido para esta empresa.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('cad_sku_unidade_conversao').insert([
    {
      empresa_id: emp,
      sku_id: payload.sku_id,
      unidade_origem: payload.unidade_origem,
      unidade_destino: payload.unidade_destino,
      fator_conversao: payload.fator_conversao,
      updated_at: new Date().toISOString(),
    },
  ])

  if (error) {
    if (error.code === '23505') {
      return {
        error: payload.sku_id
          ? 'Já existe conversão específica para este SKU e par de unidades.'
          : 'Já existe conversão genérica para este par de unidades.',
      }
    }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function updateConversaoUm(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'edit')) {
    return { error: 'Sem permissão para editar conversões.' }
  }

  const payload = conversaoPayloadFromForm(formData)
  if (!payload.unidade_origem || !payload.unidade_destino) {
    return { error: 'Informe unidade origem e destino.' }
  }
  if (payload.unidade_origem === payload.unidade_destino) {
    return { error: 'Origem e destino devem ser diferentes.' }
  }
  if (payload.fator_conversao == null || payload.fator_conversao <= 0) {
    return { error: 'Informe um fator de conversão maior que zero.' }
  }

  const empresaId =
    me?.role_global === 'superadmin'
      ? ((formData.get('empresa_id') as string) || me?.empresa_id || '')
      : me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()
  let query = supabase
    .from('cad_sku_unidade_conversao')
    .update({
      sku_id: payload.sku_id,
      unidade_origem: payload.unidade_origem,
      unidade_destino: payload.unidade_destino,
      fator_conversao: payload.fator_conversao,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('empresa_id', empresaId)

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) {
    if (error.code === '23505') {
      return { error: 'Já existe conversão para este escopo e par de unidades.' }
    }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function deleteConversaoUm(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'delete') && !hasPermission(me, 'skus', 'edit')) {
    console.error('Sem permissão para excluir conversões.')
    return
  }

  const id = formData.get('id') as string
  const supabase = await createClient()
  let query = supabase.from('cad_sku_unidade_conversao').delete().eq('id', id)
  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  await query
  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}
