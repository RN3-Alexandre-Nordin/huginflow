'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { gerarNumeroCotacao, gerarNumeroPedido } from '@/lib/compras/numeros'
import { niveisExigidos, type ComConfig, type TipoCompra } from '@/lib/compras/tipos'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

async function gate(action: 'view' | 'create' | 'edit' | 'delete') {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Sessão sem empresa.' as const, me: null }
  const isSuper = me.role_global === 'superadmin'
  if (!isSuper && !(await empresaHasAddon(me.empresa_id, 'compras'))) {
    return { error: 'Addon Compras não está ativo.' as const, me: null }
  }
  if (!isSuper && !hasPermission(me, 'compras_cotacoes', action)) {
    return { error: 'Sem permissão para cotações.' as const, me: null }
  }
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

/** Abre cotação a partir de solicitação registrada (copia itens). */
export async function criarCotacaoDeSolicitacao(solicitacaoId: string) {
  const { error, me } = await gate('create')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const supabase = await createClient()
  const { data: sol } = await supabase
    .from('com_solicitacoes')
    .select('id, tipo, status, observacao')
    .eq('id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!sol) return { error: 'Solicitação não encontrada.' }
  if (sol.status === 'atendida') {
    return { error: 'Solicitação já atendida (gerou pedido).' }
  }
  if (sol.status !== 'registrada') return { error: 'Só solicitações em aberto entram em cotação.' }

  const { data: aberta } = await supabase
    .from('com_cotacoes')
    .select('id')
    .eq('empresa_id', me.empresa_id)
    .eq('solicitacao_id', solicitacaoId)
    .in('status', ['rascunho', 'em_cotacao'])
    .maybeSingle()
  if (aberta) return { ok: true as const, id: aberta.id as string }

  const { data: itensSol } = await supabase
    .from('com_solicitacao_itens')
    .select('sku_id, servico_id, descricao, quantidade, unidade')
    .eq('solicitacao_id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)
  if (!itensSol?.length) return { error: 'Solicitação sem itens.' }

  const numero = await gerarNumeroCotacao(me.empresa_id, supabase)
  const { data: cot, error: cotErr } = await supabase
    .from('com_cotacoes')
    .insert({
      empresa_id: me.empresa_id,
      numero,
      solicitacao_id: solicitacaoId,
      tipo: sol.tipo as TipoCompra,
      status: 'rascunho',
      observacao: sol.observacao,
      criador_usuario_id: me.id,
    })
    .select('id, numero')
    .single()
  if (cotErr || !cot) return { error: cotErr?.message || 'Falha ao criar cotação.' }

  const { error: itemErr } = await supabase.from('com_cotacao_itens').insert(
    itensSol.map((i) => ({
      empresa_id: me.empresa_id,
      cotacao_id: cot.id,
      sku_id: i.sku_id,
      servico_id: i.servico_id,
      descricao: i.descricao,
      quantidade: i.quantidade,
      unidade: i.unidade || 'UN',
    })),
  )
  if (itemErr) return { error: itemErr.message }

  revalidatePath('/cockpit/compras/cotacoes')
  return { ok: true as const, id: cot.id as string, numero: cot.numero as string }
}

export async function salvarFornecedoresCotacao(formData: FormData) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const cotacaoId = String(formData.get('cotacao_id') || '')
  if (!cotacaoId) return { error: 'Cotação inválida.' }

  let fornecedores: Array<{
    fornecedor_id: string
    prazo_texto?: string
    condicao_texto?: string
  }> = []
  try {
    fornecedores = JSON.parse(String(formData.get('fornecedores_json') || '[]'))
  } catch {
    return { error: 'Fornecedores inválidos.' }
  }
  if (!fornecedores.length || fornecedores.length > 3) {
    return { error: 'Informe de 1 a 3 fornecedores.' }
  }
  const ids = fornecedores.map((f) => f.fornecedor_id)
  if (new Set(ids).size !== ids.length) return { error: 'Fornecedores duplicados.' }

  const supabase = await createClient()
  const { data: cot } = await supabase
    .from('com_cotacoes')
    .select('id, status')
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!cot) return { error: 'Cotação não encontrada.' }
  if (cot.status === 'confirmada' || cot.status === 'cancelada') {
    return { error: 'Cotação já encerrada.' }
  }

  for (const f of fornecedores) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('id', f.fornecedor_id)
      .eq('empresa_id', me.empresa_id)
      .contains('papeis', ['fornecedor'])
      .maybeSingle()
    if (!lead) return { error: 'Fornecedor inválido.' }
  }

  const { data: atuais } = await supabase
    .from('com_cotacao_fornecedores')
    .select('fornecedor_id')
    .eq('cotacao_id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
  const manter = new Set(ids)
  const removidos = (atuais || [])
    .map((a) => a.fornecedor_id)
    .filter((fid) => !manter.has(fid))

  await supabase
    .from('com_cotacao_fornecedores')
    .delete()
    .eq('cotacao_id', cotacaoId)
    .eq('empresa_id', me.empresa_id)

  if (removidos.length) {
    await supabase
      .from('com_cotacao_propostas')
      .delete()
      .eq('cotacao_id', cotacaoId)
      .eq('empresa_id', me.empresa_id)
      .in('fornecedor_id', removidos)
  }

  const { error: insErr } = await supabase.from('com_cotacao_fornecedores').insert(
    fornecedores.map((f, i) => ({
      empresa_id: me.empresa_id,
      cotacao_id: cotacaoId,
      fornecedor_id: f.fornecedor_id,
      prazo_texto: f.prazo_texto?.trim() || null,
      condicao_texto: f.condicao_texto?.trim() || null,
      ordem: i + 1,
    })),
  )
  if (insErr) return { error: insErr.message }

  await supabase
    .from('com_cotacoes')
    .update({ status: 'em_cotacao' })
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)

  revalidatePath(`/cockpit/compras/cotacoes/${cotacaoId}`)
  return { ok: true }
}

/** Inclui um fornecedor (máx. 3) sem apagar propostas dos demais. */
export async function adicionarFornecedorCotacao(formData: FormData) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const cotacaoId = String(formData.get('cotacao_id') || '')
  const fornecedorId = String(formData.get('fornecedor_id') || '')
  const prazo = String(formData.get('prazo_texto') || '').trim() || null
  const condicao = String(formData.get('condicao_texto') || '').trim() || null
  if (!cotacaoId || !fornecedorId) return { error: 'Dados inválidos.' }

  const supabase = await createClient()
  const { data: cot } = await supabase
    .from('com_cotacoes')
    .select('id, status')
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!cot) return { error: 'Cotação não encontrada.' }
  if (cot.status === 'confirmada' || cot.status === 'cancelada') {
    return { error: 'Cotação já encerrada.' }
  }

  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('id', fornecedorId)
    .eq('empresa_id', me.empresa_id)
    .contains('papeis', ['fornecedor'])
    .maybeSingle()
  if (!lead) return { error: 'Fornecedor inválido.' }

  const { data: atuais } = await supabase
    .from('com_cotacao_fornecedores')
    .select('fornecedor_id, ordem')
    .eq('cotacao_id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
  if ((atuais || []).length >= 3) return { error: 'Máximo de 3 fornecedores.' }
  if ((atuais || []).some((a) => a.fornecedor_id === fornecedorId)) {
    return { error: 'Fornecedor já incluído.' }
  }

  const proxOrdem = Math.max(0, ...(atuais || []).map((a) => a.ordem || 0)) + 1
  const { error: insErr } = await supabase.from('com_cotacao_fornecedores').insert({
    empresa_id: me.empresa_id,
    cotacao_id: cotacaoId,
    fornecedor_id: fornecedorId,
    prazo_texto: prazo,
    condicao_texto: condicao,
    ordem: proxOrdem,
  })
  if (insErr) {
    if (insErr.code === '23505' || /unique|duplicate/i.test(insErr.message)) {
      return { error: 'Fornecedor já incluído.' }
    }
    return { error: insErr.message }
  }

  await supabase
    .from('com_cotacoes')
    .update({ status: 'em_cotacao' })
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)

  revalidatePath(`/cockpit/compras/cotacoes/${cotacaoId}`)
  return { ok: true, fornecedor_id: fornecedorId }
}

export async function removerFornecedorCotacao(cotacaoId: string, fornecedorId: string) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }
  if (!cotacaoId || !fornecedorId) return { error: 'Dados inválidos.' }

  const supabase = await createClient()
  const { data: cot } = await supabase
    .from('com_cotacoes')
    .select('id, status')
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!cot) return { error: 'Cotação não encontrada.' }
  if (cot.status === 'confirmada' || cot.status === 'cancelada') {
    return { error: 'Cotação já encerrada.' }
  }

  await supabase
    .from('com_cotacao_propostas')
    .delete()
    .eq('cotacao_id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
    .eq('fornecedor_id', fornecedorId)

  const { error: delErr } = await supabase
    .from('com_cotacao_fornecedores')
    .delete()
    .eq('cotacao_id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
    .eq('fornecedor_id', fornecedorId)
  if (delErr) return { error: delErr.message }

  revalidatePath(`/cockpit/compras/cotacoes/${cotacaoId}`)
  return { ok: true }
}

/**
 * Salva propostas. Com `fornecedor_id` no form: substitui só as desse fornecedor
 * (merge — não apaga preços dos outros). Sem escopo: upsert das linhas enviadas.
 */
export async function salvarPropostasCotacao(formData: FormData) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const cotacaoId = String(formData.get('cotacao_id') || '')
  const fornecedorScope = String(formData.get('fornecedor_id') || '').trim()
  let propostas: Array<{
    cotacao_item_id: string
    fornecedor_id: string
    preco_unitario: number | null
  }> = []
  try {
    propostas = JSON.parse(String(formData.get('propostas_json') || '[]'))
  } catch {
    return { error: 'Propostas inválidas.' }
  }
  if (!cotacaoId) return { error: 'Cotação inválida.' }

  const supabase = await createClient()
  const { data: cot } = await supabase
    .from('com_cotacoes')
    .select('id, status')
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!cot || cot.status === 'confirmada' || cot.status === 'cancelada') {
    return { error: 'Cotação indisponível para edição.' }
  }

  if (fornecedorScope) {
    const { data: vinculo } = await supabase
      .from('com_cotacao_fornecedores')
      .select('fornecedor_id')
      .eq('cotacao_id', cotacaoId)
      .eq('empresa_id', me.empresa_id)
      .eq('fornecedor_id', fornecedorScope)
      .maybeSingle()
    if (!vinculo) return { error: 'Fornecedor não está nesta cotação.' }

    await supabase
      .from('com_cotacao_propostas')
      .delete()
      .eq('cotacao_id', cotacaoId)
      .eq('empresa_id', me.empresa_id)
      .eq('fornecedor_id', fornecedorScope)

    const rows = propostas
      .filter((p) => p.fornecedor_id === fornecedorScope)
      .filter((p) => p.preco_unitario != null && Number.isFinite(Number(p.preco_unitario)))
      .map((p) => ({
        empresa_id: me.empresa_id,
        cotacao_id: cotacaoId,
        cotacao_item_id: p.cotacao_item_id,
        fornecedor_id: fornecedorScope,
        preco_unitario: Number(p.preco_unitario),
      }))

    if (rows.length) {
      const { error: insErr } = await supabase.from('com_cotacao_propostas').insert(rows)
      if (insErr) return { error: insErr.message }
    }
  } else {
    if (!propostas.length) return { error: 'Informe os preços.' }
    for (const p of propostas) {
      const preco = Number(p.preco_unitario)
      if (!Number.isFinite(preco) || preco < 0) continue
      const { error: upErr } = await supabase.from('com_cotacao_propostas').upsert(
        {
          empresa_id: me.empresa_id,
          cotacao_id: cotacaoId,
          cotacao_item_id: p.cotacao_item_id,
          fornecedor_id: p.fornecedor_id,
          preco_unitario: preco,
        },
        { onConflict: 'cotacao_item_id,fornecedor_id' },
      )
      if (upErr) return { error: upErr.message }
    }
  }

  revalidatePath(`/cockpit/compras/cotacoes/${cotacaoId}`)
  revalidatePath(`/cockpit/compras/cotacoes/${cotacaoId}/proposta/${fornecedorScope}`)
  revalidatePath(`/cockpit/compras/cotacoes/${cotacaoId}/vencedor`)
  return { ok: true }
}

/** Confirma vencedores e gera um pedido por fornecedor com itens ganhos. */
export async function confirmarCotacao(formData: FormData) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const cotacaoId = String(formData.get('cotacao_id') || '')
  let vencedores: Record<string, string> = {}
  try {
    vencedores = JSON.parse(String(formData.get('vencedores_json') || '{}'))
  } catch {
    return { error: 'Vencedores inválidos.' }
  }
  if (!cotacaoId) return { error: 'Cotação inválida.' }

  const supabase = await createClient()
  const { data: cot } = await supabase
    .from('com_cotacoes')
    .select('id, status, tipo, numero, solicitacao_id, observacao')
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!cot) return { error: 'Cotação não encontrada.' }
  if (cot.status === 'confirmada') return { error: 'Cotação já confirmada.' }

  const { data: itens } = await supabase
    .from('com_cotacao_itens')
    .select('id, sku_id, servico_id, descricao, quantidade, unidade')
    .eq('cotacao_id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
  if (!itens?.length) return { error: 'Cotação sem itens.' }

  for (const item of itens) {
    if (!vencedores[item.id]) return { error: `Defina o vencedor do item: ${item.descricao}` }
  }

  const { data: propostas } = await supabase
    .from('com_cotacao_propostas')
    .select('cotacao_item_id, fornecedor_id, preco_unitario')
    .eq('cotacao_id', cotacaoId)
    .eq('empresa_id', me.empresa_id)

  const precoMap = new Map<string, number>()
  for (const p of propostas || []) {
    precoMap.set(`${p.cotacao_item_id}:${p.fornecedor_id}`, Number(p.preco_unitario))
  }

  for (const item of itens) {
    const fid = vencedores[item.id]
    if (!precoMap.has(`${item.id}:${fid}`)) {
      return { error: `Falta preço do vencedor em: ${item.descricao}` }
    }
    await supabase
      .from('com_cotacao_itens')
      .update({ vencedor_fornecedor_id: fid })
      .eq('id', item.id)
      .eq('empresa_id', me.empresa_id)
  }

  const porFornecedor = new Map<string, typeof itens>()
  for (const item of itens) {
    const fid = vencedores[item.id]
    const list = porFornecedor.get(fid) || []
    list.push(item)
    porFornecedor.set(fid, list)
  }

  const config = await lerConfig(supabase, me.empresa_id)
  const pedidosCriados: string[] = []
  let observacaoPedido = (cot.observacao as string | null)?.trim() || null
  if (cot.solicitacao_id) {
    const { data: sol } = await supabase
      .from('com_solicitacoes')
      .select('observacao')
      .eq('id', cot.solicitacao_id)
      .eq('empresa_id', me.empresa_id)
      .maybeSingle()
    if (sol?.observacao?.trim()) observacaoPedido = sol.observacao.trim()
  }

  for (const [fornecedorId, itensForn] of porFornecedor) {
    const valor = itensForn.reduce((s, it) => {
      const preco = precoMap.get(`${it.id}:${fornecedorId}`) || 0
      return s + Number(it.quantidade) * preco
    }, 0)
    const exigidos = niveisExigidos(config, valor)
    const status = exigidos === 0 ? 'aprovado' : 'aguardando_aprovacao'
    const numero = await gerarNumeroPedido(me.empresa_id, supabase)

    const { data: pedido, error: pedErr } = await supabase
      .from('com_pedidos')
      .insert({
        empresa_id: me.empresa_id,
        numero,
        fornecedor_id: fornecedorId,
        tipo: cot.tipo as TipoCompra,
        status,
        valor_total: valor,
        origem: 'cotacao',
        cotacao_id: cotacaoId,
        observacao: observacaoPedido,
        criador_usuario_id: me.id,
      })
      .select('id')
      .single()
    if (pedErr || !pedido) return { error: pedErr?.message || 'Falha ao gerar pedido.' }

    const { error: itemErr } = await supabase.from('com_pedido_itens').insert(
      itensForn.map((it) => ({
        empresa_id: me.empresa_id,
        pedido_id: pedido.id,
        sku_id: it.sku_id,
        servico_id: it.servico_id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        unidade: it.unidade || 'UN',
        preco_unitario: precoMap.get(`${it.id}:${fornecedorId}`) || 0,
      })),
    )
    if (itemErr) return { error: itemErr.message }
    pedidosCriados.push(pedido.id)
  }

  await supabase
    .from('com_cotacoes')
    .update({ status: 'confirmada', confirmada_em: new Date().toISOString() })
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)

  if (cot.solicitacao_id) {
    await supabase
      .from('com_solicitacoes')
      .update({ status: 'atendida' })
      .eq('id', cot.solicitacao_id)
      .eq('empresa_id', me.empresa_id)
      .eq('status', 'registrada')
  }

  revalidatePath('/cockpit/compras/cotacoes')
  revalidatePath('/cockpit/compras/pedidos')
  revalidatePath('/cockpit/compras/solicitacoes')
  return { ok: true, pedidos: pedidosCriados }
}

/** Exclui cotação não confirmada (sem pedidos gerados). */
export async function excluirCotacao(cotacaoId: string) {
  const { error, me } = await gate('delete')
  if (error || !me) return { error: error || 'Sem permissão.' }
  if (!cotacaoId) return { error: 'Cotação inválida.' }

  const supabase = await createClient()
  const { data: cot } = await supabase
    .from('com_cotacoes')
    .select('id, status, numero')
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!cot) return { error: 'Cotação não encontrada.' }
  if (cot.status === 'confirmada') {
    return { error: 'Cotação confirmada (já gerou pedidos) não pode ser excluída.' }
  }

  const { count } = await supabase
    .from('com_pedidos')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', me.empresa_id)
    .eq('cotacao_id', cotacaoId)
  if ((count || 0) > 0) {
    return { error: 'Há pedidos vinculados a esta cotação.' }
  }

  const { error: delErr } = await supabase
    .from('com_cotacoes')
    .delete()
    .eq('id', cotacaoId)
    .eq('empresa_id', me.empresa_id)
  if (delErr) return { error: delErr.message }

  revalidatePath('/cockpit/compras/cotacoes')
  return { ok: true }
}
