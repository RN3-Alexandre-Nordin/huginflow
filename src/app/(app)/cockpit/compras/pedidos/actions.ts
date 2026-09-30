'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { niveisExigidos, type ComConfig } from '@/lib/compras/tipos'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

const STATUS_EDITAVEL = new Set(['aguardando_aprovacao', 'aprovado', 'recusado'])
const STATUS_RECEBIVEL = new Set(['aprovado', 'recebido_parcial'])

async function gate(modulo: string, action: 'view' | 'create' | 'edit' | 'delete') {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Sessão sem empresa.' as const, me: null }
  const isSuper = me.role_global === 'superadmin'
  if (!isSuper && !(await empresaHasAddon(me.empresa_id, 'compras'))) {
    return { error: 'Addon Compras não está ativo nesta empresa.' as const, me: null }
  }
  if (!isSuper && !hasPermission(me, modulo, action)) {
    return { error: 'Sem permissão para esta ação.' as const, me: null }
  }
  return { error: null, me }
}

async function gateConferencia() {
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

async function lerConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: string,
): Promise<ComConfig | null> {
  const { data } = await supabase
    .from('com_config')
    .select('empresa_id, aprovacao_ativa, nivel1_grupo_id, nivel1_teto, nivel2_grupo_id, nivel2_a_partir')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  return (data as ComConfig | null) ?? null
}

function centavos(n: number) {
  return Math.round(n * 100)
}

function revalidatePedido(id: string) {
  revalidatePath('/cockpit/compras/pedidos')
  revalidatePath(`/cockpit/compras/pedidos/${id}`)
}

export async function atualizarPedido(formData: FormData) {
  const { error, me } = await gate('compras_pedidos', 'edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const pedidoId = String(formData.get('pedido_id') || '').trim()
  const fornecedorId = String(formData.get('fornecedor_id') || '').trim()
  const previsao = String(formData.get('previsao_chegada') || '') || null
  const observacao = String(formData.get('observacao') || '').trim() || null
  if (!pedidoId) return { error: 'Pedido inválido.' }
  if (!fornecedorId) return { error: 'Selecione o fornecedor.' }

  let itens: Array<{ id: string; quantidade: number; preco_unitario: number }> = []
  try {
    itens = JSON.parse(String(formData.get('itens_json') || '[]'))
  } catch {
    return { error: 'Itens inválidos.' }
  }
  if (!itens.length) return { error: 'O pedido precisa manter os itens.' }

  const supabase = await createClient()
  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, status, valor_total')
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido) return { error: 'Pedido não encontrado.' }
  if (!STATUS_EDITAVEL.has(pedido.status)) {
    return { error: 'Este pedido não pode mais ser editado.' }
  }

  const { count: recebidos } = await supabase
    .from('com_recebimentos')
    .select('id', { count: 'exact', head: true })
    .eq('pedido_id', pedidoId)
    .eq('empresa_id', me.empresa_id)
  if ((recebidos || 0) > 0) {
    return { error: 'Pedido com recebimento não pode ser editado.' }
  }

  const { data: fornecedor } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', me.empresa_id)
    .eq('id', fornecedorId)
    .contains('papeis', ['fornecedor'])
    .maybeSingle()
  if (!fornecedor) return { error: 'Fornecedor não encontrado.' }

  const { data: atuais } = await supabase
    .from('com_pedido_itens')
    .select('id, quantidade')
    .eq('pedido_id', pedidoId)
    .eq('empresa_id', me.empresa_id)
  const idsAtuais = new Set((atuais || []).map((i) => i.id))
  if (idsAtuais.size !== itens.length || itens.some((i) => !idsAtuais.has(i.id))) {
    return { error: 'A edição altera quantidade e preço dos itens existentes.' }
  }
  for (const item of itens) {
    if (!(Number.isFinite(item.quantidade) && item.quantidade > 0)) {
      return { error: 'Quantidade inválida.' }
    }
    if (!(Number.isFinite(item.preco_unitario) && item.preco_unitario >= 0)) {
      return { error: 'Preço inválido.' }
    }
  }

  const valor = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const valorMudou = centavos(valor) !== centavos(Number(pedido.valor_total))
  const config = await lerConfig(supabase, me.empresa_id)
  const exigidos = niveisExigidos(config, valor)

  let status = pedido.status as string
  let reabrirAlcada = false
  if (pedido.status === 'aprovado' && valorMudou) {
    status = exigidos === 0 ? 'aprovado' : 'aguardando_aprovacao'
    reabrirAlcada = exigidos > 0
  } else if (pedido.status === 'recusado') {
    status = exigidos === 0 ? 'aprovado' : 'aguardando_aprovacao'
    reabrirAlcada = true
  } else if (pedido.status === 'aguardando_aprovacao' && valorMudou) {
    status = exigidos === 0 ? 'aprovado' : 'aguardando_aprovacao'
    reabrirAlcada = exigidos > 0
  }

  for (const item of itens) {
    const { error: itemErr } = await supabase
      .from('com_pedido_itens')
      .update({
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
      })
      .eq('id', item.id)
      .eq('pedido_id', pedidoId)
      .eq('empresa_id', me.empresa_id)
    if (itemErr) return { error: itemErr.message }
  }

  const { error: upErr } = await supabase
    .from('com_pedidos')
    .update({
      fornecedor_id: fornecedorId,
      previsao_chegada: previsao,
      observacao,
      valor_total: valor,
      status,
    })
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }

  if (reabrirAlcada) {
    const { error: delErr } = await supabase
      .from('com_pedido_aprovacoes')
      .delete()
      .eq('pedido_id', pedidoId)
      .eq('empresa_id', me.empresa_id)
    if (delErr) return { error: delErr.message }
  }

  revalidatePedido(pedidoId)
  return { ok: true as const, status }
}

export async function cancelarPedido(formData: FormData) {
  const { error, me } = await gate('compras_pedidos', 'edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const pedidoId = String(formData.get('pedido_id') || '').trim()
  const motivo = String(formData.get('motivo') || '').trim()
  if (!pedidoId) return { error: 'Pedido inválido.' }
  if (!motivo) return { error: 'Informe o motivo do cancelamento.' }

  const supabase = await createClient()
  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, status')
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido) return { error: 'Pedido não encontrado.' }
  if (!STATUS_EDITAVEL.has(pedido.status)) {
    return { error: 'Este pedido não pode ser cancelado.' }
  }

  const { count: recebidos } = await supabase
    .from('com_recebimentos')
    .select('id', { count: 'exact', head: true })
    .eq('pedido_id', pedidoId)
    .eq('empresa_id', me.empresa_id)
  if ((recebidos || 0) > 0) {
    return { error: 'Pedido com recebimento não pode ser cancelado.' }
  }

  const { data: updated, error: upErr } = await supabase
    .from('com_pedidos')
    .update({
      status: 'cancelado',
      cancelamento_motivo: motivo,
      cancelado_em: new Date().toISOString(),
      cancelado_usuario_id: me.id,
    })
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
    .select('id')
    .maybeSingle()
  if (upErr) return { error: upErr.message }
  if (!updated) return { error: 'Não foi possível cancelar o pedido.' }

  revalidatePedido(pedidoId)
  return { ok: true as const }
}

export async function registrarRecebimento(formData: FormData) {
  const { error, me } = await gateConferencia()
  if (error || !me) return { error: error || 'Sem permissão.' }

  const pedidoId = String(formData.get('pedido_id') || '').trim()
  const observacao = String(formData.get('observacao') || '').trim() || null
  if (!pedidoId) return { error: 'Pedido inválido.' }

  let linhas: Array<{ pedido_item_id: string; quantidade: number; divergencia: string | null }> = []
  try {
    linhas = JSON.parse(String(formData.get('itens_json') || '[]'))
  } catch {
    return { error: 'Itens inválidos.' }
  }
  const recebendo = linhas.filter((l) => Number(l.quantidade) > 0)
  if (!recebendo.length) return { error: 'Informe a quantidade recebida de ao menos um item.' }

  const supabase = await createClient()
  const { data: configCaixa } = await supabase
    .from('com_config')
    .select('recebimento_por_caixa')
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (configCaixa?.recebimento_por_caixa) {
    return { error: 'Com a conferência por caixa ligada, o recebimento é a leitura da caixa.' }
  }

  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, status')
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido) return { error: 'Pedido não encontrado.' }
  if (!STATUS_RECEBIVEL.has(pedido.status)) {
    return { error: 'Só é possível receber pedido aprovado ou com recebimento parcial.' }
  }

  const { data: itens } = await supabase
    .from('com_pedido_itens')
    .select('id, quantidade')
    .eq('pedido_id', pedidoId)
    .eq('empresa_id', me.empresa_id)
  const pedidoQtd = new Map((itens || []).map((i) => [i.id, Number(i.quantidade)]))

  let anteriores: Array<{ pedido_item_id: string; quantidade: number }> = []
  if (pedidoQtd.size > 0) {
    const { data, error: antErr } = await supabase
      .from('com_recebimento_itens')
      .select('pedido_item_id, quantidade')
      .eq('empresa_id', me.empresa_id)
      .in('pedido_item_id', [...pedidoQtd.keys()])
    if (antErr) return { error: antErr.message }
    anteriores = data || []
  }

  const jaRecebido = new Map<string, number>()
  for (const row of anteriores || []) {
    jaRecebido.set(row.pedido_item_id, (jaRecebido.get(row.pedido_item_id) || 0) + Number(row.quantidade))
  }

  for (const linha of recebendo) {
    const pedida = pedidoQtd.get(linha.pedido_item_id)
    if (pedida == null) return { error: 'Item não pertence a este pedido.' }
    if (!(Number.isFinite(linha.quantidade) && linha.quantidade > 0)) {
      return { error: 'Quantidade recebida inválida.' }
    }
    const saldo = pedida - (jaRecebido.get(linha.pedido_item_id) || 0)
    if (linha.quantidade - saldo > 0.0001) {
      return { error: 'Quantidade recebida maior que o saldo do item.' }
    }
  }

  const { data: rec, error: recErr } = await supabase
    .from('com_recebimentos')
    .insert({
      empresa_id: me.empresa_id,
      pedido_id: pedidoId,
      usuario_id: me.id,
      observacao,
    })
    .select('id')
    .single()
  if (recErr || !rec) return { error: recErr?.message || 'Não foi possível registrar o recebimento.' }

  const { error: itemErr } = await supabase.from('com_recebimento_itens').insert(
    recebendo.map((linha) => ({
      empresa_id: me.empresa_id,
      recebimento_id: rec.id,
      pedido_item_id: linha.pedido_item_id,
      quantidade: linha.quantidade,
      divergencia: linha.divergencia?.trim() || null,
    })),
  )
  if (itemErr) return { error: itemErr.message }

  let fechou = true
  for (const [itemId, pedida] of pedidoQtd) {
    const neste = recebendo.find((l) => l.pedido_item_id === itemId)?.quantidade || 0
    const saldo = pedida - (jaRecebido.get(itemId) || 0) - neste
    if (saldo > 0.0001) fechou = false
  }

  const status = fechou ? 'recebido' : 'recebido_parcial'
  const { error: upErr } = await supabase
    .from('com_pedidos')
    .update({ status })
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }

  revalidatePedido(pedidoId)
  revalidatePath(`/cockpit/compras/pedidos/${pedidoId}/receber`)
  return { ok: true as const, status }
}
