import { parseMovimentoAtomicoResult } from './rpc-movimento'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, args: any) => any }

// ==============================================================================
// 1. MOTIVOS DE REMESSA (CATÁLOGO §11.3)
// ==============================================================================
export const MOTIVOS_REMESSA = [
  { codigo: 'remessa_conserto', label: 'Remessa para conserto / reparo' },
  { codigo: 'remessa_locacao', label: 'Locação / comodato' },
  { codigo: 'remessa_industrializacao', label: 'Industrialização / beneficiamento' },
  { codigo: 'remessa_demonstracao', label: 'Demonstração / amostra' },
  { codigo: 'remessa_garantia', label: 'Garantia / assistência técnica' },
  { codigo: 'remessa_feira_evento', label: 'Feira / stand / evento' },
  { codigo: 'remessa_deposito_terceiros', label: 'Depósito em poder de terceiros' },
  { codigo: 'remessa_emprestimo', label: 'Empréstimo temporário' },
  { codigo: 'outro', label: 'Outro (descrever motivo)' },
] as const

/** Motivos de baixa definitiva do que não retorna (consignação, perda, etc.) */
export const MOTIVOS_BAIXA_REMESSA = [
  { codigo: 'vendido_consignacao', label: 'Vendido em consignação' },
  { codigo: 'consumo_industrializacao', label: 'Consumido na industrialização' },
  { codigo: 'perda_avaria', label: 'Perda / avaria em poder do terceiro' },
  { codigo: 'doacao', label: 'Doação / cortesia' },
  { codigo: 'outro', label: 'Outro (descrever)' },
] as const

// MOTIVOS DE AJUSTE (§9.3)
export const MOTIVOS_AJUSTE = [
  { codigo: 'inventario', label: 'Contagem de Inventário / Divergência Física' },
  { codigo: 'avaria', label: 'Avaria / Danificação no Depósito' },
  { codigo: 'validade_vencida', label: 'Validade Vencida / Descarte' },
  { codigo: 'perda_extravio', label: 'Perda ou Extravio' },
  { codigo: 'outro', label: 'Outro Ajuste Operacional' },
] as const

// ==============================================================================
// 2. RETIRADAS MANUAIS (§8)
// ==============================================================================
export interface ItemRetiradaInput {
  linha: number
  sku_id: string
  local_id: string
  quantidade: number
  justificativa: string
}

export async function gerarNumeroRetirada(
  empresaId: string,
  client: SupabaseClient
): Promise<string> {
  const hoje = new Date()
  const yyyy = hoje.getFullYear()
  const mm = String(hoje.getMonth() + 1).padStart(2, '0')
  const dd = String(hoje.getDate()).padStart(2, '0')
  const prefixo = `RET-${yyyy}${mm}${dd}-`

  const { count } = await client
    .from('est_retirada_lotes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .ilike('numero', `${prefixo}%`)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `${prefixo}${seq}`
}

export async function processarLoteRetirada(
  params: {
    empresa_id: string
    usuario_id?: string | null
    observacao?: string | null
    movimento_em?: string
    itens: ItemRetiradaInput[]
  },
  client: SupabaseClient
) {
  if (!params.itens || params.itens.length === 0) {
    return { sucesso: false, mensagem: 'Adicione ao menos um item para retirada.' }
  }

  for (const it of params.itens) {
    if (!it.sku_id || !it.local_id) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: SKU e Local são obrigatórios.` }
    }
    if (it.quantidade <= 0) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: Quantidade deve ser maior que zero.` }
    }
    if (!it.justificativa?.trim()) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: Justificativa é obrigatória.` }
    }
  }

  const skuIds = [...new Set(params.itens.map((i) => i.sku_id))]
  const localIds = [...new Set(params.itens.map((i) => i.local_id))]

  const [{ data: skusRows }, { data: locaisRows }] = await Promise.all([
    client
      .from('cad_skus')
      .select('id, codigo, ativo, controla_estoque, unidade_estoque')
      .eq('empresa_id', params.empresa_id)
      .in('id', skuIds),
    client
      .from('cad_locais_estoque')
      .select('id, codigo, ativo')
      .eq('empresa_id', params.empresa_id)
      .in('id', localIds),
  ])

  const skuMap = new Map((skusRows || []).map((s: { id: string }) => [s.id, s]))
  const localMap = new Map((locaisRows || []).map((l: { id: string }) => [l.id, l]))

  for (const it of params.itens) {
    const sku = skuMap.get(it.sku_id) as
      | { codigo: string; ativo: boolean; controla_estoque: boolean }
      | undefined
    const local = localMap.get(it.local_id) as { codigo: string; ativo: boolean } | undefined
    if (!sku?.ativo) {
      return {
        sucesso: false,
        codigo: 'SKU_INVALIDO',
        mensagem: `Linha ${it.linha}: SKU não encontrado ou inativo.`,
      }
    }
    if (!sku.controla_estoque) {
      return {
        sucesso: false,
        codigo: 'SKU_SEM_CONTROLE_ESTOQUE',
        mensagem: `Linha ${it.linha}: o SKU ${sku.codigo} não controla estoque.`,
      }
    }
    if (!local?.ativo) {
      return {
        sucesso: false,
        codigo: 'LOCAL_INVALIDO',
        mensagem: `Linha ${it.linha}: local inválido ou inativo.`,
      }
    }
  }

  // Agrega demanda por SKU×local (várias linhas no mesmo par)
  const demanda = new Map<string, { sku_id: string; local_id: string; qtd: number; linhas: number[] }>()
  for (const it of params.itens) {
    const key = `${it.sku_id}|${it.local_id}`
    const cur = demanda.get(key) || {
      sku_id: it.sku_id,
      local_id: it.local_id,
      qtd: 0,
      linhas: [] as number[],
    }
    cur.qtd += it.quantidade
    cur.linhas.push(it.linha)
    demanda.set(key, cur)
  }

  for (const dem of demanda.values()) {
    const { data: saldoRow } = await client
      .from('est_saldos')
      .select('quantidade')
      .eq('empresa_id', params.empresa_id)
      .eq('sku_id', dem.sku_id)
      .eq('local_id', dem.local_id)
      .maybeSingle()

    const saldoDisponivel = Number(saldoRow?.quantidade || 0)
    if (saldoDisponivel < dem.qtd) {
      const sku = skuMap.get(dem.sku_id) as { codigo?: string; unidade_estoque?: string } | undefined
      const local = localMap.get(dem.local_id) as { codigo?: string } | undefined
      return {
        sucesso: false,
        codigo: 'SALDO_INSUFICIENTE',
        mensagem: `Saldo insuficiente em ${local?.codigo || 'local'} para ${sku?.codigo || 'SKU'} (linhas ${dem.linhas.join(', ')}). Disponível: ${saldoDisponivel} · Solicitado: ${dem.qtd}.`,
      }
    }
  }

  const agora = new Date().toISOString()
  const numero = await gerarNumeroRetirada(params.empresa_id, client)

  // status inicial válido no CHECK: rascunho | concluido | parcial | erro
  const { data: loteCriado, error: errLote } = await client
    .from('est_retirada_lotes')
    .insert({
      empresa_id: params.empresa_id,
      numero,
      status: 'rascunho',
      observacao: params.observacao?.trim() || null,
      usuario_id: params.usuario_id || null,
      movimento_em: params.movimento_em || agora,
      created_at: agora,
      updated_at: agora,
    })
    .select('id')
    .single()

  if (errLote || !loteCriado) {
    return { sucesso: false, mensagem: `Erro ao criar lote de retirada: ${errLote?.message}` }
  }

  const loteId = loteCriado.id as string

  const rowsItens = params.itens.map((it) => ({
    empresa_id: params.empresa_id,
    lote_id: loteId,
    linha: it.linha,
    sku_id: it.sku_id,
    local_id: it.local_id,
    quantidade: it.quantidade,
    justificativa: it.justificativa.trim(),
    status: 'ok',
    created_at: agora,
    updated_at: agora,
  }))

  const { data: itensGravados, error: errItens } = await client
    .from('est_retirada_itens')
    .insert(rowsItens)
    .select('id, linha, sku_id, local_id, quantidade, justificativa')

  if (errItens || !itensGravados) {
    await client
      .from('est_retirada_lotes')
      .update({
        status: 'erro',
        erro_resumo: errItens?.message || 'Falha ao gravar itens',
        updated_at: agora,
      })
      .eq('id', loteId)
    return { sucesso: false, mensagem: `Erro ao salvar itens de retirada: ${errItens?.message}` }
  }

  let baixados = 0
  const erros: string[] = []

  for (const it of itensGravados) {
    const { data: rpcRes, error: rpcErr } = await client.rpc(
      'est_registrar_movimento_atomico',
      {
        p_empresa_id: params.empresa_id,
        p_tipo: 'saida',
        p_sku_id: it.sku_id,
        p_local_id: it.local_id,
        p_quantidade: it.quantidade,
        p_documento: numero,
        p_origem: 'retirada',
        p_lote_retirada_id: loteId,
        p_motivo: `Retirada manual — ${it.justificativa}`,
        p_usuario_id: params.usuario_id || null,
        p_permitir_saldo_negativo: false,
      }
    )

    const parsed = parseMovimentoAtomicoResult(rpcRes, rpcErr)
    if (parsed.ok && parsed.movimentoId) {
      baixados++
      await client
        .from('est_retirada_itens')
        .update({
          movimento_id: parsed.movimentoId,
          status: 'ok',
          updated_at: agora,
        })
        .eq('id', it.id)
    } else {
      const msg = parsed.mensagem || 'Falha na RPC'
      const sku = skuMap.get(it.sku_id) as { codigo?: string } | undefined
      erros.push(`Linha ${it.linha} (${sku?.codigo || it.sku_id}): ${msg}`)
      await client
        .from('est_retirada_itens')
        .update({
          status: 'erro',
          erro_codigo: 'MOVIMENTO_FALHOU',
          erro_mensagem: msg,
          updated_at: agora,
        })
        .eq('id', it.id)
    }
  }

  const statusFinal =
    baixados === params.itens.length ? 'concluido' : baixados > 0 ? 'parcial' : 'erro'
  await client
    .from('est_retirada_lotes')
    .update({
      status: statusFinal,
      erro_resumo: erros.length ? erros.join(' | ').slice(0, 2000) : null,
      updated_at: agora,
    })
    .eq('id', loteId)

  return {
    sucesso: baixados > 0,
    loteId,
    numero,
    status: statusFinal,
    mensagem:
      statusFinal === 'concluido'
        ? `Lote ${numero}: ${baixados} item(ns) baixados com sucesso.`
        : `Lote ${numero} ${statusFinal}: ${baixados}/${params.itens.length} itens. ${erros[0] || ''}`.trim(),
  }
}

// ==============================================================================
// 3. AJUSTES DE ESTOQUE (§9)
// ==============================================================================
export interface ItemAjusteInput {
  linha: number
  sku_id: string
  local_id: string
  sinal: '+' | '-'
  quantidade: number
  motivo_codigo: string
  justificativa: string
}

export async function gerarNumeroAjuste(
  empresaId: string,
  client: SupabaseClient
): Promise<string> {
  const hoje = new Date()
  const yyyy = hoje.getFullYear()
  const mm = String(hoje.getMonth() + 1).padStart(2, '0')
  const dd = String(hoje.getDate()).padStart(2, '0')
  const prefixo = `AJU-${yyyy}${mm}${dd}-`

  const { count } = await client
    .from('est_ajuste_lotes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .ilike('numero', `${prefixo}%`)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `${prefixo}${seq}`
}

export async function processarLoteAjuste(
  params: {
    empresa_id: string
    usuario_id?: string | null
    observacao?: string | null
    movimento_em?: string
    itens: ItemAjusteInput[]
  },
  client: SupabaseClient
) {
  if (!params.itens || params.itens.length === 0) {
    return { sucesso: false, mensagem: 'Adicione ao menos um item para ajuste.' }
  }

  const motivosValidos = new Set(MOTIVOS_AJUSTE.map((m) => m.codigo))

  for (const it of params.itens) {
    if (!it.sku_id || !it.local_id) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: SKU e Local são obrigatórios.` }
    }
    if (it.sinal !== '+' && it.sinal !== '-') {
      return { sucesso: false, mensagem: `Linha ${it.linha}: Sinal inválido (use + ou -).` }
    }
    if (it.quantidade <= 0) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: Quantidade deve ser maior que zero.` }
    }
    if (!it.justificativa?.trim()) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: Justificativa é obrigatória para todo ajuste.` }
    }
    if (!motivosValidos.has(it.motivo_codigo as (typeof MOTIVOS_AJUSTE)[number]['codigo'])) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: Motivo de ajuste inválido.` }
    }
  }

  const skuIds = [...new Set(params.itens.map((i) => i.sku_id))]
  const localIds = [...new Set(params.itens.map((i) => i.local_id))]

  const [{ data: skusRows }, { data: locaisRows }] = await Promise.all([
    client
      .from('cad_skus')
      .select('id, codigo, ativo, controla_estoque, unidade_estoque')
      .eq('empresa_id', params.empresa_id)
      .in('id', skuIds),
    client
      .from('cad_locais_estoque')
      .select('id, codigo, ativo')
      .eq('empresa_id', params.empresa_id)
      .in('id', localIds),
  ])

  const skuMap = new Map((skusRows || []).map((s: { id: string }) => [s.id, s]))
  const localMap = new Map((locaisRows || []).map((l: { id: string }) => [l.id, l]))

  for (const it of params.itens) {
    const sku = skuMap.get(it.sku_id) as
      | { codigo: string; ativo: boolean; controla_estoque: boolean }
      | undefined
    const local = localMap.get(it.local_id) as { codigo: string; ativo: boolean } | undefined
    if (!sku?.ativo) {
      return {
        sucesso: false,
        codigo: 'SKU_INVALIDO',
        mensagem: `Linha ${it.linha}: SKU não encontrado ou inativo.`,
      }
    }
    if (!sku.controla_estoque) {
      return {
        sucesso: false,
        codigo: 'SKU_SEM_CONTROLE_ESTOQUE',
        mensagem: `Linha ${it.linha}: o SKU ${sku.codigo} não controla estoque.`,
      }
    }
    if (!local?.ativo) {
      return {
        sucesso: false,
        codigo: 'LOCAL_INVALIDO',
        mensagem: `Linha ${it.linha}: local inválido ou inativo.`,
      }
    }
  }

  // Agrega demanda negativa por SKU×local (várias linhas no mesmo par)
  const demandaNeg = new Map<
    string,
    { sku_id: string; local_id: string; qtd: number; linhas: number[] }
  >()
  for (const it of params.itens) {
    if (it.sinal !== '-') continue
    const key = `${it.sku_id}|${it.local_id}`
    const cur = demandaNeg.get(key) || {
      sku_id: it.sku_id,
      local_id: it.local_id,
      qtd: 0,
      linhas: [] as number[],
    }
    cur.qtd += it.quantidade
    cur.linhas.push(it.linha)
    demandaNeg.set(key, cur)
  }

  for (const dem of demandaNeg.values()) {
    const { data: saldoRow } = await client
      .from('est_saldos')
      .select('quantidade')
      .eq('empresa_id', params.empresa_id)
      .eq('sku_id', dem.sku_id)
      .eq('local_id', dem.local_id)
      .maybeSingle()

    const saldoDisponivel = Number(saldoRow?.quantidade || 0)
    if (saldoDisponivel < dem.qtd) {
      const sku = skuMap.get(dem.sku_id) as { codigo?: string } | undefined
      const local = localMap.get(dem.local_id) as { codigo?: string } | undefined
      return {
        sucesso: false,
        codigo: 'SALDO_INSUFICIENTE',
        mensagem: `Ajuste negativo bloqueado em ${local?.codigo || 'local'} para ${sku?.codigo || 'SKU'} (linhas ${dem.linhas.join(', ')}). Disponível: ${saldoDisponivel} · Solicitado: ${dem.qtd}.`,
      }
    }
  }

  const agora = new Date().toISOString()
  const numero = await gerarNumeroAjuste(params.empresa_id, client)
  const motivoByLinha = new Map(params.itens.map((it) => [it.linha, it.motivo_codigo || 'inventario']))

  // status inicial válido no CHECK: rascunho | concluido | parcial | erro
  const { data: loteCriado, error: errLote } = await client
    .from('est_ajuste_lotes')
    .insert({
      empresa_id: params.empresa_id,
      numero,
      status: 'rascunho',
      observacao: params.observacao?.trim() || null,
      usuario_id: params.usuario_id || null,
      movimento_em: params.movimento_em || agora,
      created_at: agora,
      updated_at: agora,
    })
    .select('id')
    .single()

  if (errLote || !loteCriado) {
    return { sucesso: false, mensagem: `Erro ao criar lote de ajuste: ${errLote?.message}` }
  }

  const loteId = loteCriado.id as string

  const rowsItens = params.itens.map((it) => ({
    empresa_id: params.empresa_id,
    lote_id: loteId,
    linha: it.linha,
    sku_id: it.sku_id,
    local_id: it.local_id,
    sinal: it.sinal === '+' ? 'positivo' : 'negativo',
    quantidade: it.quantidade,
    justificativa: it.justificativa.trim(),
    status: 'ok',
    created_at: agora,
    updated_at: agora,
  }))

  const { data: itensGravados, error: errItens } = await client
    .from('est_ajuste_itens')
    .insert(rowsItens)
    .select('id, linha, sku_id, local_id, sinal, quantidade, justificativa')

  if (errItens || !itensGravados) {
    await client
      .from('est_ajuste_lotes')
      .update({
        status: 'erro',
        erro_resumo: errItens?.message || 'Falha ao gravar itens',
        updated_at: agora,
      })
      .eq('id', loteId)
    return { sucesso: false, mensagem: `Erro ao salvar itens de ajuste: ${errItens?.message}` }
  }

  let ajustados = 0
  const erros: string[] = []

  for (const it of itensGravados) {
    const motivoCodigo = motivoByLinha.get(it.linha) || 'inventario'
    const motivoLabel =
      MOTIVOS_AJUSTE.find((m) => m.codigo === motivoCodigo)?.label || motivoCodigo
    const motivoTexto = `Ajuste ${it.sinal === 'positivo' ? '+' : '-'} (${motivoLabel}) — ${it.justificativa}`

    const { data: rpcRes, error: rpcErr } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: params.empresa_id,
      p_tipo: 'ajuste',
      p_sku_id: it.sku_id,
      p_local_id: it.local_id,
      p_quantidade: it.quantidade,
      p_documento: numero,
      p_origem: 'ajuste',
      p_lote_ajuste_id: loteId,
      p_ajuste_sinal: it.sinal,
      p_motivo_codigo: motivoCodigo,
      p_motivo: motivoTexto,
      p_usuario_id: params.usuario_id || null,
      p_permitir_saldo_negativo: false,
    })

    const parsed = parseMovimentoAtomicoResult(rpcRes, rpcErr)
    if (parsed.ok && parsed.movimentoId) {
      ajustados++
      await client
        .from('est_ajuste_itens')
        .update({
          movimento_id: parsed.movimentoId,
          status: 'ok',
          updated_at: agora,
        })
        .eq('id', it.id)
    } else {
      const msg = parsed.mensagem || 'Falha na RPC'
      const sku = skuMap.get(it.sku_id) as { codigo?: string } | undefined
      erros.push(`Linha ${it.linha} (${sku?.codigo || it.sku_id}): ${msg}`)
      await client
        .from('est_ajuste_itens')
        .update({
          status: 'erro',
          erro_codigo: 'MOVIMENTO_FALHOU',
          erro_mensagem: msg,
          updated_at: agora,
        })
        .eq('id', it.id)
    }
  }

  const statusFinal =
    ajustados === params.itens.length ? 'concluido' : ajustados > 0 ? 'parcial' : 'erro'
  await client
    .from('est_ajuste_lotes')
    .update({
      status: statusFinal,
      erro_resumo: erros.length ? erros.join(' | ').slice(0, 2000) : null,
      updated_at: agora,
    })
    .eq('id', loteId)

  return {
    sucesso: ajustados > 0,
    loteId,
    numero,
    status: statusFinal,
    mensagem:
      statusFinal === 'concluido'
        ? `Lote ${numero}: ${ajustados} item(ns) ajustados com sucesso.`
        : `Lote ${numero} ${statusFinal}: ${ajustados}/${params.itens.length} itens. ${erros[0] || ''}`.trim(),
  }
}

// ==============================================================================
// 4. REMESSAS PARA TERCEIROS (§11)
// ==============================================================================
export interface ItemRemessaInput {
  linha: number
  sku_id: string
  local_origem_id: string
  quantidade_enviada: number
}

export async function gerarNumeroRemessa(
  empresaId: string,
  client: SupabaseClient
): Promise<string> {
  const hoje = new Date()
  const yyyy = hoje.getFullYear()
  const mm = String(hoje.getMonth() + 1).padStart(2, '0')
  const dd = String(hoje.getDate()).padStart(2, '0')
  const prefixo = `REM-${yyyy}${mm}${dd}-`

  const { count } = await client
    .from('est_remessa_lotes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .ilike('numero', `${prefixo}%`)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `${prefixo}${seq}`
}

export async function processarLoteRemessa(
  params: {
    empresa_id: string
    destinatario_pessoa_id: string
    motivo_codigo: string
    motivo_texto?: string | null
    observacao?: string | null
    documento?: string | null
    previsao_retorno_em?: string | null
    usuario_id?: string | null
    itens: ItemRemessaInput[]
  },
  client: SupabaseClient
) {
  if (!params.destinatario_pessoa_id) {
    return { sucesso: false, mensagem: 'Destinatário (pessoa do cadastro) é obrigatório.' }
  }
  if (!params.motivo_codigo) {
    return { sucesso: false, mensagem: 'Motivo da remessa é obrigatório.' }
  }
  const motivosValidos = new Set(MOTIVOS_REMESSA.map((m) => m.codigo))
  if (!motivosValidos.has(params.motivo_codigo as (typeof MOTIVOS_REMESSA)[number]['codigo'])) {
    return { sucesso: false, mensagem: 'Motivo da remessa inválido.' }
  }
  if (
    params.motivo_codigo === 'outro' &&
    (!params.motivo_texto || params.motivo_texto.trim().length < 3)
  ) {
    return {
      sucesso: false,
      mensagem: 'Para o motivo "Outro", descreva detalhadamente a justificativa.',
    }
  }
  if (!params.itens || params.itens.length === 0) {
    return { sucesso: false, mensagem: 'Adicione ao menos um item para remessa.' }
  }

  for (const it of params.itens) {
    if (!it.sku_id) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: SKU é obrigatório.` }
    }
    if (!it.local_origem_id) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: Local de saída é obrigatório.` }
    }
    if (it.quantidade_enviada <= 0) {
      return {
        sucesso: false,
        mensagem: `Linha ${it.linha}: Quantidade enviada deve ser maior que zero.`,
      }
    }
  }

  const skuIds = [...new Set(params.itens.map((i) => i.sku_id))]
  const localIds = [...new Set(params.itens.map((i) => i.local_origem_id))]

  const [{ data: pessoaRow }, { data: locaisRows }, { data: skusRows }] = await Promise.all([
    client
      .from('crm_leads')
      .select('id, nome, ativo, empresa_id')
      .eq('id', params.destinatario_pessoa_id)
      .eq('empresa_id', params.empresa_id)
      .maybeSingle(),
    client
      .from('cad_locais_estoque')
      .select('id, codigo, ativo, eh_terceiros')
      .eq('empresa_id', params.empresa_id)
      .in('id', localIds),
    client
      .from('cad_skus')
      .select('id, codigo, ativo, controla_estoque')
      .eq('empresa_id', params.empresa_id)
      .in('id', skuIds),
  ])

  if (!pessoaRow?.ativo) {
    return {
      sucesso: false,
      codigo: 'PESSOA_INVALIDA',
      mensagem:
        'Destinatário não encontrado ou inativo no cadastro de pessoas desta empresa.',
    }
  }

  const localMap = new Map(
    (locaisRows || []).map((l: { id: string }) => [l.id, l]),
  )
  const skuMap = new Map((skusRows || []).map((s: { id: string }) => [s.id, s]))

  for (const it of params.itens) {
    const local = localMap.get(it.local_origem_id) as
      | { codigo: string; ativo: boolean; eh_terceiros?: boolean }
      | undefined
    const sku = skuMap.get(it.sku_id) as
      | { codigo: string; ativo: boolean; controla_estoque: boolean }
      | undefined
    if (!local?.ativo) {
      return {
        sucesso: false,
        codigo: 'LOCAL_INVALIDO',
        mensagem: `Linha ${it.linha}: local de saída inválido ou inativo.`,
      }
    }
    if (local.eh_terceiros || local.codigo === 'TERCEIROS') {
      return {
        sucesso: false,
        codigo: 'LOCAL_SISTEMA',
        mensagem: `Linha ${it.linha}: o local TERCEIROS é reservado ao sistema e não pode ser origem de remessa.`,
      }
    }
    if (!sku?.ativo) {
      return {
        sucesso: false,
        codigo: 'SKU_INVALIDO',
        mensagem: `Linha ${it.linha}: SKU não encontrado ou inativo.`,
      }
    }
    if (!sku.controla_estoque) {
      return {
        sucesso: false,
        codigo: 'SKU_SEM_CONTROLE_ESTOQUE',
        mensagem: `Linha ${it.linha}: o SKU ${sku.codigo} não controla estoque.`,
      }
    }
  }

  // Agrega demanda por SKU × local
  const demanda = new Map<
    string,
    { sku_id: string; local_id: string; qtd: number; linhas: number[] }
  >()
  for (const it of params.itens) {
    const key = `${it.sku_id}|${it.local_origem_id}`
    const cur = demanda.get(key) || {
      sku_id: it.sku_id,
      local_id: it.local_origem_id,
      qtd: 0,
      linhas: [] as number[],
    }
    cur.qtd += it.quantidade_enviada
    cur.linhas.push(it.linha)
    demanda.set(key, cur)
  }

  for (const dem of demanda.values()) {
    const { data: saldoRow } = await client
      .from('est_saldos')
      .select('quantidade')
      .eq('empresa_id', params.empresa_id)
      .eq('sku_id', dem.sku_id)
      .eq('local_id', dem.local_id)
      .maybeSingle()

    const saldoDisponivel = Number(saldoRow?.quantidade || 0)
    if (saldoDisponivel < dem.qtd) {
      const sku = skuMap.get(dem.sku_id) as { codigo?: string } | undefined
      const local = localMap.get(dem.local_id) as { codigo?: string } | undefined
      return {
        sucesso: false,
        codigo: 'SALDO_INSUFICIENTE',
        mensagem: `Saldo insuficiente em ${local?.codigo || 'local'} para ${sku?.codigo || 'SKU'} (linhas ${dem.linhas.join(', ')}). Disponível: ${saldoDisponivel} · Solicitado: ${dem.qtd}.`,
      }
    }
  }

  const agora = new Date().toISOString()
  const numero = await gerarNumeroRemessa(params.empresa_id, client)
  if (!numero || !numero.startsWith('REM-')) {
    return { sucesso: false, mensagem: 'Falha ao gerar número do lote de remessa.' }
  }

  const motivoInfo = MOTIVOS_REMESSA.find((m) => m.codigo === params.motivo_codigo)
  const motivoLabel =
    params.motivo_codigo === 'outro'
      ? `Outro: ${params.motivo_texto}`
      : motivoInfo?.label || params.motivo_codigo

  // Cabeçalho: local_origem_id do lote = primeiro item (compat. listagens)
  const localLote = params.itens[0].local_origem_id

  const { data: remessaCriada, error: errRem } = await client
    .from('est_remessa_lotes')
    .insert({
      empresa_id: params.empresa_id,
      numero,
      destinatario_pessoa_id: params.destinatario_pessoa_id,
      motivo_codigo: params.motivo_codigo,
      motivo_texto: params.motivo_texto?.trim() || null,
      observacao: params.observacao?.trim() || null,
      local_origem_id: localLote,
      documento: params.documento?.trim() || null,
      previsao_retorno_em: params.previsao_retorno_em || null,
      status: 'aberta',
      usuario_id: params.usuario_id || null,
      enviado_em: agora,
      created_at: agora,
      updated_at: agora,
    })
    .select('id, numero')
    .single()

  if (errRem || !remessaCriada) {
    return { sucesso: false, mensagem: `Erro ao criar remessa: ${errRem?.message}` }
  }

  const remessaId = remessaCriada.id as string
  const numeroGerado = (remessaCriada.numero as string) || numero

  const rowsItens = params.itens.map((it) => ({
    empresa_id: params.empresa_id,
    remessa_id: remessaId,
    sku_id: it.sku_id,
    local_origem_id: it.local_origem_id,
    quantidade_enviada: it.quantidade_enviada,
    quantidade_retornada: 0,
    status_item: 'em_poder',
    observacao: null,
    created_at: agora,
    updated_at: agora,
  }))

  const { data: itensGravados, error: errItens } = await client
    .from('est_remessa_itens')
    .insert(rowsItens)
    .select('id, sku_id, local_origem_id, quantidade_enviada')

  if (errItens || !itensGravados) {
    await client
      .from('est_remessa_lotes')
      .update({ status: 'cancelada', updated_at: agora })
      .eq('id', remessaId)
    return { sucesso: false, mensagem: `Erro ao gravar itens da remessa: ${errItens?.message}` }
  }

  let enviados = 0
  const erros: string[] = []

  for (const it of itensGravados) {
    const { data: rpcRes, error: rpcErr } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: params.empresa_id,
      p_tipo: 'remessa_saida',
      p_sku_id: it.sku_id,
      p_local_id: it.local_origem_id,
      p_quantidade: it.quantidade_enviada,
      p_documento: params.documento || numeroGerado,
      p_pessoa_id: params.destinatario_pessoa_id,
      p_origem: 'remessa',
      p_lote_remessa_id: remessaId,
      p_remessa_item_id: it.id,
      p_motivo_codigo: params.motivo_codigo,
      p_motivo: motivoLabel,
      p_usuario_id: params.usuario_id || null,
      p_permitir_saldo_negativo: false,
    })

    const parsed = parseMovimentoAtomicoResult(rpcRes, rpcErr)
    if (parsed.ok && parsed.movimentoId) {
      enviados++
      await client
        .from('est_remessa_itens')
        .update({
          movimento_saida_id: parsed.movimentoId,
          updated_at: agora,
        })
        .eq('id', it.id)
    } else {
      const msg = parsed.mensagem || 'Falha na RPC'
      const sku = skuMap.get(it.sku_id) as { codigo?: string } | undefined
      erros.push(`${sku?.codigo || it.sku_id}: ${msg}`)
      await client.from('est_remessa_itens').delete().eq('id', it.id)
    }
  }

  if (enviados === 0) {
    await client
      .from('est_remessa_lotes')
      .update({ status: 'cancelada', updated_at: agora })
      .eq('id', remessaId)
    return {
      sucesso: false,
      remessaId,
      numero: numeroGerado,
      mensagem: `Remessa ${numeroGerado} cancelada: nenhum item efetivado no Cardex/Saldos. ${erros[0] || ''}`.trim(),
    }
  }

  return {
    sucesso: true,
    remessaId,
    numero: numeroGerado,
    status: 'aberta',
    mensagem:
      enviados === params.itens.length
        ? `Lote ${numeroGerado} enviado com sucesso (${enviados} itens) — Cardex, saldo próprio e poder de terceiros atualizados.`
        : `Lote ${numeroGerado} parcial: ${enviados}/${params.itens.length} itens. ${erros[0] || ''}`.trim(),
  }
}

export async function processarLiquidacaoRemessa(
  params: {
    empresa_id: string
    remessa_id: string
    item_id: string
    /** Qtd que entra no estoque (SKU de volta). 0 = sem retorno físico. */
    quantidade_retorno?: number
    /** SKU que volta ao local (default = SKU enviado). */
    sku_retorno_id?: string | null
    local_destino_id?: string | null
    /**
     * Qtd do SKU enviado que sai do poder neste retorno físico.
     * Mesmo SKU: deve = quantidade_retorno. SKU diferente: independente.
     * Default = quantidade_retorno quando mesmo SKU.
     */
    quantidade_fecha_poder?: number
    /** Baixa definitiva (não volta ao estoque). */
    quantidade_baixa?: number
    motivo_baixa_codigo?: string | null
    motivo_baixa_texto?: string | null
    usuario_id?: string | null
    observacao?: string | null
  },
  client: SupabaseClient
) {
  const empresa_id = params.empresa_id
  const remessa_id = params.remessa_id
  const item_id = params.item_id
  const qtdRetorno = Number(params.quantidade_retorno || 0)
  const qtdBaixa = Number(params.quantidade_baixa || 0)
  const usuario_id = params.usuario_id
  const observacao = params.observacao

  if (qtdRetorno <= 0 && qtdBaixa <= 0) {
    return {
      sucesso: false,
      mensagem: 'Informe quantidade de retorno e/ou baixa definitiva maior que zero.',
    }
  }

  const { data: remessa } = await client
    .from('est_remessa_lotes')
    .select('id, numero, destinatario_pessoa_id, status')
    .eq('empresa_id', empresa_id)
    .eq('id', remessa_id)
    .maybeSingle()

  const { data: item } = await client
    .from('est_remessa_itens')
    .select(
      'id, sku_id, local_origem_id, quantidade_enviada, quantidade_retornada, quantidade_baixada, movimento_saida_id'
    )
    .eq('empresa_id', empresa_id)
    .eq('id', item_id)
    .eq('remessa_id', remessa_id)
    .maybeSingle()

  if (!remessa || !item) {
    return { sucesso: false, mensagem: 'Remessa ou item não encontrado.' }
  }

  if (remessa.status === 'cancelada' || remessa.status === 'fechada') {
    return {
      sucesso: false,
      mensagem: `Remessa ${remessa.numero} está ${remessa.status} e não aceita liquidação.`,
    }
  }

  if (!item.movimento_saida_id) {
    return {
      sucesso: false,
      mensagem: 'Item sem movimento de saída no Cardex — não há saldo em poder de terceiros.',
    }
  }

  const skuEnviado = item.sku_id as string
  const skuRetorno = (params.sku_retorno_id || skuEnviado) as string
  const mesmoSku = skuRetorno === skuEnviado

  let qtdFechaPoder = Number(
    params.quantidade_fecha_poder ?? (qtdRetorno > 0 ? qtdRetorno : 0)
  )
  // Mesmo SKU: só iguala automaticamente se a qtd de fechamento não foi informada
  // (industrialização pode fechar poder total com qtd de entrada diferente).
  if (
    qtdRetorno > 0 &&
    mesmoSku &&
    (params.quantidade_fecha_poder === undefined || params.quantidade_fecha_poder === null)
  ) {
    qtdFechaPoder = qtdRetorno
  }
  if (qtdRetorno > 0 && !mesmoSku && qtdFechaPoder <= 0) {
    return {
      sucesso: false,
      mensagem:
        'No retorno com SKU diferente, informe a quantidade do item enviado que sai do poder de terceiros.',
    }
  }

  const emPoder =
    Number(item.quantidade_enviada) -
    Number(item.quantidade_retornada || 0) -
    Number(item.quantidade_baixada || 0)

  const totalFechaPoder = (qtdRetorno > 0 ? qtdFechaPoder : 0) + qtdBaixa
  if (totalFechaPoder > emPoder + 1e-9) {
    return {
      sucesso: false,
      codigo: 'QTD_RETORNO_INVALIDA',
      mensagem: `Liquidação (${totalFechaPoder}) maior que em poder (${emPoder}).`,
    }
  }

  if (qtdRetorno > 0) {
    if (!params.local_destino_id) {
      return { sucesso: false, mensagem: 'Local de destino do retorno é obrigatório.' }
    }
    const { data: localDest } = await client
      .from('cad_locais_estoque')
      .select('id, codigo, ativo, eh_terceiros')
      .eq('id', params.local_destino_id)
      .eq('empresa_id', empresa_id)
      .maybeSingle()
    if (!localDest?.ativo) {
      return { sucesso: false, mensagem: 'Local de destino inválido ou inativo.' }
    }
    if (localDest.eh_terceiros || localDest.codigo === 'TERCEIROS') {
      return {
        sucesso: false,
        mensagem: 'O local TERCEIROS é reservado ao sistema; escolha um local próprio para o retorno.',
      }
    }
  }

  if (qtdBaixa > 0) {
    const codigo = params.motivo_baixa_codigo || ''
    const motivosOk = new Set(MOTIVOS_BAIXA_REMESSA.map((m) => m.codigo))
    if (!motivosOk.has(codigo as (typeof MOTIVOS_BAIXA_REMESSA)[number]['codigo'])) {
      return { sucesso: false, mensagem: 'Motivo da baixa definitiva é obrigatório.' }
    }
    if (codigo === 'outro' && (!params.motivo_baixa_texto || params.motivo_baixa_texto.trim().length < 3)) {
      return {
        sucesso: false,
        mensagem: 'Para baixa "Outro", descreva o motivo (mín. 3 caracteres).',
      }
    }
  }

  if (skuRetorno !== skuEnviado) {
    const { data: skuOk } = await client
      .from('cad_skus')
      .select('id, ativo, controla_estoque')
      .eq('id', skuRetorno)
      .eq('empresa_id', empresa_id)
      .maybeSingle()
    if (!skuOk?.ativo || !skuOk.controla_estoque) {
      return { sucesso: false, mensagem: 'SKU de retorno inválido ou sem controle de estoque.' }
    }
  }

  const { data: saldoTerc } = await client
    .from('est_saldos_poder_terceiros')
    .select('quantidade')
    .eq('empresa_id', empresa_id)
    .eq('pessoa_id', remessa.destinatario_pessoa_id)
    .eq('sku_id', skuEnviado)
    .eq('remessa_id', remessa.id)
    .maybeSingle()

  const saldoTercQtd = Number(saldoTerc?.quantidade || 0)
  if (saldoTercQtd + 1e-9 < totalFechaPoder) {
    return {
      sucesso: false,
      codigo: 'SALDO_TERCEIRO_INSUFICIENTE',
      mensagem: `Saldo em poder de terceiros (${saldoTercQtd}) insuficiente para liquidar ${totalFechaPoder}.`,
    }
  }

  const localRef =
    params.local_destino_id ||
    (item.local_origem_id as string) ||
    ''

  if (!localRef) {
    return { sucesso: false, mensagem: 'Local de referência não identificado para o cardex.' }
  }

  const agora = new Date().toISOString()
  const movimentosIds: string[] = []
  const partes: string[] = []

  if (qtdRetorno > 0) {
    const rpcArgs: Record<string, unknown> = {
      p_empresa_id: empresa_id,
      p_tipo: 'remessa_retorno',
      p_sku_id: skuRetorno,
      p_local_id: params.local_destino_id,
      p_quantidade: qtdRetorno,
      p_documento: remessa.numero,
      p_pessoa_id: remessa.destinatario_pessoa_id,
      p_origem: 'remessa',
      p_lote_remessa_id: remessa.id,
      p_remessa_item_id: item.id,
      p_motivo: `Retorno de remessa ${remessa.numero}${
        !mesmoSku ? ` (SKU enviado transformado)` : ''
      }${observacao ? ` — ${observacao}` : ''}`,
      p_usuario_id: usuario_id || null,
      p_permitir_saldo_negativo: false,
    }
    if (!mesmoSku || qtdFechaPoder !== qtdRetorno) {
      rpcArgs.p_sku_poder_id = skuEnviado
      rpcArgs.p_quantidade_poder = qtdFechaPoder
    }

    const { data: rpcRes, error: rpcErr } = await client.rpc(
      'est_registrar_movimento_atomico',
      rpcArgs
    )
    const parsed = parseMovimentoAtomicoResult(rpcRes, rpcErr)
    if (!parsed.ok || !parsed.movimentoId) {
      return {
        sucesso: false,
        mensagem: `Falha no retorno: ${parsed.mensagem || 'sem movimento_id'}`,
      }
    }
    movimentosIds.push(parsed.movimentoId)
    partes.push(`retorno ${qtdRetorno}`)
  }

  if (qtdBaixa > 0) {
    const motivoInfo = MOTIVOS_BAIXA_REMESSA.find((m) => m.codigo === params.motivo_baixa_codigo)
    const motivoLabel =
      params.motivo_baixa_codigo === 'outro'
        ? `Outro: ${params.motivo_baixa_texto}`
        : motivoInfo?.label || params.motivo_baixa_codigo

    const { data: rpcRes, error: rpcErr } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: empresa_id,
      p_tipo: 'remessa_baixa',
      p_sku_id: skuEnviado,
      p_local_id: localRef,
      p_quantidade: qtdBaixa,
      p_documento: remessa.numero,
      p_pessoa_id: remessa.destinatario_pessoa_id,
      p_origem: 'remessa',
      p_lote_remessa_id: remessa.id,
      p_remessa_item_id: item.id,
      p_motivo_codigo: params.motivo_baixa_codigo,
      p_motivo: `Baixa definitiva remessa ${remessa.numero} — ${motivoLabel}${
        observacao ? ` — ${observacao}` : ''
      }`,
      p_usuario_id: usuario_id || null,
      p_permitir_saldo_negativo: false,
    })
    const parsed = parseMovimentoAtomicoResult(rpcRes, rpcErr)
    if (!parsed.ok || !parsed.movimentoId) {
      return {
        sucesso: false,
        mensagem: `Falha na baixa definitiva: ${parsed.mensagem || 'sem movimento_id'}${
          movimentosIds.length ? ' (retorno já gravado — confira Cardex)' : ''
        }`,
      }
    }
    movimentosIds.push(parsed.movimentoId)
    partes.push(`baixa ${qtdBaixa}`)
  }

  const novaRetornada =
    Number(item.quantidade_retornada || 0) + (qtdRetorno > 0 ? qtdFechaPoder : 0)
  const novaBaixada = Number(item.quantidade_baixada || 0) + qtdBaixa
  const enviada = Number(item.quantidade_enviada)
  const liquidado = novaRetornada + novaBaixada
  const novoStatusItem =
    liquidado >= enviada - 1e-9 ? 'retornado' : liquidado > 1e-9 ? 'parcial' : 'em_poder'

  await client
    .from('est_remessa_itens')
    .update({
      quantidade_retornada: novaRetornada,
      quantidade_baixada: novaBaixada,
      status_item: novoStatusItem,
      updated_at: agora,
    })
    .eq('id', item.id)

  const { data: todosItens } = await client
    .from('est_remessa_itens')
    .select('quantidade_enviada, quantidade_retornada, quantidade_baixada')
    .eq('remessa_id', remessa_id)

  const todosLiquidado = (todosItens || []).every(
    (i: {
      quantidade_enviada: number
      quantidade_retornada: number
      quantidade_baixada: number
    }) =>
      Number(i.quantidade_retornada || 0) + Number(i.quantidade_baixada || 0) >=
      Number(i.quantidade_enviada) - 1e-9
  )

  const novoStatusRemessa = todosLiquidado ? 'fechada' : 'parcial'
  await client
    .from('est_remessa_lotes')
    .update({ status: novoStatusRemessa, updated_at: agora })
    .eq('id', remessa_id)

  return {
    sucesso: true,
    movimentoId: movimentosIds[0],
    movimentoIds: movimentosIds,
    novoStatus: novoStatusRemessa,
    mensagem: `Liquidação registrada (${partes.join(' + ')}) — poder de terceiros e estoque atualizados.`,
  }
}

/** Compat: retorno simples do mesmo SKU (sem baixa). */
export async function processarRetornoRemessa(
  params: {
    empresa_id: string
    remessa_id: string
    item_id: string
    quantidade_retorno: number
    local_destino_id: string
    usuario_id?: string | null
    observacao?: string | null
  },
  client: SupabaseClient
) {
  return processarLiquidacaoRemessa(
    {
      empresa_id: params.empresa_id,
      remessa_id: params.remessa_id,
      item_id: params.item_id,
      quantidade_retorno: params.quantidade_retorno,
      local_destino_id: params.local_destino_id,
      quantidade_fecha_poder: params.quantidade_retorno,
      usuario_id: params.usuario_id,
      observacao: params.observacao,
    },
    client
  )
}

// ==============================================================================
// 5. TRANSFERÊNCIAS ENTRE LOCAIS (§7) — lote multi-SKU
// ==============================================================================
export interface ItemTransferenciaInput {
  linha: number
  sku_id: string
  quantidade: number
  observacao?: string | null
}

export interface TransferenciaLoteInput {
  local_origem_id: string
  local_destino_id: string
  documento?: string
  observacao?: string
  movimento_em?: string
  usuario_id?: string
  itens: ItemTransferenciaInput[]
}

/** @deprecated use TransferenciaLoteInput — mantido para compatibilidade de tipos */
export interface TransferenciaInput {
  local_origem_id: string
  local_destino_id: string
  sku_id: string
  quantidade: number
  documento?: string
  observacao?: string
  movimento_em?: string
  usuario_id?: string
}

export async function gerarNumeroTransferencia(
  empresaId: string,
  client: SupabaseClient
): Promise<string> {
  const hoje = new Date()
  const yyyy = hoje.getFullYear()
  const mm = String(hoje.getMonth() + 1).padStart(2, '0')
  const dd = String(hoje.getDate()).padStart(2, '0')
  const prefixo = `TRF-${yyyy}${mm}${dd}-`

  const { count } = await client
    .from('est_transferencia_lotes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .ilike('numero', `${prefixo}%`)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `${prefixo}${seq}`
}

export async function processarLoteTransferencia(params: {
  empresa_id: string
  input: TransferenciaLoteInput
  client: SupabaseClient
}): Promise<{
  sucesso: boolean
  codigo?: string
  loteId?: string
  numero?: string
  status?: string
  mensagem: string
}> {
  const { empresa_id, input, client } = params
  const {
    local_origem_id,
    local_destino_id,
    documento,
    observacao,
    movimento_em,
    usuario_id,
    itens,
  } = input

  if (!local_origem_id || !local_destino_id) {
    return {
      sucesso: false,
      codigo: 'CAMPOS_OBRIGATORIOS',
      mensagem: 'Local de origem e destino são obrigatórios.',
    }
  }

  if (local_origem_id === local_destino_id) {
    return {
      sucesso: false,
      codigo: 'LOCAIS_IGUAIS',
      mensagem: 'O local de origem e de destino devem ser diferentes.',
    }
  }

  if (!itens || itens.length === 0) {
    return {
      sucesso: false,
      codigo: 'ITENS_OBRIGATORIOS',
      mensagem: 'Adicione ao menos um SKU para transferir.',
    }
  }

  const skuIds = itens.map((i) => i.sku_id)
  if (new Set(skuIds).size !== skuIds.length) {
    return {
      sucesso: false,
      codigo: 'SKU_DUPLICADO',
      mensagem: 'Não é permitido repetir o mesmo SKU no lote. Some as quantidades em uma linha.',
    }
  }

  for (const it of itens) {
    if (!it.sku_id) {
      return { sucesso: false, mensagem: `Linha ${it.linha}: selecione o SKU.` }
    }
    if (!it.quantidade || it.quantidade <= 0) {
      return {
        sucesso: false,
        mensagem: `Linha ${it.linha}: quantidade deve ser maior que zero.`,
      }
    }
  }

  const { data: locais } = await client
    .from('cad_locais_estoque')
    .select('id, codigo, nome, ativo')
    .eq('empresa_id', empresa_id)
    .in('id', [local_origem_id, local_destino_id])

  type LocalRow = { id: string; codigo: string; nome: string; ativo: boolean }
  const locaisRows = (locais || []) as LocalRow[]
  const locOrigem = locaisRows.find((l) => l.id === local_origem_id)
  const locDestino = locaisRows.find((l) => l.id === local_destino_id)

  if (!locOrigem?.ativo) {
    return {
      sucesso: false,
      codigo: 'LOCAL_INVALIDO',
      mensagem: 'O local de origem informado é inválido ou está inativo.',
    }
  }
  if (!locDestino?.ativo) {
    return {
      sucesso: false,
      codigo: 'LOCAL_INVALIDO',
      mensagem: 'O local de destino informado é inválido ou está inativo.',
    }
  }

  const { data: skusRows } = await client
    .from('cad_skus')
    .select('id, codigo, nome, unidade_estoque, controla_estoque, ativo')
    .eq('empresa_id', empresa_id)
    .in('id', skuIds)

  type SkuRow = {
    id: string
    codigo: string
    nome: string
    unidade_estoque: string
    controla_estoque: boolean
    ativo: boolean
  }
  const skuMap = new Map(((skusRows || []) as SkuRow[]).map((s) => [s.id, s]))

  for (const it of itens) {
    const sku = skuMap.get(it.sku_id)
    if (!sku?.ativo) {
      return {
        sucesso: false,
        codigo: 'SKU_INVALIDO',
        mensagem: `Linha ${it.linha}: SKU não encontrado ou inativo.`,
      }
    }
    if (!sku.controla_estoque) {
      return {
        sucesso: false,
        codigo: 'SKU_SEM_CONTROLE_ESTOQUE',
        mensagem: `Linha ${it.linha}: o SKU ${sku.codigo} não controla estoque.`,
      }
    }

    const { data: saldoOrigemRow } = await client
      .from('est_saldos')
      .select('quantidade')
      .eq('empresa_id', empresa_id)
      .eq('sku_id', it.sku_id)
      .eq('local_id', local_origem_id)
      .maybeSingle()

    const saldoDisponivel = Number(saldoOrigemRow?.quantidade || 0)
    if (saldoDisponivel < it.quantidade) {
      return {
        sucesso: false,
        codigo: 'SALDO_INSUFICIENTE',
        mensagem: `Linha ${it.linha}: saldo insuficiente em ${locOrigem.codigo} para ${sku.codigo}. Disponível: ${saldoDisponivel} ${sku.unidade_estoque} · Solicitado: ${it.quantidade}.`,
      }
    }
  }

  const agora = new Date().toISOString()
  const numero = await gerarNumeroTransferencia(empresa_id, client)

  const { data: loteCriado, error: errLote } = await client
    .from('est_transferencia_lotes')
    .insert({
      empresa_id,
      numero,
      local_origem_id,
      local_destino_id,
      documento: documento?.trim() || null,
      observacao: observacao?.trim() || null,
      status: 'rascunho',
      usuario_id: usuario_id || null,
      movimento_em: movimento_em || agora,
      created_at: agora,
      updated_at: agora,
    })
    .select('id')
    .single()

  if (errLote || !loteCriado) {
    return {
      sucesso: false,
      mensagem: `Erro ao criar lote de transferência: ${errLote?.message}`,
    }
  }

  const loteId = loteCriado.id as string

  const rowsItens = itens.map((it) => ({
    empresa_id,
    lote_id: loteId,
    linha: it.linha,
    sku_id: it.sku_id,
    quantidade: it.quantidade,
    observacao: it.observacao?.trim() || null,
    status: 'ok',
    created_at: agora,
    updated_at: agora,
  }))

  const { data: itensGravados, error: errItens } = await client
    .from('est_transferencia_itens')
    .insert(rowsItens)
    .select('id, linha, sku_id, quantidade, observacao')

  if (errItens || !itensGravados) {
    await client
      .from('est_transferencia_lotes')
      .update({ status: 'erro', erro_resumo: errItens?.message || 'Falha ao gravar itens' })
      .eq('id', loteId)
    return {
      sucesso: false,
      mensagem: `Erro ao salvar itens: ${errItens?.message}`,
    }
  }

  type ItemGravado = {
    id: string
    linha: number
    sku_id: string
    quantidade: number
    observacao: string | null
  }
  const itensOk = itensGravados as ItemGravado[]

  let okCount = 0
  const erros: string[] = []

  for (const it of itensOk) {
    const sku = skuMap.get(it.sku_id)
    const motivoLinha =
      (it.observacao as string | null)?.trim() ||
      observacao?.trim() ||
      `Transferência ${numero}: ${locOrigem.codigo} → ${locDestino.codigo}`

    const { data: rpcRes, error: rpcErr } = await client.rpc(
      'est_registrar_movimento_atomico',
      {
        p_empresa_id: empresa_id,
        p_tipo: 'transferencia',
        p_sku_id: it.sku_id,
        p_local_id: local_origem_id,
        p_local_destino_id: local_destino_id,
        p_quantidade: it.quantidade,
        p_documento: documento?.trim() || numero,
        p_motivo: motivoLinha,
        p_usuario_id: usuario_id || null,
        p_permitir_saldo_negativo: false,
      }
    )

    const parsed = parseMovimentoAtomicoResult(rpcRes, rpcErr)
    if (parsed.ok && parsed.movimentoId) {
      okCount++
      await client
        .from('est_transferencia_itens')
        .update({
          movimento_id: parsed.movimentoId,
          status: 'ok',
          updated_at: agora,
        })
        .eq('id', it.id)

      await client
        .from('est_movimentos')
        .update({ lote_transferencia_id: loteId })
        .eq('id', parsed.movimentoId)
        .eq('empresa_id', empresa_id)
    } else {
      const msg = parsed.mensagem || 'Falha na RPC'
      erros.push(`Linha ${it.linha} (${sku?.codigo || it.sku_id}): ${msg}`)
      await client
        .from('est_transferencia_itens')
        .update({
          status: 'erro',
          erro_codigo: 'MOVIMENTO_FALHOU',
          erro_mensagem: msg,
          updated_at: agora,
        })
        .eq('id', it.id)
    }
  }

  const statusFinal =
    okCount === itens.length ? 'concluido' : okCount > 0 ? 'parcial' : 'erro'
  await client
    .from('est_transferencia_lotes')
    .update({
      status: statusFinal,
      erro_resumo: erros.length ? erros.join(' | ').slice(0, 2000) : null,
      updated_at: agora,
    })
    .eq('id', loteId)

  return {
    sucesso: okCount > 0,
    loteId,
    numero,
    status: statusFinal,
    mensagem:
      statusFinal === 'concluido'
        ? `Lote ${numero}: ${okCount} SKU(s) transferidos de ${locOrigem.codigo} para ${locDestino.codigo}.`
        : `Lote ${numero} ${statusFinal}: ${okCount}/${itens.length} itens. ${erros[0] || ''}`.trim(),
  }
}

/** Compat: transferência de 1 SKU vira lote de 1 item */
export async function processarTransferencia(params: {
  empresa_id: string
  input: TransferenciaInput
  client: SupabaseClient
}): Promise<{
  sucesso: boolean
  codigo?: string
  movimentoId?: string
  loteId?: string
  numero?: string
  mensagem: string
}> {
  const { input } = params
  const res = await processarLoteTransferencia({
    empresa_id: params.empresa_id,
    client: params.client,
    input: {
      local_origem_id: input.local_origem_id,
      local_destino_id: input.local_destino_id,
      documento: input.documento,
      observacao: input.observacao,
      movimento_em: input.movimento_em,
      usuario_id: input.usuario_id,
      itens: [
        {
          linha: 1,
          sku_id: input.sku_id,
          quantidade: input.quantidade,
        },
      ],
    },
  })

  return {
    sucesso: res.sucesso,
    codigo: res.codigo,
    loteId: res.loteId,
    numero: res.numero,
    mensagem: res.mensagem,
  }
}

