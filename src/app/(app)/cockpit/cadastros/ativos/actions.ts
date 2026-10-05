'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { ativoPayloadFromForm } from '@/lib/ativos/constants'

const LIST_PATH = '/cockpit/cadastros/ativos'

async function resolveEmpresaId(
  me: Awaited<ReturnType<typeof getMyProfile>>,
  formData?: FormData,
) {
  if (me?.role_global === 'superadmin') {
    return (formData?.get('empresa_id') as string) || me?.empresa_id || ''
  }
  return me?.empresa_id ?? ''
}

async function assertDepartamentoDoTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: string,
  departamentoId: string | null,
) {
  if (!departamentoId) return null
  const { data } = await supabase
    .from('departamentos')
    .select('id')
    .eq('id', departamentoId)
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (!data) return 'Centro de custo inválido para esta empresa.'
  return null
}

export async function createAtivo(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'ativos', 'create')) {
    return { error: 'Sem permissão para criar ativos.' }
  }

  const payload = ativoPayloadFromForm(formData)
  if (!payload.codigo) return { error: 'Informe o código do bem.' }
  if (!payload.nome) return { error: 'Informe o nome.' }

  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()
  const deptErr = await assertDepartamentoDoTenant(
    supabase,
    empresaId,
    payload.departamento_id,
  )
  if (deptErr) return { error: deptErr }

  const { error } = await supabase.from('cad_ativos').insert([
    { ...payload, empresa_id: empresaId, updated_at: new Date().toISOString() },
  ])

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um ativo com este código nesta empresa.' }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function updateAtivo(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'ativos', 'edit')) {
    return { error: 'Sem permissão para editar ativos.' }
  }

  const payload = ativoPayloadFromForm(formData)
  if (!payload.codigo) return { error: 'Informe o código do bem.' }
  if (!payload.nome) return { error: 'Informe o nome.' }

  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()
  const deptErr = await assertDepartamentoDoTenant(
    supabase,
    empresaId,
    payload.departamento_id,
  )
  if (deptErr) return { error: deptErr }

  let query = supabase
    .from('cad_ativos')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', empresaId)

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um ativo com este código nesta empresa.' }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function deleteAtivo(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'ativos', 'delete')) {
    console.error('Sem permissão para excluir ativos.')
    return
  }

  const id = formData.get('id') as string
  const supabase = await createClient()
  let query = supabase.from('cad_ativos').delete().eq('id', id)
  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  await query
  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}
