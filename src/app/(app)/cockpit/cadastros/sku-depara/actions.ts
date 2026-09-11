'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { deparaPayloadFromForm, parseDeparasBulkFromForm } from '@/lib/skus/constants'

const LIST_PATH = '/cockpit/cadastros/sku-depara'

export async function createSkuDeparasBulk(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'create') && !hasPermission(me, 'skus', 'edit')) {
    return { error: 'Sem permissão para criar de-para.' }
  }

  const parsed = parseDeparasBulkFromForm(formData)
  if ('error' in parsed && parsed.error) return { error: parsed.error }
  const rows = 'rows' in parsed ? parsed.rows : []
  if (!rows?.length) return { error: 'Informe ao menos uma linha completa.' }

  const empresaId =
    me?.role_global === 'superadmin'
      ? ((formData.get('empresa_id') as string) || me?.empresa_id || '')
      : me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const now = new Date().toISOString()
  const supabase = await createClient()

  // Garante que todos os SKUs/pessoas pertencem ao tenant (sem digitação livre de UUID)
  const skuIds = [...new Set(rows.map((r) => r.sku_id))]
  const pessoaIds = [...new Set(rows.map((r) => r.pessoa_id))]

  const [{ data: skusOk }, { data: pessoasOk }] = await Promise.all([
    supabase.from('cad_skus').select('id').eq('empresa_id', empresaId).in('id', skuIds),
    supabase.from('crm_leads').select('id').eq('empresa_id', empresaId).in('id', pessoaIds),
  ])

  const skuSet = new Set((skusOk || []).map((s) => s.id))
  const pessoaSet = new Set((pessoasOk || []).map((p) => p.id))
  if (skuIds.some((id) => !skuSet.has(id))) {
    return { error: 'SKU inválido para esta empresa. Selecione apenas itens da lista.' }
  }
  if (pessoaIds.some((id) => !pessoaSet.has(id))) {
    return { error: 'Pessoa inválida para esta empresa. Selecione apenas itens da lista.' }
  }

  const { error } = await supabase.from('cad_sku_depara').insert(
    rows.map((r) => ({
      empresa_id: empresaId,
      sku_id: r.sku_id,
      pessoa_id: r.pessoa_id,
      codigo_parceiro: r.codigo_parceiro,
      observacao: null,
      ativo: r.ativo,
      updated_at: now,
    })),
  )

  if (error) {
    if (error.code === '23505') {
      return { error: 'Conflito: algum SKU/pessoa ou código do parceiro já existe.' }
    }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function updateSkuDepara(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'edit')) {
    return { error: 'Sem permissão para editar de-para.' }
  }

  const payload = deparaPayloadFromForm(formData)
  if (!payload.sku_id) return { error: 'Selecione o SKU Hugin.' }
  if (!payload.pessoa_id) return { error: 'Selecione a pessoa (cliente/fornecedor).' }
  if (!payload.codigo_parceiro) return { error: 'Informe o código do parceiro.' }

  const empresaId =
    me?.role_global === 'superadmin'
      ? ((formData.get('empresa_id') as string) || me?.empresa_id || '')
      : me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()
  let query = supabase
    .from('cad_sku_depara')
    .update({
      sku_id: payload.sku_id,
      pessoa_id: payload.pessoa_id,
      codigo_parceiro: payload.codigo_parceiro,
      observacao: payload.observacao,
      ativo: payload.ativo,
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
      return { error: 'Já existe de-para para este SKU/pessoa ou código do parceiro.' }
    }
    return { error: error.message }
  }

  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function deleteSkuDepara(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'delete') && !hasPermission(me, 'skus', 'edit')) {
    console.error('Sem permissão para excluir de-para.')
    return
  }

  const id = formData.get('id') as string
  const supabase = await createClient()
  let query = supabase.from('cad_sku_depara').delete().eq('id', id)
  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  await query
  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}
