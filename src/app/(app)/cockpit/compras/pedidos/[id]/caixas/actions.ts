'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

async function gate() {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Sessão sem empresa.' as const, me: null }
  const isSuper = me.role_global === 'superadmin'
  if (!isSuper && !(await empresaHasAddon(me.empresa_id, 'compras'))) {
    return { error: 'Addon Compras não está ativo nesta empresa.' as const, me: null }
  }
  const pode =
    isSuper ||
    hasPermission(me, 'compras_conferencia', 'create') ||
    hasPermission(me, 'compras_conferencia', 'edit')
  if (!pode) return { error: 'Sem permissão para conferir recebimento.' as const, me: null }
  return { error: null, me }
}

function revalidate(pedidoId: string, caixaId?: string) {
  revalidatePath('/cockpit/compras/pedidos')
  revalidatePath(`/cockpit/compras/pedidos/${pedidoId}`)
  revalidatePath(`/cockpit/compras/pedidos/${pedidoId}/caixas`)
  if (caixaId) revalidatePath(`/cockpit/compras/pedidos/${pedidoId}/caixas/${caixaId}`)
}

export async function abrirCaixa(pedidoId: string) {
  const { error, me } = await gate()
  if (error || !me) return { error: error || 'Sem permissão.' }
  const supabase = await createClient()
  const { data, error: rpcErr } = await supabase.rpc('com_abrir_caixa', { p_pedido: pedidoId })
  const row = Array.isArray(data) ? data[0] : data
  const caixaId =
    row && typeof row === 'object' && 'id' in row && typeof row.id === 'string' ? row.id : null
  if (rpcErr || !caixaId) return { error: rpcErr?.message || 'Não foi possível abrir a caixa.' }
  revalidate(pedidoId, caixaId)
  return { ok: true as const, id: caixaId }
}

export async function cancelarCaixa(caixaId: string) {
  const { error, me } = await gate()
  if (error || !me) return { error: error || 'Sem permissão.' }
  const supabase = await createClient()
  const { data: caixa } = await supabase
    .from('com_caixas')
    .select('id, pedido_id, status, numero')
    .eq('id', caixaId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!caixa) return { error: 'Caixa não encontrada.' }
  if (caixa.status !== 'aberta') {
    return { error: 'Número cancelado não reabre, e caixa já lida não cancela.' }
  }
  const { error: upErr } = await supabase
    .from('com_caixas')
    .update({ status: 'cancelada', cancelada_em: new Date().toISOString() })
    .eq('id', caixa.id)
    .eq('empresa_id', me.empresa_id)
    .eq('status', 'aberta')
  if (upErr) return { error: upErr.message }
  revalidate(caixa.pedido_id, caixa.id)
  return { ok: true as const }
}

export async function buscarCaixa(codigo: string) {
  const { error, me } = await gate()
  if (error || !me) return { error: error || 'Sem permissão.' }
  const supabase = await createClient()
  const { data } = await supabase
    .from('com_caixas')
    .select('id, pedido_id, status')
    .eq('empresa_id', me.empresa_id)
    .eq('codigo', codigo.trim().toUpperCase())
    .maybeSingle()
  if (!data) return { error: 'Caixa não encontrada.' }
  if (data.status === 'cancelada') return { error: 'Esta caixa foi cancelada. O número não reabre.' }
  return { ok: true as const, id: data.id as string, pedidoId: data.pedido_id as string }
}

export async function lerCaixa(input: {
  caixaId: string
  itens: Array<{ pedido_item_id: string; quantidade: number; divergencia: string }>
}) {
  const { error, me } = await gate()
  if (error || !me) return { error: error || 'Sem permissão.' }
  const supabase = await createClient()
  const { data: caixa } = await supabase
    .from('com_caixas')
    .select('id, pedido_id, status')
    .eq('id', input.caixaId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!caixa) return { error: 'Caixa não encontrada.' }
  if (caixa.status !== 'aberta') return { error: 'Esta caixa não está aberta para leitura.' }

  const recebendo = input.itens.filter((l) => Number(l.quantidade) > 0)
  if (!recebendo.length) return { error: 'Informe a quantidade de ao menos um item nesta caixa.' }

  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, status')
    .eq('id', caixa.pedido_id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido || !['aprovado', 'recebido_parcial'].includes(pedido.status)) {
    return { error: 'Pedido não está para conferência.' }
  }

  const { data: itens } = await supabase
    .from('com_pedido_itens')
    .select('id, quantidade')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me.empresa_id)
  const pedidoQtd = new Map((itens || []).map((i) => [i.id, Number(i.quantidade)]))

  let anteriores: Array<{ pedido_item_id: string; quantidade: number }> = []
  if (pedidoQtd.size > 0) {
    const { data } = await supabase
      .from('com_recebimento_itens')
      .select('pedido_item_id, quantidade')
      .eq('empresa_id', me.empresa_id)
      .in('pedido_item_id', [...pedidoQtd.keys()])
    anteriores = data || []
  }
  const jaRecebido = new Map<string, number>()
  for (const row of anteriores || []) {
    jaRecebido.set(row.pedido_item_id, (jaRecebido.get(row.pedido_item_id) || 0) + Number(row.quantidade))
  }

  for (const linha of recebendo) {
    const pedida = pedidoQtd.get(linha.pedido_item_id)
    if (pedida == null) return { error: 'Item não pertence a este pedido.' }
    const saldo = pedida - (jaRecebido.get(linha.pedido_item_id) || 0)
    if (linha.quantidade - saldo > 0.0001) {
      return { error: 'Quantidade desta caixa passa do saldo do item.' }
    }
  }

  const { data: rec, error: recErr } = await supabase
    .from('com_recebimentos')
    .insert({
      empresa_id: me.empresa_id,
      pedido_id: pedido.id,
      usuario_id: me.id,
      observacao: null,
    })
    .select('id')
    .single()
  if (recErr || !rec) return { error: recErr?.message || 'Não foi possível gravar a leitura.' }

  const { error: itemErr } = await supabase.from('com_recebimento_itens').insert(
    recebendo.map((linha) => ({
      empresa_id: me.empresa_id,
      recebimento_id: rec.id,
      pedido_item_id: linha.pedido_item_id,
      quantidade: linha.quantidade,
      divergencia: linha.divergencia.trim() || null,
    })),
  )
  if (itemErr) return { error: itemErr.message }

  const { error: caixaItemErr } = await supabase.from('com_caixa_itens').insert(
    recebendo.map((linha) => ({
      empresa_id: me.empresa_id,
      caixa_id: caixa.id,
      pedido_item_id: linha.pedido_item_id,
      quantidade: linha.quantidade,
      divergencia: linha.divergencia.trim() || null,
    })),
  )
  if (caixaItemErr) return { error: caixaItemErr.message }

  const { error: caixaErr } = await supabase
    .from('com_caixas')
    .update({
      status: 'lida',
      lida_em: new Date().toISOString(),
      recebimento_id: rec.id,
    })
    .eq('id', caixa.id)
    .eq('empresa_id', me.empresa_id)
    .eq('status', 'aberta')
  if (caixaErr) return { error: caixaErr.message }

  let fechou = true
  for (const [itemId, pedida] of pedidoQtd) {
    const neste = recebendo.find((l) => l.pedido_item_id === itemId)?.quantidade || 0
    const saldo = pedida - (jaRecebido.get(itemId) || 0) - neste
    if (saldo > 0.0001) fechou = false
  }
  const { error: upErr } = await supabase
    .from('com_pedidos')
    .update({ status: fechou ? 'recebido' : 'recebido_parcial' })
    .eq('id', pedido.id)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }

  revalidate(pedido.id, caixa.id)
  return { ok: true as const }
}
