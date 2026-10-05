'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { gerarNumeroDevolucao } from '@/lib/compras/numeros'
import { pedidoPodeDevolver } from '@/lib/compras/devolucao-status'
import {
  carregarPedidoParaDevolucao,
  listarPedidosParaDevolucao,
} from '@/lib/compras/devolucao-pedidos'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

const MOTIVOS = new Set(['trocado', 'avaria', 'outro'])

async function gate(action: 'view' | 'create' | 'edit') {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Sessão sem empresa.' as const, me: null }
  const isSuper = me.role_global === 'superadmin'
  if (!isSuper && !(await empresaHasAddon(me.empresa_id, 'compras'))) {
    return { error: 'Addon Compras não está ativo nesta empresa.' as const, me: null }
  }
  if (!isSuper && !hasPermission(me, 'compras_devolucoes', action)) {
    return { error: 'Sem permissão para esta ação.' as const, me: null }
  }
  return { error: null, me }
}

export async function localizarPedidosDevolucao(input: {
  q?: string
  fornecedor?: string
  data?: string
  status?: string
}) {
  const { error, me } = await gate('create')
  if (error || !me) return { error: error || 'Sem permissão.', pedidos: [] }
  const supabase = await createClient()
  return listarPedidosParaDevolucao(supabase, me.empresa_id, input)
}

export async function abrirPedidoDevolucao(pedidoId: string) {
  const { error, me } = await gate('create')
  if (error || !me) return { error: error || 'Sem permissão.', pedido: null }
  const supabase = await createClient()
  return carregarPedidoParaDevolucao(supabase, me.empresa_id, pedidoId)
}

export type ItemDevolucaoInput = {
  pedido_item_id: string
  quantidade: number
  motivo: string
}

export async function lancarDevolucao(input: {
  pedido_id: string
  observacao: string
  confirmar: boolean
  itens: ItemDevolucaoInput[]
}) {
  const { error, me } = await gate('create')
  if (error || !me) return { error: error || 'Sem permissão.' }
  if (input.confirmar) {
    const confirmacao = await gate('edit')
    if (confirmacao.error || !confirmacao.me) {
      return { error: confirmacao.error || 'Sem permissão para confirmar a devolução.' }
    }
  }

  const itens = input.itens.filter((item) => item.quantidade > 0)
  if (!itens.length) return { error: 'Informe a quantidade de ao menos um item.' }
  for (const item of itens) {
    if (!MOTIVOS.has(item.motivo)) return { error: 'Cada item precisa do motivo: SKU trocado, avaria ou outro.' }
    if (!(item.quantidade > 0)) return { error: 'Quantidade inválida.' }
  }

  const supabase = await createClient()
  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, status, fornecedor_id')
    .eq('id', input.pedido_id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido) return { error: 'Pedido não encontrado.' }
  if (!pedidoPodeDevolver(pedido.status)) {
    return { error: 'Só é possível devolver pedido que já teve recebimento.' }
  }
  if (!pedido.fornecedor_id) return { error: 'O pedido não tem fornecedor.' }

  const ids = itens.map((item) => item.pedido_item_id)
  const { data: linhasPedido } = await supabase
    .from('com_pedido_itens')
    .select('id, sku_id, descricao, unidade')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me.empresa_id)
    .in('id', ids)
  const porId = new Map((linhasPedido || []).map((linha) => [linha.id, linha]))

  const { data: recebidos } = await supabase
    .from('com_recebimento_itens')
    .select('pedido_item_id, quantidade')
    .eq('empresa_id', me.empresa_id)
    .in('pedido_item_id', ids)
  const recebido = new Map<string, number>()
  for (const row of recebidos || []) {
    recebido.set(row.pedido_item_id, (recebido.get(row.pedido_item_id) || 0) + Number(row.quantidade))
  }

  const { data: devolvidos } = await supabase
    .from('com_devolucao_itens')
    .select('pedido_item_id, quantidade, devolucao:com_devolucoes!devolucao_id(status)')
    .eq('empresa_id', me.empresa_id)
    .in('pedido_item_id', ids)
  const ja = new Map<string, number>()
  for (const row of devolvidos || []) {
    const cab = row.devolucao as { status?: string } | { status?: string }[] | null
    const status = Array.isArray(cab) ? cab[0]?.status : cab?.status
    if (status === 'cancelada') continue
    ja.set(row.pedido_item_id, (ja.get(row.pedido_item_id) || 0) + Number(row.quantidade))
  }

  for (const item of itens) {
    const linha = porId.get(item.pedido_item_id)
    if (!linha) return { error: 'Item não pertence a este pedido.' }
    const saldo = (recebido.get(item.pedido_item_id) || 0) - (ja.get(item.pedido_item_id) || 0)
    if (item.quantidade - saldo > 0.0001) {
      return { error: `A quantidade de “${linha.descricao}” passa do que ainda pode ser devolvido.` }
    }
  }

  const numero = await gerarNumeroDevolucao(me.empresa_id, supabase)
  const agora = new Date().toISOString()
  const { data: doc, error: docErr } = await supabase
    .from('com_devolucoes')
    .insert({
      empresa_id: me.empresa_id,
      pedido_id: pedido.id,
      fornecedor_id: pedido.fornecedor_id,
      numero,
      status: input.confirmar ? 'confirmada' : 'rascunho',
      observacao: input.observacao.trim() || null,
      criador_usuario_id: me.id,
      confirmada_em: input.confirmar ? agora : null,
      confirmada_usuario_id: input.confirmar ? me.id : null,
    })
    .select('id')
    .single()
  if (docErr || !doc) return { error: docErr?.message || 'Falha ao gravar a devolução.' }

  const { error: itemErr } = await supabase.from('com_devolucao_itens').insert(
    itens.map((item) => {
      const linha = porId.get(item.pedido_item_id)!
      return {
        empresa_id: me.empresa_id,
        devolucao_id: doc.id,
        pedido_item_id: item.pedido_item_id,
        sku_id: linha.sku_id,
        descricao: linha.descricao,
        quantidade: item.quantidade,
        unidade: linha.unidade || 'UN',
        motivo: item.motivo,
      }
    }),
  )
  if (itemErr) return { error: itemErr.message }

  revalidatePath('/cockpit/compras/devolucoes')
  revalidatePath(`/cockpit/compras/pedidos/${pedido.id}`)
  return { ok: true as const, id: doc.id as string }
}

export async function confirmarDevolucao(id: string) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }
  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('com_devolucoes')
    .select('id, status')
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!doc) return { error: 'Devolução não encontrada.' }
  if (doc.status !== 'rascunho') return { error: 'Só um rascunho pode ser confirmado.' }
  const { error: upErr } = await supabase
    .from('com_devolucoes')
    .update({
      status: 'confirmada',
      confirmada_em: new Date().toISOString(),
      confirmada_usuario_id: me.id,
    })
    .eq('id', doc.id)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }
  revalidatePath('/cockpit/compras/devolucoes')
  revalidatePath(`/cockpit/compras/devolucoes/${doc.id}`)
  return { ok: true as const }
}

export async function cancelarDevolucao(id: string) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }
  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('com_devolucoes')
    .select('id, status')
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!doc) return { error: 'Devolução não encontrada.' }
  if (doc.status !== 'rascunho') return { error: 'Só um rascunho pode ser cancelado.' }
  const { error: upErr } = await supabase
    .from('com_devolucoes')
    .update({ status: 'cancelada', cancelada_em: new Date().toISOString() })
    .eq('id', doc.id)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }
  revalidatePath('/cockpit/compras/devolucoes')
  revalidatePath(`/cockpit/compras/devolucoes/${doc.id}`)
  return { ok: true as const }
}
