'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { pedidoPodeNota } from '@/lib/compras/nota-status'
import { parseNfeXml } from '@/lib/estoque/parser-nfe-xml'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

async function gate(action: 'view' | 'create' | 'edit') {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Sessão sem empresa.' as const, me: null }
  const isSuper = me.role_global === 'superadmin'
  if (!isSuper && !(await empresaHasAddon(me.empresa_id, 'compras'))) {
    return { error: 'Addon Compras não está ativo nesta empresa.' as const, me: null }
  }
  if (!isSuper && !hasPermission(me, 'compras_notas', action)) {
    return { error: 'Sem permissão para esta ação.' as const, me: null }
  }
  return { error: null, me }
}

function digitos(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '')
}

export type ItemNotaInput = {
  pedido_item_id: string | null
  sku_id: string | null
  descricao: string
  quantidade: number
  unidade: string
  preco_unitario: number
}

export async function lerXmlNota(xml: string) {
  const { error } = await gate('create')
  if (error) return { error }
  const parsed = parseNfeXml(xml)
  if (!parsed.sucesso) return { error: parsed.erro || 'XML inválido.' }
  const documento = digitos(parsed.emitente?.cnpj || parsed.emitente?.cpf || parsed.fornecedorCnpj)
  return {
    ok: true as const,
    numero: parsed.numeroNfe || '',
    serie: parsed.serie || '1',
    chave: digitos(parsed.chaveNfe),
    data_emissao: parsed.emissaoEm || '',
    emitente_documento: documento,
    emitente_nome: parsed.emitente?.nome || parsed.fornecedorNome || '',
  }
}

export async function lancarNota(input: {
  pedido_id: string
  numero: string
  serie: string
  chave: string
  data_emissao: string
  observacao: string
  origem: 'manual' | 'xml'
  emitente_documento: string
  confirmar: boolean
  itens: ItemNotaInput[]
}) {
  const { error, me } = await gate('create')
  if (error || !me) return { error: error || 'Sem permissão.' }
  if (input.confirmar) {
    const confirmacao = await gate('edit')
    if (confirmacao.error || !confirmacao.me) {
      return { error: confirmacao.error || 'Sem permissão para confirmar a nota.' }
    }
  }

  const numero = input.numero.trim()
  const serie = (input.serie.trim() || '1').slice(0, 10)
  const chave = digitos(input.chave)
  if (!numero) return { error: 'Informe o número da nota.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data_emissao)) return { error: 'Informe a data de emissão.' }
  if (chave && chave.length !== 44) return { error: 'A chave de acesso precisa ter 44 dígitos.' }
  const itens = input.itens.filter((i) => i.descricao.trim() && i.quantidade > 0)
  if (!itens.length) return { error: 'A nota precisa de ao menos um item.' }

  const supabase = await createClient()
  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, status, fornecedor_id, fornecedor:crm_leads!fornecedor_id(documento)')
    .eq('id', input.pedido_id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido) return { error: 'Pedido não encontrado.' }
  if (!pedidoPodeNota(pedido.status)) {
    return { error: 'Só é possível lançar nota de pedido aprovado ou já em recebimento.' }
  }
  if (!pedido.fornecedor_id) return { error: 'O pedido não tem fornecedor.' }

  const emitente = digitos(input.emitente_documento)
  if (input.origem === 'xml') {
    const lead = pedido.fornecedor as { documento?: string } | { documento?: string }[] | null
    const docPedido = digitos(Array.isArray(lead) ? lead[0]?.documento : lead?.documento)
    if (!emitente || !docPedido || emitente !== docPedido) {
      return { error: 'O CNPJ do XML não é o mesmo do fornecedor do pedido.' }
    }
  }

  const valor = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const agora = new Date().toISOString()
  const { data: nota, error: notaErr } = await supabase
    .from('com_notas')
    .insert({
      empresa_id: me.empresa_id,
      pedido_id: pedido.id,
      fornecedor_id: pedido.fornecedor_id,
      numero,
      serie,
      chave: chave || null,
      data_emissao: input.data_emissao,
      valor_total: valor,
      status: input.confirmar ? 'confirmada' : 'rascunho',
      origem: input.origem,
      emitente_documento: emitente || null,
      observacao: input.observacao.trim() || null,
      criador_usuario_id: me.id,
      confirmada_em: input.confirmar ? agora : null,
      confirmada_usuario_id: input.confirmar ? me.id : null,
    })
    .select('id')
    .single()
  if (notaErr || !nota) return { error: notaErr?.message || 'Falha ao gravar a nota.' }

  const { error: itemErr } = await supabase.from('com_nota_itens').insert(
    itens.map((i) => ({
      empresa_id: me.empresa_id,
      nota_id: nota.id,
      pedido_item_id: i.pedido_item_id,
      sku_id: i.sku_id,
      descricao: i.descricao.trim(),
      quantidade: i.quantidade,
      unidade: i.unidade || 'UN',
      preco_unitario: i.preco_unitario,
    })),
  )
  if (itemErr) return { error: itemErr.message }

  revalidatePath('/cockpit/compras/notas')
  revalidatePath(`/cockpit/compras/pedidos/${pedido.id}`)
  return { ok: true as const, id: nota.id as string }
}

export async function confirmarNota(notaId: string) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }
  const supabase = await createClient()
  const { data: nota } = await supabase
    .from('com_notas')
    .select('id, status')
    .eq('id', notaId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!nota) return { error: 'Nota não encontrada.' }
  if (nota.status !== 'rascunho') return { error: 'Só um rascunho pode ser confirmado.' }
  const { error: upErr } = await supabase
    .from('com_notas')
    .update({
      status: 'confirmada',
      confirmada_em: new Date().toISOString(),
      confirmada_usuario_id: me.id,
    })
    .eq('id', nota.id)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }
  revalidatePath('/cockpit/compras/notas')
  revalidatePath(`/cockpit/compras/notas/${nota.id}`)
  return { ok: true as const }
}

export async function cancelarNota(notaId: string) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }
  const supabase = await createClient()
  const { data: nota } = await supabase
    .from('com_notas')
    .select('id, status')
    .eq('id', notaId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!nota) return { error: 'Nota não encontrada.' }
  if (nota.status !== 'rascunho') return { error: 'Só um rascunho pode ser cancelado.' }
  const { error: upErr } = await supabase
    .from('com_notas')
    .update({ status: 'cancelada', cancelada_em: new Date().toISOString() })
    .eq('id', nota.id)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }
  revalidatePath('/cockpit/compras/notas')
  revalidatePath(`/cockpit/compras/notas/${nota.id}`)
  return { ok: true as const }
}
