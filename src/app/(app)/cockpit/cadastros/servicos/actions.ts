'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { gerarCodigoServico } from '@/lib/servicos/numeros'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

const LIST_PATH = '/cockpit/cadastros/servicos'

async function gate(action: 'view' | 'create' | 'edit' | 'delete') {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Sessão sem empresa.' as const, me: null }
  const isSuper = me.role_global === 'superadmin'
  if (!isSuper && !(await empresaHasAddon(me.empresa_id, 'compras'))) {
    return { error: 'Addon Compras não está ativo.' as const, me: null }
  }
  if (!isSuper && !hasPermission(me, 'servicos', action)) {
    return { error: 'Sem permissão.' as const, me: null }
  }
  return { error: null, me }
}

async function servicoEmUso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: string,
  servicoId: string,
) {
  const [{ count: nSol }, { count: nPed }] = await Promise.all([
    supabase
      .from('com_solicitacao_itens')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('servico_id', servicoId),
    supabase
      .from('com_pedido_itens')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('servico_id', servicoId),
  ])
  return (nSol || 0) + (nPed || 0) > 0
}

function payloadFromForm(formData: FormData) {
  const nome = String(formData.get('nome') || '').trim()
  const unidade = String(formData.get('unidade') || 'HORAS').trim().toUpperCase() || 'HORAS'
  const precoRaw = String(formData.get('preco_referencia') || '').trim()
  const descricao = String(formData.get('descricao') || '').trim() || null
  const ativo = formData.get('ativo') === 'on' || formData.get('ativo') === 'true'
  return {
    nome,
    unidade,
    preco_referencia: precoRaw ? Number(precoRaw.replace(',', '.')) : null,
    descricao,
    ativo,
  }
}

export async function createServico(formData: FormData) {
  const { error, me } = await gate('create')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const payload = payloadFromForm(formData)
  if (!payload.nome) return { error: 'Informe o nome.' }

  const supabase = await createClient()
  const codigo = await gerarCodigoServico(me.empresa_id, supabase)

  const { error: insErr } = await supabase.from('cad_servicos').insert({
    ...payload,
    codigo,
    empresa_id: me.empresa_id,
    updated_at: new Date().toISOString(),
  })
  if (insErr) {
    if (insErr.code === '23505') {
      const retry = await gerarCodigoServico(me.empresa_id, supabase)
      const { error: retryErr } = await supabase.from('cad_servicos').insert({
        ...payload,
        codigo: retry,
        empresa_id: me.empresa_id,
        updated_at: new Date().toISOString(),
      })
      if (retryErr) return { error: retryErr.message }
    } else {
      return { error: insErr.message }
    }
  }
  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

export async function updateServico(id: string, formData: FormData) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const supabase = await createClient()
  const { data: atual } = await supabase
    .from('cad_servicos')
    .select('codigo')
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!atual) return { error: 'Serviço não encontrado.' }

  const payload = payloadFromForm(formData)
  if (!payload.nome) return { error: 'Informe o nome.' }

  const { error: upErr } = await supabase
    .from('cad_servicos')
    .update({
      nome: payload.nome,
      unidade: payload.unidade,
      preco_referencia: payload.preco_referencia,
      descricao: payload.descricao,
      ativo: payload.ativo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }
  revalidatePath(LIST_PATH)
  redirect(LIST_PATH)
}

/** Exclui só se não houver solicitação/pedido vinculado; senão recusa. */
export async function deleteServico(formData: FormData) {
  const { error, me } = await gate('delete')
  if (error || !me) return

  const id = String(formData.get('id') || '')
  if (!id) return
  const supabase = await createClient()
  if (await servicoEmUso(supabase, me.empresa_id, id)) {
    return
  }
  await supabase.from('cad_servicos').delete().eq('id', id).eq('empresa_id', me.empresa_id)
  revalidatePath(LIST_PATH)
}

export async function desativarServico(formData: FormData) {
  const { error, me } = await gate('edit')
  if (error || !me) return

  const id = String(formData.get('id') || '')
  if (!id) return
  const supabase = await createClient()
  await supabase
    .from('cad_servicos')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
  revalidatePath(LIST_PATH)
}

export async function reativarServico(formData: FormData) {
  const { error, me } = await gate('edit')
  if (error || !me) return

  const id = String(formData.get('id') || '')
  if (!id) return
  const supabase = await createClient()
  await supabase
    .from('cad_servicos')
    .update({ ativo: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
  revalidatePath(LIST_PATH)
}
