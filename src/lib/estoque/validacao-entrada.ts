import { resolveFatorConversao } from '@/lib/skus/resolve-conversao'
import type {
  EstCodigoErroEntrada,
  ItemEntradaInput,
  ItemEntradaValidado,
  LoteEntradaInput,
  ResultadoValidacaoLote,
} from './tipos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any }

export async function validarLoteEntrada(
  params: LoteEntradaInput,
  client: SupabaseClient
): Promise<ResultadoValidacaoLote> {
  const {
    empresa_id,
    origem,
    pessoa_id,
    local_id,
    nfe_chave,
    itens,
  } = params

  const resultadoItens: ItemEntradaValidado[] = []

  // V1 - Validação do Fornecedor (Pessoas)
  if (!pessoa_id) {
    return {
      validoParaEfetivar: false,
      totalItens: itens.length,
      itensValidos: 0,
      itensComErro: itens.length,
      statusSugerido: 'erro',
      erroResumo: 'Fornecedor não selecionado.',
      itens: itens.map((it) => ({
        linha: it.linha,
        codigo_parceiro: it.codigo_parceiro ?? null,
        sku_id: it.sku_id ?? null,
        unidade_origem: it.unidade_origem,
        quantidade_origem: it.quantidade_origem,
        unidade_estoque: null,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: it.justificativa ?? null,
        status: 'erro',
        erro_codigo: 'FORNECEDOR_NAO_CADASTRADO',
        erro_mensagem: 'Fornecedor não informado para o lote.',
      })),
    }
  }

  const { data: pessoa } = await client
    .from('crm_leads')
    .select('id, nome')
    .eq('empresa_id', empresa_id)
    .eq('id', pessoa_id)
    .maybeSingle()

  if (!pessoa) {
    return {
      validoParaEfetivar: false,
      totalItens: itens.length,
      itensValidos: 0,
      itensComErro: itens.length,
      statusSugerido: 'erro',
      erroResumo: 'Fornecedor não cadastrado em Cadastros → Pessoas.',
      itens: itens.map((it) => ({
        linha: it.linha,
        codigo_parceiro: it.codigo_parceiro ?? null,
        sku_id: it.sku_id ?? null,
        unidade_origem: it.unidade_origem,
        quantidade_origem: it.quantidade_origem,
        unidade_estoque: null,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: it.justificativa ?? null,
        status: 'erro',
        erro_codigo: 'FORNECEDOR_NAO_CADASTRADO',
        erro_mensagem: `O fornecedor selecionado não foi encontrado no cadastro da sua empresa. Cadastre em Cadastros → Pessoas.`,
      })),
    }
  }

  // Validação do Local de Destino
  if (!local_id) {
    return {
      validoParaEfetivar: false,
      totalItens: itens.length,
      itensValidos: 0,
      itensComErro: itens.length,
      statusSugerido: 'erro',
      erroResumo: 'Local de estoque de destino não informado.',
      itens: itens.map((it) => ({
        linha: it.linha,
        codigo_parceiro: it.codigo_parceiro ?? null,
        sku_id: it.sku_id ?? null,
        unidade_origem: it.unidade_origem,
        quantidade_origem: it.quantidade_origem,
        unidade_estoque: null,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: it.justificativa ?? null,
        status: 'erro',
        erro_codigo: 'LOCAL_INVALIDO',
        erro_mensagem: 'Local de destino não informado para o lote.',
      })),
    }
  }

  const { data: local } = await client
    .from('cad_locais_estoque')
    .select('id, codigo, nome, ativo')
    .eq('empresa_id', empresa_id)
    .eq('id', local_id)
    .maybeSingle()

  if (!local || !local.ativo) {
    return {
      validoParaEfetivar: false,
      totalItens: itens.length,
      itensValidos: 0,
      itensComErro: itens.length,
      statusSugerido: 'erro',
      erroResumo: `Local de estoque inválido ou inativo.`,
      itens: itens.map((it) => ({
        linha: it.linha,
        codigo_parceiro: it.codigo_parceiro ?? null,
        sku_id: it.sku_id ?? null,
        unidade_origem: it.unidade_origem,
        quantidade_origem: it.quantidade_origem,
        unidade_estoque: null,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: it.justificativa ?? null,
        status: 'erro',
        erro_codigo: 'LOCAL_INVALIDO',
        erro_mensagem: `O local informado é inexistente ou inativo. Cadastre ou ative em Estoque → Locais.`,
      })),
    }
  }

  // Validação de Chave NFe Duplicada (se aplicável)
  if (nfe_chave && nfe_chave.trim().length > 0) {
    const { data: nfeExistente } = await client
      .from('est_entrada_lotes')
      .select('id, numero, status')
      .eq('empresa_id', empresa_id)
      .eq('nfe_chave', nfe_chave.trim())
      .in('status', ['concluido', 'parcial'])
      .maybeSingle()

    if (nfeExistente) {
      return {
        validoParaEfetivar: false,
        totalItens: itens.length,
        itensValidos: 0,
        itensComErro: itens.length,
        statusSugerido: 'erro',
        erroResumo: `A chave NFe já foi processada no lote ${nfeExistente.numero}.`,
        itens: itens.map((it) => ({
          linha: it.linha,
          codigo_parceiro: it.codigo_parceiro ?? null,
          sku_id: it.sku_id ?? null,
          unidade_origem: it.unidade_origem,
          quantidade_origem: it.quantidade_origem,
          unidade_estoque: null,
          quantidade_estoque: null,
          fator_conversao: null,
          justificativa: it.justificativa ?? null,
          status: 'erro',
          erro_codigo: 'NFE_DUPLICADA',
          erro_mensagem: `Nota fiscal duplicada: já registrada no lote ${nfeExistente.numero}.`,
        })),
      }
    }
  }

  // Pre-carregar dados para validação em batch dos itens
  // Coleta todos os SKUs diretos e códigos parceiros
  const directSkuIds = itens.map((i) => i.sku_id).filter(Boolean) as string[]
  const codigosParceiro = itens
    .map((i) => i.codigo_parceiro?.trim())
    .filter(Boolean) as string[]

  // Buscar De-Paras cadastrados para esta pessoa e códigos de parceiro
  let deparasMap: Record<string, string> = {}
  if (codigosParceiro.length > 0) {
    const { data: deparas } = await client
      .from('cad_sku_depara')
      .select('codigo_parceiro, sku_id')
      .eq('empresa_id', empresa_id)
      .eq('pessoa_id', pessoa_id)
      .eq('ativo', true)
      .in('codigo_parceiro', codigosParceiro)

    if (deparas && deparas.length > 0) {
      deparasMap = deparas.reduce((acc: Record<string, string>, curr: { codigo_parceiro: string; sku_id: string }) => {
        acc[curr.codigo_parceiro.trim().toUpperCase()] = curr.sku_id
        return acc
      }, {})
    }
  }

  // Coleta todos os SKUs finais a serem verificados
  const todosSkuIdsSet = new Set<string>(directSkuIds)
  Object.values(deparasMap).forEach((id) => todosSkuIdsSet.add(id))
  const todosSkuIds = Array.from(todosSkuIdsSet)

  let skusMap: Record<string, { id: string; codigo: string; nome: string; unidade_estoque: string; controla_estoque: boolean; ativo: boolean }> = {}
  if (todosSkuIds.length > 0) {
    const { data: skus } = await client
      .from('cad_skus')
      .select('id, codigo, nome, unidade_estoque, controla_estoque, ativo')
      .eq('empresa_id', empresa_id)
      .in('id', todosSkuIds)

    if (skus && skus.length > 0) {
      skusMap = skus.reduce((acc: Record<string, any>, curr: any) => {
        acc[curr.id] = curr
        return acc
      }, {})
    }
  }

  // Validação item a item
  for (const item of itens) {
    let resolvedSkuId: string | null = item.sku_id || null
    const codigoParceiroTrim = item.codigo_parceiro?.trim() || null

    // V2: Resolve SKU — na entrada manual o SKU Hugin basta; código parceiro é opcional
    //     e só resolve via de-para quando o SKU não veio informado.
    if (!resolvedSkuId && codigoParceiroTrim) {
      resolvedSkuId = deparasMap[codigoParceiroTrim.toUpperCase()] || null
    }

    // Se ainda não tem SKU resolvido:
    if (!resolvedSkuId) {
      resultadoItens.push({
        linha: item.linha,
        codigo_parceiro: codigoParceiroTrim,
        sku_id: null,
        unidade_origem: item.unidade_origem,
        quantidade_origem: item.quantidade_origem,
        unidade_estoque: null,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: item.justificativa ?? null,
        status: 'erro',
        erro_codigo: 'DEPARA_NAO_ENCONTRADO',
        erro_mensagem:
          origem === 'lote_tela'
            ? 'Selecione o SKU Hugin na linha. O código do fornecedor é opcional nesta entrada manual.'
            : codigoParceiroTrim
              ? `O código do parceiro "${codigoParceiroTrim}" não possui de-para cadastrado para este fornecedor. Cadastre em Cadastros → De-para SKU.`
              : 'Nenhum SKU ou código parceiro foi informado na linha.',
      })
      continue
    }

    const sku = skusMap[resolvedSkuId]
    if (!sku) {
      resultadoItens.push({
        linha: item.linha,
        codigo_parceiro: codigoParceiroTrim,
        sku_id: resolvedSkuId,
        unidade_origem: item.unidade_origem,
        quantidade_origem: item.quantidade_origem,
        unidade_estoque: null,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: item.justificativa ?? null,
        status: 'erro',
        erro_codigo: 'DEPARA_NAO_ENCONTRADO',
        erro_mensagem: `O SKU associado (${resolvedSkuId}) não foi encontrado ou não pertence a esta empresa.`,
      })
      continue
    }

    // V4: Checagem de SKU ativo e controle de estoque
    if (!sku.ativo) {
      resultadoItens.push({
        linha: item.linha,
        codigo_parceiro: codigoParceiroTrim,
        sku_id: sku.id,
        sku_codigo: sku.codigo,
        sku_nome: sku.nome,
        unidade_origem: item.unidade_origem,
        quantidade_origem: item.quantidade_origem,
        unidade_estoque: sku.unidade_estoque,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: item.justificativa ?? null,
        status: 'erro',
        erro_codigo: 'SKU_SEM_CONTROLE_ESTOQUE',
        erro_mensagem: `O SKU "${sku.codigo} - ${sku.nome}" está inativo. Ative o item em Cadastros → SKUs.`,
      })
      continue
    }

    if (!sku.controla_estoque) {
      resultadoItens.push({
        linha: item.linha,
        codigo_parceiro: codigoParceiroTrim,
        sku_id: sku.id,
        sku_codigo: sku.codigo,
        sku_nome: sku.nome,
        unidade_origem: item.unidade_origem,
        quantidade_origem: item.quantidade_origem,
        unidade_estoque: sku.unidade_estoque,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: item.justificativa ?? null,
        status: 'erro',
        erro_codigo: 'SKU_SEM_CONTROLE_ESTOQUE',
        erro_mensagem: `O SKU "${sku.codigo} - ${sku.nome}" está configurado para não controlar estoque. Altere em Cadastros → SKUs.`,
      })
      continue
    }

    // V4: Quantidade > 0
    const qtdOrigem = Number(item.quantidade_origem)
    if (isNaN(qtdOrigem) || qtdOrigem <= 0) {
      resultadoItens.push({
        linha: item.linha,
        codigo_parceiro: codigoParceiroTrim,
        sku_id: sku.id,
        sku_codigo: sku.codigo,
        sku_nome: sku.nome,
        unidade_origem: item.unidade_origem,
        quantidade_origem: item.quantidade_origem,
        unidade_estoque: sku.unidade_estoque,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: item.justificativa ?? null,
        status: 'erro',
        erro_codigo: 'QUANTIDADE_INVALIDA',
        erro_mensagem: `A quantidade informada (${item.quantidade_origem}) é inválida. A quantidade deve ser maior que zero.`,
      })
      continue
    }

    // Justificativa opcional (lote_tela e demais origens)
    const just = item.justificativa?.trim() || null

    // V3: Conversão de Unidade de Medida
    const umOrigem = (item.unidade_origem || sku.unidade_estoque || 'UN').trim().toUpperCase()
    const umEstoque = (sku.unidade_estoque || 'UN').trim().toUpperCase()

    let fator: number | null = 1
    if (umOrigem !== umEstoque) {
      fator = await resolveFatorConversao({
        empresaId: empresa_id,
        origem: umOrigem,
        destino: umEstoque,
        skuId: sku.id,
        client,
      })
    }

    if (fator === null || isNaN(fator) || fator <= 0) {
      resultadoItens.push({
        linha: item.linha,
        codigo_parceiro: codigoParceiroTrim,
        sku_id: sku.id,
        sku_codigo: sku.codigo,
        sku_nome: sku.nome,
        unidade_origem: umOrigem,
        quantidade_origem: qtdOrigem,
        unidade_estoque: umEstoque,
        quantidade_estoque: null,
        fator_conversao: null,
        justificativa: just,
        status: 'erro',
        erro_codigo: 'CONVERSAO_NAO_ENCONTRADA',
        erro_mensagem: `Unidade de origem "${umOrigem}" difere da unidade de estoque "${umEstoque}" do SKU "${sku.codigo}" e não há conversão cadastrada (específica ou genérica) em Cadastros → Conversões UM. Ex.: 1 ${umOrigem} = N ${umEstoque}.`,
      })
      continue
    }

    // Item válido!
    const qtdEstoque = Math.round(qtdOrigem * fator * 10000) / 10000
    resultadoItens.push({
      linha: item.linha,
      codigo_parceiro: codigoParceiroTrim,
      sku_id: sku.id,
      sku_codigo: sku.codigo,
      sku_nome: sku.nome,
      unidade_origem: umOrigem,
      quantidade_origem: qtdOrigem,
      unidade_estoque: umEstoque,
      quantidade_estoque: qtdEstoque,
      fator_conversao: fator,
      justificativa: just,
      status: 'ok',
      erro_codigo: null,
      erro_mensagem: null,
    })
  }

  const itensValidos = resultadoItens.filter((i) => i.status === 'ok').length
  const itensComErro = resultadoItens.filter((i) => i.status === 'erro').length

  let statusSugerido: ResultadoValidacaoLote['statusSugerido'] = 'concluido'
  let erroResumo: string | null = null

  if (itensValidos === 0 && itensComErro > 0) {
    statusSugerido = 'erro'
    erroResumo = `Nenhum item válido para entrada (${itensComErro} com erro).`
  } else if (itensComErro > 0) {
    statusSugerido = 'parcial'
    erroResumo = `${itensComErro} de ${resultadoItens.length} itens apresentaram erro e não serão efetivados.`
  }

  return {
    validoParaEfetivar: itensValidos > 0,
    totalItens: resultadoItens.length,
    itensValidos,
    itensComErro,
    statusSugerido,
    erroResumo,
    itens: resultadoItens,
  }
}
