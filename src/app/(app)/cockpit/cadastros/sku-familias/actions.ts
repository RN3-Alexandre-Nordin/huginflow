'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'

const LIST_PATH = '/cockpit/cadastros/sku-familias'

async function resolveEmpresaId(
  me: Awaited<ReturnType<typeof getMyProfile>>,
  formData?: FormData,
) {
  if (me?.role_global === 'superadmin') {
    return (formData?.get('empresa_id') as string) || me?.empresa_id || ''
  }
  return me?.empresa_id ?? ''
}

function payloadFromForm(formData: FormData) {
  const ordemRaw = Number(formData.get('ordem'))
  return {
    codigo: String(formData.get('codigo') ?? '')
      .trim()
      .toUpperCase()
      .slice(0, 32),
    nome: String(formData.get('nome') ?? '').trim(),
    descricao: String(formData.get('descricao') ?? '').trim() || null,
    ordem: Number.isFinite(ordemRaw) ? Math.trunc(ordemRaw) : 0,
    ativo: formData.get('ativo') === 'on' || formData.get('ativo') === 'true',
  }
}

export async function createSkuFamilia(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'create') && !hasPermission(me, 'skus', 'edit')) {
    return { error: 'Sem permissão para criar famílias.' }
  }
  const payload = payloadFromForm(formData)
  if (!payload.codigo) return { error: 'Informe o código.' }
  if (!payload.nome) return { error: 'Informe o nome.' }

  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()
  const { error } = await supabase.from('cad_sku_familias').insert([
    { ...payload, empresa_id: empresaId, updated_at: new Date().toISOString() },
  ])
  if (error) {
    if (error.code === '23505') return { error: 'Já existe família com este código.' }
    return { error: error.message }
  }
  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function updateSkuFamilia(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'edit')) {
    return { error: 'Sem permissão para editar famílias.' }
  }
  const payload = payloadFromForm(formData)
  if (!payload.codigo) return { error: 'Informe o código.' }
  if (!payload.nome) return { error: 'Informe o nome.' }

  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cad_sku_familias')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', empresaId)

  if (error) {
    if (error.code === '23505') return { error: 'Já existe família com este código.' }
    return { error: error.message }
  }
  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function deleteSkuFamilia(id: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'delete') && !hasPermission(me, 'skus', 'edit')) {
    return { error: 'Sem permissão para excluir famílias.' }
  }
  const empresaId = me?.empresa_id ?? ''
  if (!empresaId && me?.role_global !== 'superadmin') {
    return { error: 'Empresa não identificada.' }
  }

  const supabase = await createClient()
  let q = supabase.from('cad_sku_familias').delete().eq('id', id)
  if (me?.role_global !== 'superadmin') {
    q = q.eq('empresa_id', empresaId)
  }
  const { error } = await q
  if (error) return { error: error.message }

  revalidatePath(LIST_PATH)
  return { sucesso: true }
}
