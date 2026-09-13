import { validarLoteEntrada } from './validacao-entrada'
import { parseMovimentoAtomicoResult } from './rpc-movimento'
import type { LoteEntradaInput } from './tipos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, args: any) => any }

export interface ResultadoProcessamentoEntrada {
  sucesso: boolean
  loteId?: string
  numero?: string
  status?: string
  itensValidos: number
  itensComErro: number
  mensagem: string
  erroResumo?: string | null
}

export async function gerarNumeroEntrada(
  empresaId: string,
  client: SupabaseClient
): Promise<string> {
  const hoje = new Date()
  const yyyy = hoje.getFullYear()
  const mm = String(hoje.getMonth() + 1).padStart(2, '0')
  const dd = String(hoje.getDate()).padStart(2, '0')
  const prefixo = `ENT-${yyyy}${mm}${dd}-`

  const { count } = await client
    .from('est_entrada_lotes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .ilike('numero', `${prefixo}%`)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `${prefixo}${seq}`
}

export async function processarLoteEntrada(
  params: LoteEntradaInput,
  client: SupabaseClient
): Promise<ResultadoProcessamentoEntrada> {
  // 1. Executa validação canônica de regras (V1 - V5)
  const validacao = await validarLoteEntrada(params, client)

  if (!validacao.validoParaEfetivar && validacao.totalItens > 0) {
    return {
      sucesso: false,
      itensValidos: 0,
      itensComErro: validacao.itensComErro,
      mensagem: validacao.erroResumo || 'Lote de entrada contém erros impeditivos.',
      erroResumo: validacao.erroResumo,
    }
  }

  // 2. Gera número sequencial amigável
  const numero = await gerarNumeroEntrada(params.empresa_id, client)
  const agora = new Date().toISOString()

  // 3. Insere cabeçalho do lote
  const { data: loteCriado, error: errLote } = await client
    .from('est_entrada_lotes')
    .insert({
      empresa_id: params.empresa_id,
      numero,
      origem: params.origem,
      status: 'processando',
      pessoa_id: params.pessoa_id,
      local_id: params.local_id,
      documento: params.documento?.trim() || null,
      nfe_chave: params.nfe_chave?.trim() || null,
      nfe_xml_nome: params.nfe_xml_nome?.trim() || null,
      observacao: params.observacao?.trim() || null,
      erro_resumo: validacao.erroResumo,
      usuario_id: params.usuario_id || null,
      movimento_em: params.movimento_em || agora,
      created_at: agora,
      updated_at: agora,
    })
    .select('id')
    .single()

  if (errLote || !loteCriado) {
    return {
      sucesso: false,
      itensValidos: 0,
      itensComErro: validacao.totalItens,
      mensagem: `Erro ao criar lote de entrada: ${errLote?.message || 'Falha desconhecida'}`,
    }
  }

  const loteId = loteCriado.id as string

  // 4. Grava os itens no banco
  const rowsItens = validacao.itens.map((it) => ({
    empresa_id: params.empresa_id,
    lote_id: loteId,
    linha: it.linha,
    codigo_parceiro: it.codigo_parceiro,
    sku_id: it.sku_id,
    unidade_origem: it.unidade_origem,
    quantidade_origem: it.quantidade_origem,
    unidade_estoque: it.unidade_estoque,
    quantidade_estoque: it.quantidade_estoque,
    fator_conversao: it.fator_conversao,
    justificativa: it.justificativa,
    status: it.status,
    erro_codigo: it.erro_codigo,
    erro_mensagem: it.erro_mensagem,
    created_at: agora,
    updated_at: agora,
  }))

  const { data: itensGravados, error: errItens } = await client
    .from('est_entrada_itens')
    .insert(rowsItens)
    .select('id, linha, status, sku_id, quantidade_estoque, justificativa')

  if (errItens || !itensGravados) {
    await client
      .from('est_entrada_lotes')
      .update({ status: 'erro', erro_resumo: 'Falha ao gravar itens do lote.' })
      .eq('id', loteId)

    return {
      sucesso: false,
      loteId,
      numero,
      itensValidos: 0,
      itensComErro: validacao.totalItens,
      mensagem: `Erro ao gravar itens do lote: ${errItens?.message}`,
    }
  }

  // 5. Efetivação atômica no Cardex + Saldo para cada item OK (REGRA DE OURO)
  let movimentosEfetivados = 0
  const itensComFalhaExecucao: string[] = []

  for (const item of itensGravados) {
    if (item.status !== 'ok' || !item.sku_id || item.quantidade_estoque == null) {
      continue
    }

    const qtd = Number(item.quantidade_estoque)
    if (!Number.isFinite(qtd) || qtd <= 0) {
      continue
    }

    const motivo = item.justificativa
      ? `Entrada manual — ${item.justificativa}`
      : params.observacao || `Entrada ${numero}`

    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc(
        'est_registrar_movimento_atomico',
        {
          p_empresa_id: params.empresa_id,
          p_tipo: 'entrada',
          p_sku_id: item.sku_id,
          p_local_id: params.local_id,
          p_quantidade: qtd,
          p_documento: params.documento || numero,
          p_pessoa_id: params.pessoa_id,
          p_origem: params.origem,
          p_lote_entrada_id: loteId,
          p_motivo: motivo,
          p_usuario_id: params.usuario_id || null,
          p_permitir_saldo_negativo: false,
        },
      )

      const parsed = parseMovimentoAtomicoResult(rpcRes, rpcErr)
      if (!parsed.ok) {
        itensComFalhaExecucao.push(`Linha ${item.linha}: ${parsed.mensagem}`)
        await client
          .from('est_entrada_itens')
          .update({
            status: 'erro',
            erro_codigo: 'MOVIMENTO_FALHOU',
            erro_mensagem: parsed.mensagem || 'Falha na efetivação do saldo/cardex.',
          })
          .eq('id', item.id)
      } else {
        movimentosEfetivados++
        if (parsed.movimentoId) {
          await client
            .from('est_entrada_itens')
            .update({ movimento_id: parsed.movimentoId })
            .eq('id', item.id)
        }
      }
    } catch (e: unknown) {
      const err = e as Error
      itensComFalhaExecucao.push(`Linha ${item.linha}: ${err?.message || 'Erro inesperado'}`)
    }
  }

  // 6. Atualiza o status final do lote
  let statusFinal: 'concluido' | 'parcial' | 'erro' = 'concluido'
  let erroResumoFinal = validacao.erroResumo

  if (movimentosEfetivados === 0) {
    statusFinal = 'erro'
    erroResumoFinal = erroResumoFinal || 'Nenhum item do lote pôde ser efetivado no estoque.'
  } else if (movimentosEfetivados < validacao.totalItens || itensComFalhaExecucao.length > 0) {
    statusFinal = 'parcial'
    erroResumoFinal =
      erroResumoFinal ||
      `${movimentosEfetivados} itens efetivados. ${validacao.totalItens - movimentosEfetivados} itens não puderam entrar.`
  }

  await client
    .from('est_entrada_lotes')
    .update({
      status: statusFinal,
      erro_resumo: erroResumoFinal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', loteId)

  return {
    sucesso: movimentosEfetivados > 0,
    loteId,
    numero,
    status: statusFinal,
    itensValidos: movimentosEfetivados,
    itensComErro: validacao.totalItens - movimentosEfetivados,
    mensagem:
      statusFinal === 'concluido'
        ? `Lote ${numero} efetivado com sucesso com ${movimentosEfetivados} item(ns).`
        : `Lote ${numero} processado com status "${statusFinal}". Verifique os itens com erro para correção.`,
    erroResumo: erroResumoFinal,
  }
}
