'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { pedidoPodeNota } from '@/lib/compras/nota-status'
import { parseNfeXml } from '@/lib/estoque/parser-nfe-xml'
import { processarLoteEntrada } from '@/lib/estoque/processar-entrada'
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
  preco_pedido?: number | null
  cfop?: string | null
  centro_custo?: string | null
  n_serie?: string | null
  impostos?: Record<string, number> | null
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
    frete: parsed.frete || 0,
    impostos: parsed.impostos || null,
    itens: parsed.itens.map((item) => ({
      descricao: item.descricao_parceiro,
      quantidade: item.quantidade_origem,
      unidade: item.unidade_origem,
      preco: item.valor_unitario,
      cfop: item.cfop || '',
      n_serie: item.n_serie || '',
      impostos: item.impostos || null,
    })),
  }
}

export async function lancarNota(input: {
  pedido_id: string
  numero: string
  serie: string
  chave: string
  data_emissao: string
  vencimento: string
  frete: number
  impostos: Record<string, number> | null
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

  const frete = Number.isFinite(input.frete) && input.frete > 0 ? input.frete : 0
  const vencimento = /^\d{4}-\d{2}-\d{2}$/.test(input.vencimento) ? input.vencimento : null
  const valor = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
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
      vencimento,
      frete,
      impostos: input.impostos,
      valor_total: valor,
      status: 'rascunho',
      origem: input.origem,
      emitente_documento: emitente || null,
      observacao: input.observacao.trim() || null,
      criador_usuario_id: me.id,
    })
    .select('id')
    .single()
  if (notaErr || !nota) return { error: notaErr?.message || 'Falha ao gravar a nota.' }

  const { error: itemErr } = await supabase.from('com_nota_itens').insert(
    itens.map((i) => {
      const precoPedido = i.preco_pedido == null ? null : Number(i.preco_pedido)
      return {
        empresa_id: me.empresa_id,
        nota_id: nota.id,
        pedido_item_id: i.pedido_item_id,
        sku_id: i.sku_id,
        descricao: i.descricao.trim(),
        quantidade: i.quantidade,
        unidade: i.unidade || 'UN',
        preco_unitario: i.preco_unitario,
        preco_pedido: precoPedido,
        aviso_preco:
          precoPedido != null && Math.abs(precoPedido - i.preco_unitario) > 0.005,
        cfop: i.cfop?.trim() || null,
        centro_custo: i.centro_custo?.trim() || null,
        n_serie: i.n_serie?.trim() || null,
        impostos: i.impostos || null,
      }
    }),
  )
  if (itemErr) return { error: itemErr.message }

  if (input.confirmar) {
    const confirmada = await confirmarNota(nota.id)
    if (confirmada.error) return { error: confirmada.error, id: nota.id as string }
  }

  revalidatePath('/cockpit/compras/notas')
  revalidatePath(`/cockpit/compras/pedidos/${pedido.id}`)
  return { ok: true as const, id: nota.id as string }
}

async function gerarEntradaDaNota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: string,
  usuarioId: string,
  notaId: string,
) {
  const { data: nota } = await supabase
    .from('com_notas')
    .select('id, numero, serie, chave, frete, origem, fornecedor_id, pedido:com_pedidos!pedido_id(tipo)')
    .eq('id', notaId)
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (!nota) return { error: 'Nota não encontrada.' }

  const pedido = nota.pedido as { tipo?: string } | { tipo?: string }[] | null
  const tipo = Array.isArray(pedido) ? pedido[0]?.tipo : pedido?.tipo
  if (tipo !== 'produtivo') return { error: null as string | null }

  const { data: itens } = await supabase
    .from('com_nota_itens')
    .select('id, sku_id, quantidade, unidade, preco_unitario, n_serie')
    .eq('nota_id', nota.id)
    .eq('empresa_id', empresaId)
  const linhas = (itens || []).filter((item) => item.sku_id && Number(item.quantidade) > 0)
  if (!linhas.length) return { error: null as string | null }

  const { data: skus } = await supabase
    .from('cad_skus')
    .select('id, controla_estoque')
    .eq('empresa_id', empresaId)
    .in(
      'id',
      linhas.map((item) => item.sku_id as string),
    )
  const entra = new Set(
    (skus || []).filter((sku) => sku.controla_estoque !== false).map((sku) => sku.id as string),
  )
  const fisicos = linhas.filter((item) => entra.has(item.sku_id as string))
  if (!fisicos.length) return { error: null as string | null }

  const { data: config } = await supabase
    .from('com_config')
    .select('local_entrada_id')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (!config?.local_entrada_id) {
    return { error: 'Defina o local padrão da entrada em Compras > Configuração.' }
  }

  const base = fisicos.reduce(
    (soma, item) => soma + Number(item.quantidade) * Number(item.preco_unitario),
    0,
  )
  const frete = Number(nota.frete || 0)
  for (const item of fisicos) {
    const valorItem = Number(item.quantidade) * Number(item.preco_unitario)
    const rateado = base > 0 ? (frete * valorItem) / base : 0
    const custo = Number(item.quantidade) > 0 ? (valorItem + rateado) / Number(item.quantidade) : 0
    const { data: rateadoRow, error: rateioErr } = await supabase
      .from('com_nota_itens')
      .update({ frete_rateado: rateado })
      .eq('id', item.id)
      .eq('empresa_id', empresaId)
      .select('id')
      .maybeSingle()
    if (rateioErr) return { error: rateioErr.message }
    if (!rateadoRow) return { error: 'Não foi possível gravar o frete rateado da nota.' }
    const { error: custoErr } = await supabase.from('com_sku_custo_ultima').upsert(
      {
        empresa_id: empresaId,
        sku_id: item.sku_id,
        nota_id: nota.id,
        valor: custo,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'empresa_id,sku_id' },
    )
    if (custoErr) return { error: custoErr.message }
  }

  const resultado = await processarLoteEntrada(
    {
      empresa_id: empresaId,
      origem: nota.origem === 'xml' ? 'nfe_xml' : 'lote_tela',
      pessoa_id: nota.fornecedor_id,
      local_id: config.local_entrada_id,
      documento: `${nota.numero}/${nota.serie}`,
      nfe_chave: nota.chave,
      observacao: 'Entrada gerada pela confirmação da nota de compra.',
      usuario_id: usuarioId,
      itens: fisicos.map((item, index) => ({
        linha: index + 1,
        sku_id: item.sku_id as string,
        unidade_origem: item.unidade || 'UN',
        quantidade_origem: Number(item.quantidade),
        numero_serie: item.n_serie || null,
      })),
    },
    supabase,
  )
  if (!resultado.sucesso) return { error: resultado.mensagem || 'Falha ao gerar a entrada.' }
  return { error: null as string | null }
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

  const entrada = await gerarEntradaDaNota(supabase, me.empresa_id, me.id, nota.id)
  if (entrada.error) return { error: entrada.error }

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

  const { error: preErr } = await supabase.rpc('com_gravar_pre_titulo', { p_nota_id: nota.id })
  revalidatePath('/cockpit/compras/notas')
  revalidatePath(`/cockpit/compras/notas/${nota.id}`)
  revalidatePath('/cockpit/compras/pre-titulos')
  return {
    ok: true as const,
    aviso: preErr
      ? 'A nota foi confirmada. O pré-título não entrou agora; use Trazer notas confirmadas em Pré-títulos.'
      : null,
  }
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
