'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'

const LIST_PATH = '/cockpit/estoque/locais'

async function resolveEmpresaId(
  me: Awaited<ReturnType<typeof getMyProfile>>,
  formData?: FormData,
) {
  if (me?.role_global === 'superadmin') {
    return (formData?.get('empresa_id') as string) || me?.empresa_id || ''
  }
  return me?.empresa_id ?? ''
}

function canManageLocais(me: Awaited<ReturnType<typeof getMyProfile>>, action: 'create' | 'edit' | 'delete') {
  if (me?.role_global === 'superadmin') return true
  return hasPermission(me, 'estoque_locais', action) || hasPermission(me, 'estoque', action)
}

export async function createLocal(formData: FormData) {
  const me = await getMyProfile()
  if (!canManageLocais(me, 'create')) {
    return { error: 'Sem permissão para criar locais de estoque.' }
  }

  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  let codigo = ((formData.get('codigo') as string) || '').trim().toUpperCase()
  const nome = ((formData.get('nome') as string) || '').trim()
  let tipo = (formData.get('tipo') as string) || 'almoxarifado'
  let ehPrincipal = formData.get('eh_principal') === 'on' || formData.get('eh_principal') === 'true'
  const departamentoId = (formData.get('departamento_id') as string) || null
  const ativo = formData.get('ativo') !== 'false'

  if (!codigo) return { error: 'Informe o código do local.' }
  if (!nome) return { error: 'Informe o nome do local.' }

  if (codigo === 'TERCEIROS') {
    return {
      error:
        'O código TERCEIROS é reservado ao sistema (estoque em poder de terceiros). Ele é criado automaticamente com a empresa.',
    }
  }

  // Regra BRANCO (§5.2): Se o código for BRANCO, é forçado como principal
  if (codigo === 'BRANCO') {
    ehPrincipal = true
    tipo = 'principal'
  }

  const supabase = await createClient()

  // Se este local for marcado como principal, desmarca o anterior da empresa para não violar o índice único
  if (ehPrincipal) {
    await supabase
      .from('cad_locais_estoque')
      .update({ eh_principal: false, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresaId)
      .eq('eh_principal', true)
  }

  const { error } = await supabase.from('cad_locais_estoque').insert([
    {
      empresa_id: empresaId,
      codigo,
      nome,
      tipo,
      eh_principal: ehPrincipal,
      departamento_id: departamentoId || null,
      ativo,
      updated_at: new Date().toISOString(),
    },
  ])

  if (error) {
    if (error.code === '23505') {
      return { error: `Já existe um local com o código "${codigo}" nesta empresa.` }
    }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function updateLocal(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!canManageLocais(me, 'edit')) {
    return { error: 'Sem permissão para editar locais de estoque.' }
  }

  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  let codigo = ((formData.get('codigo') as string) || '').trim().toUpperCase()
  const nome = ((formData.get('nome') as string) || '').trim()
  let tipo = (formData.get('tipo') as string) || 'almoxarifado'
  let ehPrincipal = formData.get('eh_principal') === 'on' || formData.get('eh_principal') === 'true'
  const departamentoId = (formData.get('departamento_id') as string) || null
  const ativo = formData.get('ativo') !== 'false'

  if (!codigo) return { error: 'Informe o código do local.' }
  if (!nome) return { error: 'Informe o nome do local.' }

  if (codigo === 'BRANCO') {
    ehPrincipal = true
    tipo = 'principal'
  }

  const supabase = await createClient()

  // Se este local for marcado como principal, desmarca qualquer outro que fosse principal
  if (ehPrincipal) {
    await supabase
      .from('cad_locais_estoque')
      .update({ eh_principal: false, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresaId)
      .neq('id', id)
      .eq('eh_principal', true)
  }

  const { error } = await supabase
    .from('cad_locais_estoque')
    .update({
      codigo,
      nome,
      tipo,
      eh_principal: ehPrincipal,
      departamento_id: departamentoId || null,
      ativo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('empresa_id', empresaId)

  if (error) {
    if (error.code === '23505') {
      return { error: `Já existe um local com o código "${codigo}" nesta empresa.` }
    }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function deleteLocal(id: string) {
  const me = await getMyProfile()
  if (!canManageLocais(me, 'delete')) {
    return { error: 'Sem permissão para excluir locais de estoque.' }
  }

  const supabase = await createClient()
  const empresaId = me?.empresa_id ?? ''

  // 1. Verificar se é local principal
  let queryLocal = supabase
    .from('cad_locais_estoque')
    .select('id, codigo, eh_principal, eh_terceiros')
    .eq('id', id)
  if (me?.role_global !== 'superadmin') {
    queryLocal = queryLocal.eq('empresa_id', empresaId)
  }
  const { data: localData } = await queryLocal.single()

  if (!localData) {
    return { error: 'Local não encontrado.' }
  }

  if (
    localData.codigo === 'BRANCO' ||
    localData.codigo === 'TERCEIROS' ||
    localData.eh_terceiros
  ) {
    return {
      error:
        'Locais de sistema (BRANCO / TERCEIROS) não podem ser excluídos. Eles são criados automaticamente com a empresa.',
    }
  }

  // 2. Verificar se possui saldo em estoque
  const { data: saldos } = await supabase
    .from('est_saldos')
    .select('quantidade')
    .eq('local_id', id)
    .gt('quantidade', 0)
    .limit(1)

  if (saldos && saldos.length > 0) {
    return {
      error: 'Não é possível excluir este local pois ainda existem SKUs com saldo positivo armazenados nele. Transfira ou zere o saldo antes de excluir.',
    }
  }

  // 3. Verificar se há movimentações no Cardex
  const { data: movimentos } = await supabase
    .from('est_movimentos')
    .select('id')
    .or(`local_id.eq.${id},local_destino_id.eq.${id}`)
    .limit(1)

  if (movimentos && movimentos.length > 0) {
    return {
      error: 'Este local possui histórico de movimentações no Cardex e não pode ser excluído fisicamente. Você pode desativá-lo para impedir novos lançamentos.',
    }
  }

  let deleteQuery = supabase.from('cad_locais_estoque').delete().eq('id', id)
  if (me?.role_global !== 'superadmin') {
    deleteQuery = deleteQuery.eq('empresa_id', empresaId)
  }

  const { error } = await deleteQuery
  if (error) return { error: error.message }

  revalidatePath(LIST_PATH)
  return { success: true }
}

export async function criarLocalBrancoRapido() {
  const me = await getMyProfile()
  if (!canManageLocais(me, 'create')) {
    return { error: 'Sem permissão para criar locais de estoque.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('est_garantir_locais_padrao', {
    p_empresa_id: empresaId,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  return { success: true }
}
