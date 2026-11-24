import {
  calcularValorEstimadoRequisicao,
  mensagemStatusEnvio,
  statusAoEnviarRequisicao,
} from './aprovacao-requisicao'
import {
  alocarLotesFefo,
  somarSaldoSkuLocal,
  type AlocacaoLoteFefo,
} from './alocar-lotes-fefo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, args: any) => any }

export interface ItemRequisicaoInput {
  linha?: number
  sku_id?: string | null
  /** Código da planilha quando o SKU ainda não existe. */
  sku_codigo_informado?: string | null
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
  /** Número/ID no sistema de origem — 1 Hugin = 1 origem quando preenchido */
  codigo_origem?: string | null
  /** Ex.: atc_suprimentos, sap, planilha */
  sistema_origem?: string | null
  /** Nome do requisitante como veio na origem (rastreio) */
  requisitante_nome_origem?: string | null
  enviar_imediatamente?: boolean
  /**
   * A origem (ex.: Atlas) já aprovou. Grava `aprovada` sem fila interna
   * e sem card de workflow. Não dispara baixa de estoque.
   */
  aprovada_na_origem?: boolean
  itens: ItemRequisicaoInput[]
}

export async function criarRequisicao(
  params: RequisicaoInput,
  client: SupabaseClient,
  clientPrivilegiado?: SupabaseClient
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
    .select('id, nome, ativo, papeis')
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

  if (!pessoa.ativo) {
    return {
      sucesso: false,
      mensagem: 'Requisitante inativo. Reative a pessoa ou escolha outro funcionário.',
      codigo: 'REQUISITANTE_INATIVO',
    }
  }

  const papeis = Array.isArray(pessoa.papeis) ? pessoa.papeis : []
  if (!papeis.includes('funcionario')) {
    return {
      sucesso: false,
      mensagem:
        'Requisitante deve ter o papel Funcionário em Cadastros → Pessoas.',
      codigo: 'REQUISITANTE_NAO_FUNCIONARIO',
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
    .select('id, codigo, nome, controla_estoque, ativo, preco_custo')
    .eq('empresa_id', params.empresa_id)
    .in('id', skuIds)

  const skuMap = new Set((skus || []).map((s: { id: string; controla_estoque: boolean; ativo: boolean }) => s.id))
  const precosPorSku = new Map<string, number>()
  for (const s of skus || []) {
    precosPorSku.set(s.id, Number(s.preco_custo || 0))
  }
  for (const item of params.itens) {
    const pendenteCadastro = !item.sku_id && Boolean(item.sku_codigo_informado?.trim())
    if (!pendenteCadastro && (!item.sku_id || !skuMap.has(item.sku_id))) {
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
  const codigoOrigem = params.codigo_origem?.trim() || null
  const sistemaOrigem = params.sistema_origem?.trim() || (codigoOrigem ? 'planilha' : null)
  const requisitanteNomeOrigem = params.requisitante_nome_origem?.trim() || null

  if (codigoOrigem && sistemaOrigem) {
    const { data: jaExiste } = await client
      .from('est_requisicoes')
      .select('id, numero')
      .eq('empresa_id', params.empresa_id)
      .eq('sistema_origem', sistemaOrigem)
      .eq('codigo_origem', codigoOrigem)
      .maybeSingle()

    if (jaExiste) {
      return {
        sucesso: false,
        mensagem: `Requisição de origem ${sistemaOrigem}/${codigoOrigem} já existe no Hugin (${jaExiste.numero}).`,
        codigo: 'REQUISICAO_ORIGEM_DUPLICADA',
        requisicaoId: jaExiste.id as string,
        numero: jaExiste.numero as string,
      }
    }
  }

  const valorEstimado = calcularValorEstimadoRequisicao(
    params.itens.filter((it): it is ItemRequisicaoInput & { sku_id: string } => Boolean(it.sku_id)),
    precosPorSku
  )

  // Status: rascunho OU (enviar) pendente_aprovacao / aprovada conforme parâmetros.
  // Aprovação de origem ignora req_aprovacao_* e não cria pendência de workflow.
  let statusInicial: 'rascunho' | 'pendente_aprovacao' | 'aprovada' = 'rascunho'
  let autoPorValorMinimo = false
  let aprovacaoDesligada = false

  if (params.aprovada_na_origem) {
    if (!clientPrivilegiado) {
      return {
        sucesso: false,
        mensagem: 'Aprovação de origem só pode ser executada pelo servidor.',
        codigo: 'ACESSO_NEGADO',
      }
    }
    statusInicial = 'aprovada'
  } else if (params.enviar_imediatamente) {
    statusInicial = statusAoEnviarRequisicao(config, valorEstimado)
    aprovacaoDesligada = !config?.req_aprovacao_ativa
    const minimo = Number(config?.req_aprovacao_valor_minimo ?? 0)
    autoPorValorMinimo =
      Boolean(config?.req_aprovacao_ativa) &&
      minimo > 0 &&
      valorEstimado < minimo &&
      statusInicial === 'aprovada'
  }

  // O funil precisa existir antes da gravação. O card só nasce depois do COMMIT.
  let stageId: string | null = null
  if (statusInicial === 'pendente_aprovacao' && config?.aprovacao_via_workflow) {
    if (!config.aprovacao_funil_id) {
      return {
        sucesso: false,
        mensagem:
          'Aprovação via workflow está ativa, mas o funil não foi configurado em Estoque → Configuração.',
        codigo: 'WORKFLOW_NAO_CONFIGURADO',
      }
    }

    stageId = config.aprovacao_estagio_id || null
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
  }

  const clientCriacao = params.aprovada_na_origem ? clientPrivilegiado! : client
  const modoCriacao = params.aprovada_na_origem
    ? 'aprovada_origem'
    : params.enviar_imediatamente
      ? 'enviar'
      : 'rascunho'

  const { data: gravado, error: errRpc } = await clientCriacao.rpc('est_criar_requisicao', {
    p_empresa_id: params.empresa_id,
    p_requisitante_pessoa_id: params.requisitante_pessoa_id,
    p_solicitante_usuario_id: params.solicitante_usuario_id || null,
    p_departamento_id: params.departamento_id || null,
    p_observacao: params.observacao?.trim() || null,
    p_origem: params.origem || 'manual',
    p_codigo_origem: codigoOrigem,
    p_sistema_origem: sistemaOrigem,
    p_requisitante_nome_origem: requisitanteNomeOrigem,
    p_modo: modoCriacao,
    p_itens: params.itens.map((it) => ({
      sku_id: it.sku_id || null,
      sku_codigo_informado: it.sku_codigo_informado?.trim() || null,
      quantidade_pedida: it.quantidade_pedida,
      local_id: it.local_id || null,
    })),
  })

  if (errRpc || !gravado) {
    return {
      sucesso: false,
      mensagem: `Erro ao criar requisição: ${errRpc?.message || 'Falha ao salvar'}`,
    }
  }

  if (!gravado.sucesso) {
    return {
      sucesso: false,
      mensagem: gravado.mensagem || 'Falha ao salvar a requisição.',
      codigo: gravado.codigo,
      requisicaoId: gravado.requisicao_id || undefined,
      numero: gravado.numero || undefined,
    }
  }

  const requisicaoId = gravado.requisicao_id as string
  const numero = gravado.numero as string
  if (
    gravado.status === 'rascunho' ||
    gravado.status === 'pendente_aprovacao' ||
    gravado.status === 'aprovada'
  ) {
    statusInicial = gravado.status
  }
  if (gravado.motivo_aprovacao === 'aprovacao_desligada') {
    aprovacaoDesligada = true
    autoPorValorMinimo = false
  } else if (gravado.motivo_aprovacao === 'abaixo_minimo') {
    autoPorValorMinimo = true
    aprovacaoDesligada = false
  }

  if (stageId && config?.aprovacao_funil_id) {
    const { data: novoCard, error: errCard } = await client
      .from('crm_cards')
      .insert({
        empresa_id: params.empresa_id,
        pipeline_id: config.aprovacao_funil_id,
        stage_id: stageId,
        titulo: `Aprovação Requisição ${numero} - ${pessoa.nome}`,
        lead_id: params.requisitante_pessoa_id,
        valor: valorEstimado,
        finalizado: false,
        created_at: agora,
        updated_at: agora,
      })
      .select('id')
      .single()

    if (!errCard && novoCard?.id) {
      await client
        .from('est_requisicoes')
        .update({ workflow_card_id: novoCard.id, updated_at: new Date().toISOString() })
        .eq('empresa_id', params.empresa_id)
        .eq('id', requisicaoId)
    }
  }

  return {
    sucesso: true,
    requisicaoId,
    numero,
    status: statusInicial,
    valorEstimado,
    mensagem: mensagemStatusEnvio(statusInicial, numero, {
      autoPorValorMinimo,
      aprovacaoDesligada,
    }),
  }
}

export async function atenderRequisicao(
  params: {
    empresa_id: string
    requisicao_id: string
    usuario_id?: string | null
    local_baixa_id?: string | null
    /** Quantidades escolhidas pelo operador neste ciclo (atendimento parcial controlado). */
    itens?: Array<{ item_id: string; quantidade: number }>
    /** Override FEFO: item_id → alocações manuais por lote. */
    alocacoes_por_item?: Record<string, AlocacaoLoteFefo[]> | null
    /** item_id → série de cada unidade atendida. */
    series_por_item?: Record<string, string[]> | null
    /** Sobrescreve `est_config.req_saldo_insuficiente_modo` (ex.: auto-planilha força parcial). */
    modo_saldo?: string | null
  },
  client: SupabaseClient
) {
  const { empresa_id, requisicao_id, local_baixa_id } = params
  const overrides = params.itens?.length
    ? new Map(
        params.itens
          .filter((i) => i.item_id && Number(i.quantidade) > 0)
          .map((i) => [i.item_id, Number(i.quantidade)])
      )
    : null
  const alocacoesOverride = params.alocacoes_por_item || null

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

  if (req.status !== 'aprovada' && req.status !== 'atendida_parcial') {
    return {
      sucesso: false,
      mensagem: `A requisição está com status "${req.status}" e não pode ser atendida no momento (deve estar Aprovada ou Parcialmente Atendida).`,
    }
  }

  // 2. Carrega configuração de modo de saldo + FEFO
  const { data: config } = await client
    .from('est_config')
    .select('req_saldo_insuficiente_modo, padrao_local_id, bloquear_lotes_vencidos')
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  const modoSaldo =
    params.modo_saldo ||
    config?.req_saldo_insuficiente_modo ||
    'atende_parcial_pendente'
  const bloquearVencidos = Boolean(config?.bloquear_lotes_vencidos)

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
  let itensQuery = client
    .from('est_requisicao_itens')
    .select('*, cad_skus (id, codigo, nome, controla_lote, controla_serie, controla_estoque)')
    .eq('requisicao_id', requisicao_id)
    .gt('quantidade_pendente', 0)

  if (overrides) {
    itensQuery = itensQuery.in('id', [...overrides.keys()])
  }

  const { data: itens, error: errItens } = await itensQuery

  if (errItens || !itens || itens.length === 0) {
    return {
      sucesso: false,
      mensagem: 'Não há itens com saldo pendente para atendimento nesta requisição.',
    }
  }

  const semSku = itens.filter((i: { sku_id?: string | null }) => !i.sku_id)
  const itensBaixa = itens.filter((i: { sku_id?: string | null }) => Boolean(i.sku_id))
  if (itensBaixa.length === 0) {
    return {
      sucesso: false,
      mensagem: semSku.length
        ? 'Há itens sem SKU cadastrado. Cadastre o SKU na requisição antes da saída. A falta de saldo só é avaliada na baixa.'
        : 'Não há itens com saldo pendente para atendimento nesta requisição.',
    }
  }

  // 4. Carrega saldos atuais dos SKUs sem controle de lote (soma por sku×local)
  const skuIdsSemLote = itensBaixa
    .filter((i: { cad_skus?: { controla_lote?: boolean } | null }) => !i.cad_skus?.controla_lote)
    .map((i: { sku_id: string }) => i.sku_id)
  const saldoMap: Record<string, number> = {}

  if (skuIdsSemLote.length > 0) {
    const { data: saldosRows } = await client
      .from('est_saldos')
      .select('sku_id, local_id, quantidade')
      .eq('empresa_id', empresa_id)
      .eq('local_id', localResolvedId)
      .in('sku_id', [...new Set(skuIdsSemLote)])
      .limit(2000)

    saldosRows?.forEach((s: { sku_id: string; local_id: string; quantidade: number }) => {
      const key = `${s.sku_id}_${s.local_id}`
      saldoMap[key] = (saldoMap[key] || 0) + Number(s.quantidade || 0)
    })
  }

  async function saldoDisponivelItem(
    skuId: string,
    locId: string,
    controlaLote: boolean
  ): Promise<number> {
    if (controlaLote) {
      return somarSaldoSkuLocal(client, {
        empresa_id,
        sku_id: skuId,
        local_id: locId,
      })
    }
    if (locId === localResolvedId) {
      return saldoMap[`${skuId}_${locId}`] || 0
    }
    // Item com local próprio diferente do default — soma pontual
    const { data: rows } = await client
      .from('est_saldos')
      .select('quantidade')
      .eq('empresa_id', empresa_id)
      .eq('sku_id', skuId)
      .eq('local_id', locId)
      .limit(500)
    return (rows || []).reduce(
      (acc: number, r: { quantidade: number }) => acc + (Number(r.quantidade) || 0),
      0
    )
  }

  // Checagem prévia no modo 'nao_atende_requisicao' (só no modo automático sem overrides parciais intencionais)
  if (modoSaldo === 'nao_atende_requisicao' && !overrides) {
    for (const item of itensBaixa) {
      const locId = item.local_id || localResolvedId
      const skuInfo = item.cad_skus as {
        codigo?: string
        nome?: string
        controla_lote?: boolean
      } | null
      const controlaLote = Boolean(skuInfo?.controla_lote)
      const saldoDisponivel = await saldoDisponivelItem(item.sku_id, locId, controlaLote)
      const pendente = Number(item.quantidade_pendente)
      if (saldoDisponivel < pendente) {
        return {
          sucesso: false,
          codigo: 'SALDO_INSUFICIENTE_BLOQUEIO',
          mensagem: `Atendimento bloqueado (Modo: Não atende requisição com saldo insuficiente). O SKU ${skuInfo?.codigo || item.sku_id} tem saldo disponível de ${saldoDisponivel}, mas a quantidade pendente é ${pendente}.`,
        }
      }
    }
  }

  // 5. Monta o plano. A baixa e as quantidades acontecem numa única transação.
  let itensPulados = 0
  const operacoes: Array<Record<string, unknown>> = []

  for (const item of itensBaixa) {
    const locId = item.local_id || localResolvedId
    const pendente = Number(item.quantidade_pendente)
    const skuInfo = item.cad_skus as {
      codigo?: string
      nome?: string
        controla_lote?: boolean
        controla_serie?: boolean
        controla_estoque?: boolean
      } | null
    if (skuInfo && skuInfo.controla_estoque === false) {
      return {
        sucesso: false,
        codigo: 'SKU_SEM_CONTROLE',
        mensagem: `SKU ${skuInfo.codigo || item.sku_id} não controla estoque. A saída desta linha fica bloqueada até o cadastro controlar estoque.`,
      }
    }
      const controlaLote = Boolean(skuInfo?.controla_lote)
      const controlaSerie = Boolean(skuInfo?.controla_serie)
      const saldoDisponivel = await saldoDisponivelItem(item.sku_id, locId, controlaLote)

      let qtdParaBaixar = 0

    if (overrides) {
      const pedidaOp = overrides.get(item.id) || 0
      qtdParaBaixar = Math.min(pedidaOp, pendente, Math.max(0, saldoDisponivel))
      if (pedidaOp > pendente) {
        return {
          sucesso: false,
          mensagem: `SKU ${skuInfo?.codigo || ''}: quantidade pedida (${pedidaOp}) maior que o pendente (${pendente}).`,
        }
      }
      if (pedidaOp > saldoDisponivel) {
        if (modoSaldo === 'nao_atende_requisicao') {
          return {
            sucesso: false,
            codigo: 'SALDO_INSUFICIENTE_BLOQUEIO',
            mensagem: `SKU ${skuInfo?.codigo || ''}: saldo no local (${saldoDisponivel}) insuficiente para ${pedidaOp}.`,
          }
        }
      }
    } else if (saldoDisponivel >= pendente) {
      qtdParaBaixar = pendente
    } else if (modoSaldo === 'pula_item') {
      operacoes.push({ item_id: item.id, acao: 'pular' })
      itensPulados++
      continue
    } else if (modoSaldo === 'atende_parcial_pendente') {
      qtdParaBaixar = saldoDisponivel
    }

    if (qtdParaBaixar <= 0) {
      if (!overrides && modoSaldo === 'pula_item') {
        operacoes.push({ item_id: item.id, acao: 'pular' })
        itensPulados++
      }
      continue
    }

    const seriesItem = controlaSerie
      ? (params.series_por_item?.[item.id] || []).filter(Boolean)
      : []
    if (controlaSerie && seriesItem.length !== qtdParaBaixar) {
      return {
        sucesso: false,
        mensagem: `SKU ${skuInfo?.codigo || ''}: informe uma série para cada unidade (${qtdParaBaixar}). O saldo sem série não sai.`,
      }
    }

    let alocacoes: AlocacaoLoteFefo[] = []
    if (controlaSerie) {
      alocacoes = seriesItem.map(() => ({
        lote_produto_id: '',
        numero_lote: '',
        data_validade: null,
        quantidade: 1,
      }))
    } else if (controlaLote) {
      const overrideAloc = alocacoesOverride?.[item.id]
      if (overrideAloc?.length) {
        alocacoes = overrideAloc.filter((a) => a.quantidade > 0 && a.lote_produto_id)
        const somaOverride = alocacoes.reduce((s, a) => s + Number(a.quantidade || 0), 0)
        if (somaOverride > qtdParaBaixar + 1e-9) {
          return {
            sucesso: false,
            mensagem: `SKU ${skuInfo?.codigo || ''}: alocações de lote (${somaOverride}) excedem a quantidade a baixar (${qtdParaBaixar}).`,
          }
        }
        qtdParaBaixar = Math.min(qtdParaBaixar, somaOverride)
      } else {
        try {
          const fefo = await alocarLotesFefo(client, {
            empresa_id,
            sku_id: item.sku_id,
            local_id: locId,
            quantidade: qtdParaBaixar,
            bloquear_vencidos: bloquearVencidos,
          })
          alocacoes = fefo.alocacoes
          if (fefo.quantidade_faltante > 0) {
            if (modoSaldo === 'nao_atende_requisicao') {
              return {
                sucesso: false,
                codigo: 'SALDO_INSUFICIENTE_BLOQUEIO',
                mensagem: `SKU ${skuInfo?.codigo || ''}: FEFO alocou ${fefo.quantidade_alocada} de ${qtdParaBaixar} (faltam ${fefo.quantidade_faltante}).`,
              }
            }
            qtdParaBaixar = fefo.quantidade_alocada
          }
        } catch (e: unknown) {
          const err = e as Error
          return {
            sucesso: false,
            mensagem: `SKU ${skuInfo?.codigo || ''}: falha FEFO — ${err?.message || 'erro'}`,
          }
        }
      }

      if (qtdParaBaixar <= 0 || alocacoes.length === 0) {
        if (modoSaldo === 'pula_item') {
          operacoes.push({ item_id: item.id, acao: 'pular' })
          itensPulados++
        }
        continue
      }
    } else {
      alocacoes = [
        {
          lote_produto_id: '',
          numero_lote: '',
          data_validade: null,
          quantidade: qtdParaBaixar,
        },
      ]
    }

    const movimentos = []
    for (let indice = 0; indice < alocacoes.length; indice++) {
      const aloc = alocacoes[indice]
      const qtdAloc = Number(aloc.quantidade)
      if (!Number.isFinite(qtdAloc) || qtdAloc <= 0) continue
      movimentos.push({
        quantidade: controlaSerie ? 1 : qtdAloc,
        lote_produto_id: controlaLote ? aloc.lote_produto_id : null,
        serie_id: controlaSerie ? seriesItem[indice] : null,
        motivo: `Atendimento Requisição ${req.numero} - ${skuInfo?.codigo || ''}${
          controlaLote && aloc.numero_lote ? ` · lote ${aloc.numero_lote}` : ''
        }`,
      })
    }

    if (movimentos.length === 0) continue

    if (!controlaLote && locId === localResolvedId) {
      const qtdPlano = movimentos.reduce((s, m) => s + Number(m.quantidade), 0)
      saldoMap[`${item.sku_id}_${locId}`] = Math.max(0, saldoDisponivel - qtdPlano)
    }

    operacoes.push({
      item_id: item.id,
      acao: 'atender',
      local_id: locId,
      movimentos,
    })
  }

  if (!operacoes.some((op) => op.acao === 'atender')) {
    if (operacoes.length > 0) {
      await client.rpc('est_atender_requisicao', {
        p_empresa_id: empresa_id,
        p_requisicao_id: requisicao_id,
        p_operacoes: operacoes,
      })
    }
    return {
      sucesso: false,
      mensagem:
        'Nenhum item foi baixado. Verifique o saldo no local selecionado e as quantidades informadas.',
    }
  }

  const { data: baixa, error: errBaixa } = await client.rpc('est_atender_requisicao', {
    p_empresa_id: empresa_id,
    p_requisicao_id: requisicao_id,
    p_operacoes: operacoes,
  })

  if (errBaixa || !baixa?.sucesso) {
    return {
      sucesso: false,
      codigo: baixa?.codigo,
      mensagem:
        baixa?.mensagem ||
        errBaixa?.message ||
        'Falha ao baixar os itens da requisição.',
    }
  }

  return {
    sucesso: true,
    novoStatus: baixa.status,
    itensBaixados: Number(baixa.itens_baixados || 0),
    itensPulados: Number(baixa.itens_pulados ?? itensPulados),
    mensagem: baixa.mensagem,
  }
}
