'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { skuPayloadFromForm } from '@/lib/skus/constants'

const LIST_PATH = '/cockpit/cadastros/skus'

async function resolveEmpresaId(
  me: Awaited<ReturnType<typeof getMyProfile>>,
  formData?: FormData,
) {
  if (me?.role_global === 'superadmin') {
    return (formData?.get('empresa_id') as string) || me?.empresa_id || ''
  }
  return me?.empresa_id ?? ''
}

export async function createSku(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'create')) {
    return { error: 'Sem permissão para criar SKUs.' }
  }

  const payload = skuPayloadFromForm(formData)
  if (!payload.codigo) return { error: 'Informe o código (SKU).' }
  if (!payload.nome) return { error: 'Informe o nome.' }

  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cad_skus')
    .insert([{ ...payload, empresa_id: empresaId, updated_at: new Date().toISOString() }])

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um SKU com este código nesta empresa.' }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function updateSku(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'edit')) {
    return { error: 'Sem permissão para editar SKUs.' }
  }

  const payload = skuPayloadFromForm(formData)
  if (!payload.codigo) return { error: 'Informe o código (SKU).' }
  if (!payload.nome) return { error: 'Informe o nome.' }

  const supabase = await createClient()
  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  let query = supabase
    .from('cad_skus')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', empresaId)

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um SKU com este código nesta empresa.' }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function deleteSku(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'delete')) {
    console.error('Ação negada: Sem permissão para excluir SKUs.')
    return
  }

  const id = formData.get('id') as string
  const supabase = await createClient()
  let query = supabase.from('cad_skus').delete().eq('id', id)
  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) {
    console.error('Erro ao excluir SKU:', error.message)
    return
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}
