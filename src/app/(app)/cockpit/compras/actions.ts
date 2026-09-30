'use server'

import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { gerarNumeroPedido, gerarNumeroSolicitacao } from '@/lib/compras/numeros'
import { niveisExigidos, tipoCompraValido, type ComConfig, type TipoCompra } from '@/lib/compras/tipos'
import { parsePedidoCsv, type LinhaPedidoPlanilha } from '@/lib/compras/planilha-pedido'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

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

function agrupar(linhas: LinhaPedidoPlanilha[]) {
  const map = new Map<string, LinhaPedidoPlanilha[]>()
  for (const linha of linhas) {
    const key = linha.numero.trim()
    const atual = map.get(key) || []
    atual.push(linha)
    map.set(key, atual)
  }
  return map
}

export async function abrirRascunhoSolicitacao() {
  const { error, me } = await gate('compras_solicitacoes', 'create')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const supabase = await createClient()
  const numero = await gerarNumeroSolicitacao(me.empresa_id, supabase)
  const { data: sol, error: insErr } = await supabase
    .from('com_solicitacoes')
    .insert({
      empresa_id: me.empresa_id,
      numero,
      solicitante_usuario_id: me.id,
      tipo: 'produtivo',
      status: 'rascunho',
    })
    .select('id, numero')
    .single()
  if (insErr || !sol) return { error: insErr?.message || 'Não foi possível abrir a solicitação.' }
  return { ok: true as const, id: sol.id as string, numero: sol.numero as string }
}

export async function registrarSolicitacao(formData: FormData) {
  const { error, me } = await gate('compras_solicitacoes', 'create')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const solicitacaoId = String(formData.get('solicitacao_id') || '').trim()
  const tipoRaw = String(formData.get('tipo') || '')
  const dataNecessidade = String(formData.get('data_necessidade') || '') || null
  const observacao = String(formData.get('observacao') || '').trim() || null
  const solicitantePessoaId = String(formData.get('solicitante_pessoa_id') || '').trim()
  if (!solicitacaoId) return { error: 'Solicitação sem número associado. Recarregue a página.' }
  if (!tipoCompraValido(tipoRaw)) return { error: 'Tipo de compra inválido.' }
  if (!solicitantePessoaId) return { error: 'Selecione o solicitante.' }

  const ehServico = tipoRaw === 'servico'
  let itens: Array<{
    descricao: string
    quantidade: number
    unidade: string
    sku_id?: string
    servico_id?: string
  }> = []
  try {
    itens = JSON.parse(String(formData.get('itens_json') || '[]'))
  } catch {
    return { error: 'Itens inválidos.' }
  }
  if (!itens.length) return { error: 'Inclua ao menos um item.' }
  if (ehServico && itens.some((i) => !i.servico_id)) {
    return { error: 'Em compra de serviço, selecione o serviço do cadastro em cada item.' }
  }
  if (!ehServico && itens.some((i) => !i.sku_id && !i.descricao?.trim())) {
    return { error: 'Inclua SKU ou descrição em cada item.' }
  }

  const supabase = await createClient()
  const { data: sol } = await supabase
    .from('com_solicitacoes')
    .select('id, numero, status')
    .eq('id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!sol) return { error: 'Solicitação não encontrada.' }
  if (sol.status !== 'rascunho') return { error: 'Esta solicitação já foi registrada.' }

  const { data: pessoa } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', me.empresa_id)
    .eq('id', solicitantePessoaId)
    .contains('papeis', ['funcionario'])
    .maybeSingle()
  if (!pessoa) return { error: 'Solicitante não encontrado em Pessoas (papel Funcionário).' }

  const skuIds = [...new Set(itens.map((i) => i.sku_id).filter(Boolean))] as string[]
  const servicoIds = [...new Set(itens.map((i) => i.servico_id).filter(Boolean))] as string[]
  const skuMap = new Map<string, { id: string; nome: string }>()
  const servicoMap = new Map<string, { id: string; nome: string; codigo: string }>()

  if (!ehServico && skuIds.length) {
    const { data: skus } = await supabase
      .from('cad_skus')
      .select('id, nome')
      .eq('empresa_id', me.empresa_id)
      .in('id', skuIds)
    for (const sku of skus || []) skuMap.set(sku.id, { id: sku.id, nome: sku.nome })
  }
  if (ehServico && servicoIds.length) {
    const { data: servicos } = await supabase
      .from('cad_servicos')
      .select('id, nome, codigo')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .in('id', servicoIds)
    for (const s of servicos || []) servicoMap.set(s.id, { id: s.id, nome: s.nome, codigo: s.codigo })
  }
  if (ehServico && itens.some((i) => !i.servico_id || !servicoMap.has(i.servico_id))) {
    return { error: 'Serviço inválido ou inativo. Selecione um serviço ativo do cadastro.' }
  }

  const { data: updated, error: upErr } = await supabase
    .from('com_solicitacoes')
    .update({
      solicitante_pessoa_id: solicitantePessoaId,
      data_necessidade: dataNecessidade,
      tipo: tipoRaw as TipoCompra,
      observacao,
      status: 'registrada',
    })
    .eq('id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)
    .eq('status', 'rascunho')
    .select('id')
    .maybeSingle()
  if (upErr) return { error: upErr.message }
  if (!updated) {
    return {
      error:
        'Não foi possível registrar a solicitação (sem permissão de atualização ou já registrada).',
    }
  }

  await supabase
    .from('com_solicitacao_itens')
    .delete()
    .eq('solicitacao_id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)

  const rows = itens.map((item) => {
    const sku = item.sku_id ? skuMap.get(item.sku_id) : null
    const servico = item.servico_id ? servicoMap.get(item.servico_id) : null
    return {
      empresa_id: me.empresa_id,
      solicitacao_id: solicitacaoId,
      sku_id: ehServico ? null : sku?.id || null,
      servico_id: ehServico ? servico?.id || null : null,
      descricao:
        item.descricao.trim() ||
        (servico ? `${servico.codigo} — ${servico.nome}` : null) ||
        sku?.nome ||
        'Item',
      quantidade: item.quantidade,
      unidade: item.unidade || 'UN',
    }
  })
  const { error: itemErr } = await supabase.from('com_solicitacao_itens').insert(rows)
  if (itemErr) return { error: itemErr.message }

  revalidatePath('/cockpit/compras/solicitacoes')
  return { ok: true, id: solicitacaoId, numero: sol.numero as string }
}

async function solicitacaoTemCotacao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: string,
  solicitacaoId: string,
) {
  const { count } = await supabase
    .from('com_cotacoes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('solicitacao_id', solicitacaoId)
  return (count || 0) > 0
}

/** Atualiza solicitação registrada sem cotação vinculada. */
export async function atualizarSolicitacao(formData: FormData) {
  const { error, me } = await gate('compras_solicitacoes', 'edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const solicitacaoId = String(formData.get('solicitacao_id') || '').trim()
  const tipoRaw = String(formData.get('tipo') || '')
  const dataNecessidade = String(formData.get('data_necessidade') || '') || null
  const observacao = String(formData.get('observacao') || '').trim() || null
  const solicitantePessoaId = String(formData.get('solicitante_pessoa_id') || '').trim()
  if (!solicitacaoId) return { error: 'Solicitação inválida.' }
  if (!tipoCompraValido(tipoRaw)) return { error: 'Tipo de compra inválido.' }
  if (!solicitantePessoaId) return { error: 'Selecione o solicitante.' }

  const ehServico = tipoRaw === 'servico'
  let itens: Array<{
    descricao: string
    quantidade: number
    unidade: string
    sku_id?: string
    servico_id?: string
  }> = []
  try {
    itens = JSON.parse(String(formData.get('itens_json') || '[]'))
  } catch {
    return { error: 'Itens inválidos.' }
  }
  if (!itens.length) return { error: 'Inclua ao menos um item.' }
  if (ehServico && itens.some((i) => !i.servico_id)) {
    return { error: 'Em compra de serviço, selecione o serviço do cadastro em cada item.' }
  }
  if (!ehServico && itens.some((i) => !i.sku_id && !i.descricao?.trim())) {
    return { error: 'Inclua SKU ou descrição em cada item.' }
  }

  const supabase = await createClient()
  const { data: sol } = await supabase
    .from('com_solicitacoes')
    .select('id, numero, status')
    .eq('id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!sol) return { error: 'Solicitação não encontrada.' }
  if (sol.status !== 'registrada') return { error: 'Só solicitações registradas podem ser editadas.' }
  if (await solicitacaoTemCotacao(supabase, me.empresa_id, solicitacaoId)) {
    return { error: 'Solicitação com cotação não pode ser editada.' }
  }

  const { data: pessoa } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', me.empresa_id)
    .eq('id', solicitantePessoaId)
    .contains('papeis', ['funcionario'])
    .maybeSingle()
  if (!pessoa) return { error: 'Solicitante não encontrado em Pessoas (papel Funcionário).' }

  const skuIds = [...new Set(itens.map((i) => i.sku_id).filter(Boolean))] as string[]
  const servicoIds = [...new Set(itens.map((i) => i.servico_id).filter(Boolean))] as string[]
  const skuMap = new Map<string, { id: string; nome: string }>()
  const servicoMap = new Map<string, { id: string; nome: string; codigo: string }>()

  if (!ehServico && skuIds.length) {
    const { data: skus } = await supabase
      .from('cad_skus')
      .select('id, nome')
      .eq('empresa_id', me.empresa_id)
      .in('id', skuIds)
    for (const sku of skus || []) skuMap.set(sku.id, { id: sku.id, nome: sku.nome })
  }
  if (ehServico && servicoIds.length) {
    const { data: servicos } = await supabase
      .from('cad_servicos')
      .select('id, nome, codigo')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .in('id', servicoIds)
    for (const s of servicos || []) servicoMap.set(s.id, { id: s.id, nome: s.nome, codigo: s.codigo })
  }
  if (ehServico && itens.some((i) => !i.servico_id || !servicoMap.has(i.servico_id))) {
    return { error: 'Serviço inválido ou inativo. Selecione um serviço ativo do cadastro.' }
  }

  const { data: updated, error: upErr } = await supabase
    .from('com_solicitacoes')
    .update({
      solicitante_pessoa_id: solicitantePessoaId,
      data_necessidade: dataNecessidade,
      tipo: tipoRaw as TipoCompra,
      observacao,
    })
    .eq('id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)
    .select('id')
    .maybeSingle()
  if (upErr) return { error: upErr.message }
  if (!updated) return { error: 'Não foi possível atualizar a solicitação.' }

  await supabase
    .from('com_solicitacao_itens')
    .delete()
    .eq('solicitacao_id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)

  const rows = itens.map((item) => {
    const sku = item.sku_id ? skuMap.get(item.sku_id) : null
    const servico = item.servico_id ? servicoMap.get(item.servico_id) : null
    return {
      empresa_id: me.empresa_id,
      solicitacao_id: solicitacaoId,
      sku_id: ehServico ? null : sku?.id || null,
      servico_id: ehServico ? servico?.id || null : null,
      descricao:
        item.descricao.trim() ||
        (servico ? `${servico.codigo} — ${servico.nome}` : null) ||
        sku?.nome ||
        'Item',
      quantidade: item.quantidade,
      unidade: item.unidade || 'UN',
    }
  })
  const { error: itemErr } = await supabase.from('com_solicitacao_itens').insert(rows)
  if (itemErr) return { error: itemErr.message }

  revalidatePath('/cockpit/compras/solicitacoes')
  revalidatePath(`/cockpit/compras/solicitacoes/${solicitacaoId}`)
  return { ok: true, id: solicitacaoId, numero: sol.numero as string }
}

/** Exclui solicitação sem cotação vinculada. */
export async function excluirSolicitacao(solicitacaoId: string) {
  const { error, me } = await gate('compras_solicitacoes', 'delete')
  if (error || !me) return { error: error || 'Sem permissão.' }
  if (!solicitacaoId) return { error: 'Solicitação inválida.' }

  const supabase = await createClient()
  const { data: sol } = await supabase
    .from('com_solicitacoes')
    .select('id, status')
    .eq('id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!sol) return { error: 'Solicitação não encontrada.' }
  if (await solicitacaoTemCotacao(supabase, me.empresa_id, solicitacaoId)) {
    return { error: 'Não é possível excluir: já existe cotação para esta solicitação.' }
  }

  const { error: delErr } = await supabase
    .from('com_solicitacoes')
    .delete()
    .eq('id', solicitacaoId)
    .eq('empresa_id', me.empresa_id)
  if (delErr) return { error: delErr.message }

  revalidatePath('/cockpit/compras/solicitacoes')
  return { ok: true }
}

export async function abrirRascunhoPedido() {
  const { error, me } = await gate('compras_pedidos', 'create')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const supabase = await createClient()
  const numero = await gerarNumeroPedido(me.empresa_id, supabase)
  const { data: pedido, error: pedErr } = await supabase
    .from('com_pedidos')
    .insert({
      empresa_id: me.empresa_id,
      numero,
      tipo: 'produtivo',
      status: 'rascunho',
      valor_total: 0,
      origem: 'direto',
      criador_usuario_id: me.id,
    })
    .select('id, numero')
    .single()
  if (pedErr || !pedido) return { error: pedErr?.message || 'Não foi possível abrir o pedido.' }
  return { ok: true as const, id: pedido.id as string, numero: pedido.numero as string }
}

export async function registrarPedido(formData: FormData) {
  const { error, me } = await gate('compras_pedidos', 'create')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const pedidoId = String(formData.get('pedido_id') || '').trim()
  const fornecedorId = String(formData.get('fornecedor_id') || '').trim()
  const compradorPessoaId = String(formData.get('comprador_pessoa_id') || '').trim()
  const tipoRaw = String(formData.get('tipo') || '')
  const previsao = String(formData.get('previsao_chegada') || '') || null
  const observacao = String(formData.get('observacao') || '').trim() || null
  if (!pedidoId) return { error: 'Pedido sem número associado. Recarregue a página.' }
  if (!fornecedorId) return { error: 'Selecione o fornecedor.' }
  if (!compradorPessoaId) return { error: 'Selecione o comprador/responsável.' }
  if (!tipoCompraValido(tipoRaw)) return { error: 'Tipo de compra inválido.' }

  const ehServico = tipoRaw === 'servico'
  let itens: Array<{
    descricao: string
    quantidade: number
    unidade: string
    preco_unitario: number
    sku_id?: string
    servico_id?: string
  }> = []
  try {
    itens = JSON.parse(String(formData.get('itens_json') || '[]'))
  } catch {
    return { error: 'Itens inválidos.' }
  }
  if (!itens.length) return { error: 'Inclua ao menos um item.' }
  if (ehServico && itens.some((i) => !i.servico_id)) {
    return { error: 'Em compra de serviço, selecione o serviço do cadastro em cada item.' }
  }

  const supabase = await createClient()
  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, numero, status')
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido) return { error: 'Pedido não encontrado.' }
  if (pedido.status !== 'rascunho') return { error: 'Este pedido já foi registrado.' }

  const { data: fornecedor } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', me.empresa_id)
    .eq('id', fornecedorId)
    .contains('papeis', ['fornecedor'])
    .maybeSingle()
  if (!fornecedor) return { error: 'Fornecedor não encontrado.' }

  const { data: comprador } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', me.empresa_id)
    .eq('id', compradorPessoaId)
    .contains('papeis', ['funcionario'])
    .maybeSingle()
  if (!comprador) return { error: 'Comprador não encontrado em Pessoas (papel Funcionário).' }

  const valor = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const config = await lerConfig(supabase, me.empresa_id)
  const exigidos = niveisExigidos(config, valor)
  const status = exigidos === 0 ? 'aprovado' : 'aguardando_aprovacao'

  const skuIds = [...new Set(itens.map((i) => i.sku_id).filter(Boolean))] as string[]
  const servicoIds = [...new Set(itens.map((i) => i.servico_id).filter(Boolean))] as string[]
  const skuMap = new Map<string, { id: string; nome: string }>()
  const servicoMap = new Map<string, { id: string; nome: string; codigo: string }>()

  if (!ehServico && skuIds.length) {
    const { data: skus } = await supabase
      .from('cad_skus')
      .select('id, nome')
      .eq('empresa_id', me.empresa_id)
      .in('id', skuIds)
    for (const sku of skus || []) skuMap.set(sku.id, { id: sku.id, nome: sku.nome })
  }
  if (ehServico && servicoIds.length) {
    const { data: servicos } = await supabase
      .from('cad_servicos')
      .select('id, nome, codigo')
      .eq('empresa_id', me.empresa_id)
      .eq('ativo', true)
      .in('id', servicoIds)
    for (const s of servicos || []) servicoMap.set(s.id, { id: s.id, nome: s.nome, codigo: s.codigo })
  }
  if (ehServico && itens.some((i) => !i.servico_id || !servicoMap.has(i.servico_id))) {
    return { error: 'Serviço inválido ou inativo. Selecione um serviço ativo do cadastro.' }
  }

  const { error: upErr } = await supabase
    .from('com_pedidos')
    .update({
      fornecedor_id: fornecedorId,
      comprador_pessoa_id: compradorPessoaId,
      previsao_chegada: previsao,
      tipo: tipoRaw as TipoCompra,
      observacao,
      status,
      valor_total: valor,
    })
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }

  await supabase.from('com_pedido_itens').delete().eq('pedido_id', pedidoId).eq('empresa_id', me.empresa_id)

  const rows = itens.map((item) => {
    const sku = item.sku_id ? skuMap.get(item.sku_id) : null
    const servico = item.servico_id ? servicoMap.get(item.servico_id) : null
    return {
      empresa_id: me.empresa_id,
      pedido_id: pedidoId,
      sku_id: ehServico ? null : sku?.id || null,
      servico_id: ehServico ? servico?.id || null : null,
      descricao:
        item.descricao.trim() ||
        (servico ? `${servico.codigo} — ${servico.nome}` : null) ||
        sku?.nome ||
        'Item',
      quantidade: item.quantidade,
      unidade: item.unidade || 'UN',
      preco_unitario: item.preco_unitario,
    }
  })
  const { error: itemErr } = await supabase.from('com_pedido_itens').insert(rows)
  if (itemErr) return { error: itemErr.message }

  revalidatePath('/cockpit/compras/pedidos')
  return { ok: true, id: pedidoId, numero: pedido.numero as string }
}

export async function importarPedidosPlanilha(formData: FormData) {
  const { error, me } = await gate('compras_pedidos', 'create')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const file = formData.get('arquivo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Selecione a planilha.' }

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0] || '']
  if (!sheet) return { error: 'Planilha sem abas.' }
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
  const parsed = parsePedidoCsv(csv)
  if (parsed.erros.length && parsed.linhas.length === 0) return { error: parsed.erros[0] }
  if (!parsed.linhas.length) return { error: 'Nenhuma linha válida.' }

  const supabase = await createClient()
  const config = await lerConfig(supabase, me.empresa_id)
  const grupos = agrupar(parsed.linhas)
  let criados = 0

  for (const [numero, linhas] of grupos) {
    const fornecedorNome = linhas[0].fornecedor
    const doc = fornecedorNome.replace(/\D/g, '')
    let busca = supabase
      .from('crm_leads')
      .select('id, nome, documento')
      .eq('empresa_id', me.empresa_id)
      .contains('papeis', ['fornecedor'])
    busca = doc.length >= 11 ? busca.eq('documento', doc) : busca.ilike('nome', fornecedorNome)
    const { data: fornecedores } = await busca.limit(1)
    const fornecedor = fornecedores?.[0]
    if (!fornecedor) {
      return { error: `Fornecedor não encontrado para o pedido ${numero}: ${fornecedorNome}` }
    }

    const tipo = linhas[0].tipo
    const valor = linhas.reduce((s, l) => s + l.quantidade * l.preco, 0)
    const exigidos = niveisExigidos(config, valor)
    const status = exigidos === 0 ? 'aprovado' : 'aguardando_aprovacao'

    const { data: pedido, error: pedErr } = await supabase
      .from('com_pedidos')
      .insert({
        empresa_id: me.empresa_id,
        numero,
        fornecedor_id: fornecedor.id,
        previsao_chegada: linhas[0].previsao,
        tipo,
        status,
        valor_total: valor,
        origem: 'planilha',
        criador_usuario_id: me.id,
      })
      .select('id')
      .single()
    if (pedErr || !pedido) return { error: pedErr?.message || `Falha ao gravar ${numero}` }

    const itens = []
    for (const linha of linhas) {
      let skuId: string | null = null
      if (tipo !== 'servico') {
        const { data: sku } = await supabase
          .from('cad_skus')
          .select('id')
          .eq('empresa_id', me.empresa_id)
          .eq('codigo', linha.item)
          .maybeSingle()
        skuId = sku?.id || null
      }
      itens.push({
        empresa_id: me.empresa_id,
        pedido_id: pedido.id,
        sku_id: skuId,
        descricao: linha.item,
        quantidade: linha.quantidade,
        unidade: linha.unidade,
        preco_unitario: linha.preco,
      })
    }
    const { error: itemErr } = await supabase.from('com_pedido_itens').insert(itens)
    if (itemErr) return { error: itemErr.message }
    criados += 1
  }

  revalidatePath('/cockpit/compras/pedidos')
  return {
    ok: true,
    criados,
    avisos: parsed.erros,
  }
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

export async function decidirPedido(formData: FormData) {
  const { error, me } = await gate('compras_aprovacao', 'edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const pedidoId = String(formData.get('pedido_id') || '')
  const decisao = String(formData.get('decisao') || '')
  const motivo = String(formData.get('motivo') || '').trim() || null
  if (!pedidoId || (decisao !== 'aprovado' && decisao !== 'recusado')) {
    return { error: 'Decisão inválida.' }
  }
  if (decisao === 'recusado' && !motivo) return { error: 'Informe o motivo da recusa.' }

  const supabase = await createClient()
  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select('id, empresa_id, status, valor_total, criador_usuario_id')
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!pedido) return { error: 'Pedido não encontrado.' }
  if (pedido.status !== 'aguardando_aprovacao') return { error: 'Este pedido não está aguardando aprovação.' }

  const isAdmin = me.role_global === 'superadmin' || me.role_global === 'admin'
  if (!isAdmin && pedido.criador_usuario_id && pedido.criador_usuario_id === me.id) {
    return { error: 'Quem lançou o pedido não aprova a própria compra.' }
  }

  const config = await lerConfig(supabase, me.empresa_id)
  const exigidos = niveisExigidos(config, Number(pedido.valor_total))
  if (exigidos === 0) return { error: 'A alçada está desligada para esta empresa.' }

  const { data: feitas } = await supabase
    .from('com_pedido_aprovacoes')
    .select('nivel')
    .eq('pedido_id', pedidoId)
    .eq('empresa_id', me.empresa_id)
  const niveisFeitos = new Set((feitas || []).map((f) => f.nivel))
  const nivel = !niveisFeitos.has(1) ? 1 : 2
  if (nivel > exigidos) return { error: 'Este pedido já cumpriu a alçada.' }

  const grupoEsperado = nivel === 1 ? config?.nivel1_grupo_id : config?.nivel2_grupo_id
  if (!isAdmin && grupoEsperado && me.grupo_id !== grupoEsperado) {
    return { error: `Seu grupo não é o aprovador do nível ${nivel}.` }
  }

  const { error: aprErr } = await supabase.from('com_pedido_aprovacoes').insert({
    empresa_id: me.empresa_id,
    pedido_id: pedidoId,
    nivel,
    usuario_id: me.id,
    decisao,
    motivo,
  })
  if (aprErr) return { error: aprErr.message }

  const novoStatus =
    decisao === 'recusado' || nivel >= exigidos ? (decisao === 'recusado' ? 'recusado' : 'aprovado') : 'aguardando_aprovacao'

  const { error: upErr } = await supabase
    .from('com_pedidos')
    .update({ status: novoStatus })
    .eq('id', pedidoId)
    .eq('empresa_id', me.empresa_id)
  if (upErr) return { error: upErr.message }

  revalidatePath(`/cockpit/compras/pedidos/${pedidoId}`)
  revalidatePath('/cockpit/compras/pedidos')
  return { ok: true }
}

function parseValorAlcada(raw: string): number | null | 'invalido' {
  const texto = raw.trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return 'invalido'
  return n
}

export async function salvarConfigCompras(formData: FormData) {
  const { error, me } = await gate('compras_config', 'edit')
  if (error || !me) return { error: error || 'Sem permissão.' }

  const supabase = await createClient()
  const piso1 = parseValorAlcada(String(formData.get('nivel1_teto') || ''))
  const piso2 = parseValorAlcada(String(formData.get('nivel2_a_partir') || ''))
  if (piso1 === 'invalido' || piso2 === 'invalido') return { error: 'Informe valores numéricos válidos.' }

  const nivel1Grupo = String(formData.get('nivel1_grupo_id') || '') || null
  const nivel2Grupo = String(formData.get('nivel2_grupo_id') || '') || null
  const aprovacaoAtiva = formData.get('aprovacao_ativa') === 'on'
  const base1 = piso1 ?? 0

  if (aprovacaoAtiva && !nivel1Grupo) return { error: 'Selecione o grupo da 1ª alçada.' }
  if (piso2 != null && piso2 <= base1) {
    return { error: 'O valor da 2ª alçada precisa ser maior que o da 1ª.' }
  }
  if (piso2 != null && !nivel2Grupo) return { error: 'Selecione o grupo da 2ª alçada.' }
  if (nivel2Grupo && piso2 == null) return { error: 'Informe o valor da 2ª alçada.' }

  const payload = {
    empresa_id: me.empresa_id,
    aprovacao_ativa: aprovacaoAtiva,
    nivel1_grupo_id: nivel1Grupo,
    nivel1_teto: piso1,
    nivel2_grupo_id: nivel2Grupo,
    nivel2_a_partir: piso2,
    recebimento_por_caixa: formData.get('recebimento_por_caixa') === 'on',
    updated_at: new Date().toISOString(),
  }
  const { error: upErr } = await supabase.from('com_config').upsert(payload, { onConflict: 'empresa_id' })
  if (upErr) return { error: upErr.message }
  revalidatePath('/cockpit/compras/configuracao')
  return { ok: true }
}
