'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { codigoCasaItem, normalizarCodigoEtiqueta } from '@/lib/compras/codigo-etiqueta'
import { divergenciaQuantidade } from '@/lib/compras/divergencia'
import { espelharPedidoFunil } from '@/lib/compras/espelhar-funil'
import { processarLoteEntrada } from '@/lib/estoque/processar-entrada'
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
  const supabase = await createClient()
  const { data: config } = await supabase
    .from('com_config')
    .select('recebimento_importados, importados_limpeza')
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!config?.recebimento_importados) {
    return { error: 'O recebimento de importados está desligado.' as const, me: null }
  }
  return { error: null, me, supabase, limpeza: String(config.importados_limpeza || 'baixa_manual') }
}

export async function buscarPedidoImportado(codigo: string) {
  const acesso = await gate()
  if (acesso.error || !acesso.me) return { error: acesso.error || 'Sem permissão.' }
  const limpo = codigo.trim()
  if (!limpo) return { error: 'Informe o código da caixa.' }
  const { data } = await acesso.supabase
    .from('com_pedidos')
    .select('id, status')
    .eq('empresa_id', acesso.me.empresa_id)
    .eq('codigo_fornecedor', limpo)
    .maybeSingle()
  if (!data) return { error: 'Nenhum pedido importado com esse código de fornecedor.' }
  if (!['aprovado', 'recebido_parcial'].includes(data.status)) {
    return { error: 'Este pedido não está para conferência.' }
  }
  return { ok: true as const, pedidoId: data.id as string }
}

export async function confirmarItemImportado(input: {
  pedidoId: string
  codigoLido: string
  quantidade: number
  localId: string
  localTemporario: string
}) {
  const acesso = await gate()
  if (acesso.error || !acesso.me) return { error: acesso.error || 'Sem permissão.' }
  const { me, supabase, limpeza } = acesso
  const codigo = normalizarCodigoEtiqueta(input.codigoLido)
  if (!codigo) return { error: 'Não foi possível ler o número da etiqueta.' }
  const quantidade = Number(input.quantidade)
  if (!(quantidade > 0)) return { error: 'Informe a quantidade.' }

  const localId = input.localId.trim()
  const localTemporario = input.localTemporario.trim()
  if (localId && localTemporario) return { error: 'Escolha o local de estoque ou o local temporário.' }
  if (!localId && !localTemporario) {
    return { error: 'Indique o local de estoque ou o local temporário antes de confirmar.' }
  }

  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, status, codigo_fornecedor')
    .eq('id', input.pedidoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido) return { error: 'Pedido não encontrado.' }
  if (!['aprovado', 'recebido_parcial'].includes(pedido.status)) {
    return { error: 'Este pedido não está para conferência.' }
  }

  const { data: itens } = await supabase
    .from('com_pedido_itens')
    .select('id, descricao, quantidade, sku:cad_skus(codigo)')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me.empresa_id)
  const candidatos = (itens || []).filter((item) => {
    const sku = item.sku as { codigo?: string } | { codigo?: string }[] | null
    const codigoSku = Array.isArray(sku) ? sku[0]?.codigo : sku?.codigo
    return codigoCasaItem(codigo, item.descricao, codigoSku || null)
  })
  if (!candidatos.length) return { error: `O código ${codigo} não está neste pedido importado.` }
  if (candidatos.length > 1) return { error: 'Mais de uma linha do pedido corresponde a este código.' }
  const item = candidatos[0]

  const { data: anteriores } = await supabase
    .from('com_recebimento_itens')
    .select('quantidade')
    .eq('empresa_id', me.empresa_id)
    .eq('pedido_item_id', item.id)
  const ja = (anteriores || []).reduce((s, row) => s + Number(row.quantidade), 0)
  if (quantidade - (Number(item.quantidade) - ja) > 0.0001) {
    return { error: 'Quantidade passa do saldo deste item.' }
  }

  const { data: rec, error: recErr } = await supabase
    .from('com_recebimentos')
    .insert({
      empresa_id: me.empresa_id,
      pedido_id: pedido.id,
      usuario_id: me.id,
      observacao: 'Recebimento de importado',
    })
    .select('id')
    .single()
  if (recErr || !rec) return { error: recErr?.message || 'Não foi possível gravar a conferência.' }

  const { error: itemErr } = await supabase.from('com_recebimento_itens').insert({
    empresa_id: me.empresa_id,
    recebimento_id: rec.id,
    pedido_item_id: item.id,
    quantidade,
    divergencia_quantidade: divergenciaQuantidade(quantidade, Number(item.quantidade)),
    divergencia_preco: null,
  })
  if (itemErr) return { error: itemErr.message }

  const { error: leiErr } = await supabase.from('com_importado_leituras').insert({
    empresa_id: me.empresa_id,
    pedido_id: pedido.id,
    pedido_item_id: item.id,
    recebimento_id: rec.id,
    codigo_lido: input.codigoLido.trim(),
    codigo_normalizado: codigo,
    quantidade,
    local_id: localId || null,
    local_temporario: localTemporario || null,
    limpeza: localTemporario ? limpeza : null,
    usuario_id: me.id,
  })
  if (leiErr) return { error: leiErr.message }

  revalidatePath(`/cockpit/compras/importados/${pedido.id}`)
  revalidatePath(`/cockpit/compras/pedidos/${pedido.id}`)
  return {
    ok: true as const,
    codigo,
    descricao: item.descricao as string,
  }
}

export async function fecharRecebimentoImportado(pedidoId: string) {
  const acesso = await gate()
  if (acesso.error || !acesso.me) return { error: acesso.error || 'Sem permissão.' }
  const { me, supabase } = acesso

  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, status, codigo_fornecedor, fornecedor_id, numero')
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido) return { error: 'Pedido não encontrado.' }

  const { data: itens } = await supabase
    .from('com_pedido_itens')
    .select('id, quantidade, sku_id, unidade')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me.empresa_id)
  const pedidoQtd = new Map((itens || []).map((item) => [item.id, item]))

  let recebidos: Array<{ pedido_item_id: string; quantidade: number }> = []
  if (pedidoQtd.size > 0) {
    const { data } = await supabase
      .from('com_recebimento_itens')
      .select('pedido_item_id, quantidade')
      .eq('empresa_id', me.empresa_id)
      .in('pedido_item_id', [...pedidoQtd.keys()])
    recebidos = data || []
  }
  const ja = new Map<string, number>()
  for (const row of recebidos || []) {
    ja.set(row.pedido_item_id, (ja.get(row.pedido_item_id) || 0) + Number(row.quantidade))
  }
  let fechou = true
  let algum = false
  for (const [itemId, item] of pedidoQtd) {
    const recebido = ja.get(itemId) || 0
    if (recebido > 0) algum = true
    if (Number(item.quantidade) - recebido > 0.0001) fechou = false
  }
  if (!algum) return { error: 'Confirme ao menos um item antes de fechar.' }

  const { data: pendentes } = await supabase
    .from('com_importado_leituras')
    .select('id, pedido_item_id, quantidade, local_id, local_temporario')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me.empresa_id)
    .is('alocado_em', null)

  const porLocal = new Map<string, Array<{ id: string; pedido_item_id: string; quantidade: number }>>()
  let temporarios = 0
  for (const linha of pendentes || []) {
    if (linha.local_temporario) {
      temporarios += 1
      continue
    }
    if (!linha.local_id) continue
    const grupo = porLocal.get(linha.local_id) || []
    grupo.push(linha)
    porLocal.set(linha.local_id, grupo)
  }

  const entradas: string[] = []
  const avisos: string[] = []
  for (const [localId, linhas] of porLocal) {
    const itensEntrada = linhas
      .map((linha, index) => {
        const item = pedidoQtd.get(linha.pedido_item_id)
        if (!item?.sku_id) return null
        return {
          linha: index + 1,
          sku_id: item.sku_id as string,
          unidade_origem: item.unidade || 'UN',
          quantidade_origem: Number(linha.quantidade),
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
    if (!itensEntrada.length) {
      avisos.push('Há item conferido sem SKU de estoque. Ele não foi alocado.')
      continue
    }
    const resultado = await processarLoteEntrada(
      {
        empresa_id: me.empresa_id,
        origem: 'lote_tela',
        pessoa_id: pedido.fornecedor_id,
        local_id: localId,
        documento: pedido.codigo_fornecedor || pedido.numero,
        observacao: 'Recebimento de importados',
        usuario_id: me.id,
        itens: itensEntrada,
      },
      supabase,
    )
    if (!resultado.sucesso) return { error: resultado.mensagem }
    if (resultado.numero) entradas.push(resultado.numero)
    await supabase
      .from('com_importado_leituras')
      .update({ alocado_em: new Date().toISOString() })
      .eq('empresa_id', me.empresa_id)
      .in(
        'id',
        linhas.map((linha) => linha.id),
      )
  }

  if (temporarios) {
    avisos.push(
      `${temporarios} leitura(s) ficaram no local temporário e não entraram no estoque.`,
    )
  }

  const { error: upErr } = await supabase
    .from('com_pedidos')
    .update({ status: fechou ? 'recebido' : 'recebido_parcial' })
    .eq('id', pedido.id)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }
  await espelharPedidoFunil(supabase, pedido.id)

  revalidatePath(`/cockpit/compras/importados/${pedido.id}`)
  revalidatePath(`/cockpit/compras/pedidos/${pedido.id}`)
  revalidatePath('/cockpit/compras/pedidos')
  return { ok: true as const, entradas, avisos, fechou }
}
