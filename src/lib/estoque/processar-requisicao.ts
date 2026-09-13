import type { EstCodigoErroEntrada } from './tipos'
import { parseMovimentoAtomicoResult } from './rpc-movimento'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, args: any) => any }

export interface ItemRequisicaoInput {
  linha?: number
  sku_id: string
  quantidade_pedida: number
  local_id?: string | null
}

export interface RequisicaoInput {
  empresa_id: string
  requisitante_pessoa_id: string
  solicitante_usuario_id?: string | null
  departamento_id?: string | null
  observacao?: string | null
  origem?: 'manual' | 'planilha'
  enviar_imediatamente?: boolean
  itens: ItemRequisicaoInput[]
}

export async function gerarNumeroRequisicao(
  empresaId: string,
  client: SupabaseClient
): Promise<string> {
  const hoje = new Date()
  const yyyy = hoje.getFullYear()
  const mm = String(hoje.getMonth() + 1).padStart(2, '0')
  const dd = String(hoje.getDate()).padStart(2, '0')
  const prefixo = `REQ-${yyyy}${mm}${dd}-`

  const { count } = await client
    .from('est_requisicoes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .ilike('numero', `${prefixo}%`)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `${prefixo}${seq}`
}

export async function criarRequisicao(
  params: RequisicaoInput,
  client: SupabaseClient
) {
  // 1. Validação do requisitante
  if (!params.requisitante_pessoa_id) {
    return {
      sucesso: false,
      mensagem: 'Requisitante obrigatório. Selecione uma pessoa cadastrada.',
      codigo: 'REQUISITANTE_NAO_CADASTRADO',
    }
  }

  const { data: pessoa } = await client
    .from('crm_leads')
    .select('id, nome')
    .eq('empresa_id', params.empresa_id)
    .eq('id', params.requisitante_pessoa_id)
    .maybeSingle()

  if (!pessoa) {
    return {
      sucesso: false,
      mensagem: 'Requisitante não cadastrado em Cadastros → Pessoas.',
      codigo: 'REQUISITANTE_NAO_CADASTRADO',
    }
  }

  // 2. Validação dos itens
  if (!params.itens || params.itens.length === 0) {
    return {
      sucesso: false,
      mensagem: 'A requisição deve conter ao menos um item.',
      codigo: 'ITENS_OBRIGATORIOS',
    }
  }

  const skuIds = params.itens.map((i) => i.sku_id).filter(Boolean)
  const { data: skus } = await client
    .from('cad_skus')
    .select('id, codigo, nome, controla_estoque, ativo')
    .eq('empresa_id', params.empresa_id)
    .in('id', skuIds)

  const skuMap = new Set((skus || []).map((s: { id: string; controla_estoque: boolean; ativo: boolean }) => s.id))
  for (const item of params.itens) {
    if (!item.sku_id || !skuMap.has(item.sku_id)) {
      return {
        sucesso: false,
        mensagem: 'SKU inválido ou não pertencente a esta empresa.',
        codigo: 'SKU_INVALIDO',
      }
    }
    if (item.quantidade_pedida <= 0) {
      return {
        sucesso: false,
        mensagem: 'A quantidade pedida deve ser maior que zero.',
        codigo: 'QUANTIDADE_INVALIDA',
      }
    }
  }

  // 3. Obter configuração do tenant
  const { data: config } = await client
    .from('est_config')
    .select('*')
    .eq('empresa_id', params.empresa_id)
    .maybeSingle()

  const agora = new Date().toISOString()
  const numero = await gerarNumeroRequisicao(params.empresa_id, client)

  // Status inicial: se enviar_imediatamente for true:
  // Se aprovação via workflow estiver ligada ou requerer aprovação, status vira 'enviada'.
  // Senão, fica 'rascunho' ou 'enviada'.
  let statusInicial: 'rascunho' | 'enviada' = params.enviar_imediatamente ? 'enviada' : 'rascunho'
  let workflowCardId: string | null = null

  // Se aprovação via workflow está ativa e foi enviada
  if (statusInicial === 'enviada' && config?.aprovacao_via_workflow) {
    if (!config.aprovacao_funil_id) {
      return {
        sucesso: false,
        mensagem:
          'Aprovação via workflow está ativa, mas o funil não foi configurado em Estoque → Configuração.',
        codigo: 'WORKFLOW_NAO_CONFIGURADO',
      }
    }

    let stageId = config.aprovacao_estagio_id
    if (!stageId) {
      const { data: firstStage } = await client
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', config.aprovacao_funil_id)
        .order('ordem', { ascending: true })
        .limit(1)
        .maybeSingle()

      stageId = firstStage?.id || null
    }

    if (!stageId) {
      return {
        sucesso: false,
        mensagem:
          'O funil selecionado para aprovação de requisição não possui etapas cadastradas.',
        codigo: 'WORKFLOW_NAO_CONFIGURADO',
      }
    }

    // Cria card no funil de workflow
    const { data: novoCard, error: errCard } = await client
      .from('crm_cards')
      .insert({
        empresa_id: params.empresa_id,
        pipeline_id: config.aprovacao_funil_id,
        stage_id: stageId,
        titulo: `Aprovação Requisição ${numero} - ${pessoa.nome}`,
        lead_id: params.requisitante_pessoa_id,
        valor: 0,
        finalizado: false,
        created_at: agora,
        updated_at: agora,
      })
      .select('id')
      .single()

    if (!errCard && novoCard) {
      workflowCardId = novoCard.id
    }
  }

  // 4. Cria cabeçalho da requisição
  const { data: reqCriada, error: errReq } = await client
    .from('est_requisicoes')
    .insert({
      empresa_id: params.empresa_id,
      numero,
      requisitante_pessoa_id: params.requisitante_pessoa_id,
      solicitante_usuario_id: params.solicitante_usuario_id || null,
      departamento_id: params.departamento_id || null,
      status: statusInicial,
      origem: params.origem || 'manual',
      workflow_card_id: workflowCardId,
      observacao: params.observacao?.trim() || null,
      created_at: agora,
      updated_at: agora,
    })
    .select('id')
    .single()

  if (errReq || !reqCriada) {
    return {
      sucesso: false,
      mensagem: `Erro ao criar requisição: ${errReq?.message || 'Falha ao salvar'}`,
    }
  }

  const requisicaoId = reqCriada.id as string

  // 5. Cria itens da requisição
  const rowsItens = params.itens.map((it) => ({
    empresa_id: params.empresa_id,
    requisicao_id: requisicaoId,
    sku_id: it.sku_id,
    quantidade_pedida: it.quantidade_pedida,
    quantidade_atendida: 0,
    quantidade_pendente: it.quantidade_pedida,
    local_id: it.local_id || null,
    status_item: 'pendente',
    created_at: agora,
    updated_at: agora,
  }))

  const { error: errItens } = await client
    .from('est_requisicao_itens')
    .insert(rowsItens)

  if (errItens) {
    return {
      sucesso: false,
      mensagem: `Erro ao salvar itens da requisição: ${errItens.message}`,
    }
  }

  return {
    sucesso: true,
    requisicaoId,
    numero,
    status: statusInicial,
    mensagem: `Requisição ${numero} criada com sucesso.`,
  }
}

export async function atenderRequisicao(
  params: {
    empresa_id: string
    requisicao_id: string
    usuario_id?: string | null
    local_baixa_id?: string | null
  },
  client: SupabaseClient
) {
  const { empresa_id, requisicao_id, usuario_id, local_baixa_id } = params

  // 1. Carrega requisição
  const { data: req, error: errReq } = await client
    .from('est_requisicoes')
    .select('*, crm_leads (id, nome)')
    .eq('empresa_id', empresa_id)
    .eq('id', requisicao_id)
    .single()

  if (errReq || !req) {
    return { sucesso: false, mensagem: 'Requisição não encontrada.' }
  }

  if (req.status !== 'aprovada' && req.status !== 'parcialmente_atendida') {
    return {
      sucesso: false,
      mensagem: `A requisição está com status "${req.status}" e não pode ser atendida no momento (deve estar Aprovada ou Parcialmente Atendida).`,
    }
  }

  // 2. Carrega configuração de modo de saldo
  const { data: config } = await client
    .from('est_config')
    .select('req_saldo_insuficiente_modo, padrao_local_id')
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  const modoSaldo = config?.req_saldo_insuficiente_modo || 'atende_parcial_pendente'

  // Local default se não informado
  let localResolvedId = local_baixa_id || config?.padrao_local_id || null
  if (!localResolvedId) {
    const { data: localPrincipal } = await client
      .from('cad_locais_estoque')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('eh_principal', true)
      .maybeSingle()
    localResolvedId = localPrincipal?.id || null
  }

  if (!localResolvedId) {
    return {
      sucesso: false,
      mensagem: 'Nenhum local de estoque definido para atendimento e nenhum local principal cadastrado.',
    }
  }

  // 3. Carrega itens pendentes da requisição
  const { data: itens, error: errItens } = await client
    .from('est_requisicao_itens')
    .select('*, cad_skus (id, codigo, nome)')
    .eq('requisicao_id', requisicao_id)
    .gt('quantidade_pendente', 0)

  if (errItens || !itens || itens.length === 0) {
    return {
      sucesso: false,
      mensagem: 'Não há itens com saldo pendente para atendimento nesta requisição.',
    }
  }

  // 4. Carrega saldos atuais dos SKUs envolvidos no local de baixa
  const skuIds = itens.map((i: { sku_id: string }) => i.sku_id)
  const { data: saldosRows } = await client
    .from('est_saldos')
    .select('sku_id, local_id, quantidade')
    .eq('empresa_id', empresa_id)
    .in('sku_id', skuIds)

  const saldoMap: Record<string, number> = {}
  saldosRows?.forEach((s: { sku_id: string; local_id: string; quantidade: number }) => {
    saldoMap[`${s.sku_id}_${s.local_id}`] = Number(s.quantidade)
  })

  // Checagem prévia no modo 'nao_atende_requisicao':
  // Se QUALQUER item tiver saldo < pendente, bloqueia a requisição inteira!
  if (modoSaldo === 'nao_atende_requisicao') {
    for (const item of itens) {
      const locId = item.local_id || localResolvedId
      const saldoDisponivel = saldoMap[`${item.sku_id}_${locId}`] || 0
      const pendente = Number(item.quantidade_pendente)
      if (saldoDisponivel < pendente) {
        const skuInfo = item.cad_skus as { codigo?: string; nome?: string } | null
        return {
          sucesso: false,
          codigo: 'SALDO_INSUFICIENTE_BLOQUEIO',
          mensagem: `Atendimento bloqueado (Modo: Não atende requisição com saldo insuficiente). O SKU ${skuInfo?.codigo || item.sku_id} tem saldo disponível de ${saldoDisponivel}, mas a quantidade pendente é ${pendente}.`,
        }
      }
    }
  }

  // 5. Processamento dos atendimentos
  let itensBaixados = 0
  let itensPulados = 0
  const agora = new Date().toISOString()

  for (const item of itens) {
    const locId = item.local_id || localResolvedId
    const saldoDisponivel = saldoMap[`${item.sku_id}_${locId}`] || 0
    const pendente = Number(item.quantidade_pendente)
    const skuInfo = item.cad_skus as { codigo?: string; nome?: string } | null

    let qtdParaBaixar = 0

    if (saldoDisponivel >= pendente) {
      qtdParaBaixar = pendente
    } else {
      // Saldo < pendente
      if (modoSaldo === 'pula_item') {
        // Pula o item sem baixar nada
        await client
          .from('est_requisicao_itens')
          .update({ status_item: 'pulado', updated_at: agora })
          .eq('id', item.id)
        itensPulados++
        continue
      } else if (modoSaldo === 'atende_parcial_pendente') {
        // Baixa o que tiver disponível
        qtdParaBaixar = saldoDisponivel
      }
    }

    if (qtdParaBaixar <= 0) {
      // Sem saldo disponível para este item
      if (modoSaldo === 'pula_item') {
        itensPulados++
        await client
          .from('est_requisicao_itens')
          .update({ status_item: 'pulado', updated_at: agora })
          .eq('id', item.id)
      }
      continue
    }

    // Registra movimento atômico de saída
    const { data: rpcRes, error: rpcErr } = await client.rpc(
      'est_registrar_movimento_atomico',
      {
        p_empresa_id: empresa_id,
        p_tipo: 'saida',
        p_sku_id: item.sku_id,
        p_local_id: locId,
        p_quantidade: qtdParaBaixar,
        p_documento: req.numero,
        p_pessoa_id: req.requisitante_pessoa_id,
        p_origem: 'requisicao',
        p_requisicao_id: req.id,
        p_motivo: `Atendimento Requisição ${req.numero} - ${skuInfo?.codigo || ''}`,
        p_usuario_id: usuario_id || null,
        p_permitir_saldo_negativo: false,
      }
    )

    const parsed = parseMovimentoAtomicoResult(rpcRes, rpcErr)
    if (!parsed.ok) {
      return {
        sucesso: false,
        mensagem: `Falha ao baixar item ${skuInfo?.codigo || ''}: ${parsed.mensagem || 'Erro ao registrar movimento'}`,
      }
    }

    // Atualiza saldoMap em memória para os próximos itens
    saldoMap[`${item.sku_id}_${locId}`] = saldoDisponivel - qtdParaBaixar

    // Atualiza o item da requisição
    const novaAtendida = Number(item.quantidade_atendida) + qtdParaBaixar
    const novaPendente = Number(item.quantidade_pedida) - novaAtendida
    const novoStatusItem = novaPendente <= 0 ? 'atendido' : 'parcial'

    await client
      .from('est_requisicao_itens')
      .update({
        quantidade_atendida: novaAtendida,
        quantidade_pendente: novaPendente,
        status_item: novoStatusItem,
        local_id: locId,
        updated_at: agora,
      })
      .eq('id', item.id)

    itensBaixados++
  }

  // 6. Recalcula o status geral da requisição
  const { data: itensAtualizados } = await client
    .from('est_requisicao_itens')
    .select('quantidade_pedida, quantidade_atendida, quantidade_pendente, status_item')
    .eq('requisicao_id', requisicao_id)

  const temPendencia = itensAtualizados?.some(
    (i: { quantidade_pendente: number }) => Number(i.quantidade_pendente) > 0
  )
  const temAlgumaBaixa = itensAtualizados?.some(
    (i: { quantidade_atendida: number }) => Number(i.quantidade_atendida) > 0
  )

  let novoStatusReq = req.status
  if (!temPendencia && temAlgumaBaixa) {
    novoStatusReq = 'atendida'
  } else if (temAlgumaBaixa) {
    novoStatusReq = 'parcialmente_atendida'
  }

  await client
    .from('est_requisicoes')
    .update({ status: novoStatusReq, updated_at: agora })
    .eq('id', requisicao_id)

  return {
    sucesso: true,
    novoStatus: novoStatusReq,
    itensBaixados,
    itensPulados,
    mensagem:
      novoStatusReq === 'atendida'
        ? `Requisição ${req.numero} atendida totalmente com sucesso!`
        : `Atendimento registrado. A requisição ficou com status "${novoStatusReq}" (${itensBaixados} itens baixados).`,
  }
}
