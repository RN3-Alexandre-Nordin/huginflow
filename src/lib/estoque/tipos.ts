export type EstOrigemEntrada = 'lote_tela' | 'planilha' | 'nfe_xml'

export type EstStatusLote = 'rascunho' | 'processando' | 'concluido' | 'erro' | 'parcial'

export type EstStatusItem = 'ok' | 'erro'

export type EstCodigoErroEntrada =
  | 'FORNECEDOR_NAO_CADASTRADO'
  | 'DEPARA_NAO_ENCONTRADO'
  | 'CONVERSAO_NAO_ENCONTRADA'
  | 'SKU_SEM_CONTROLE_ESTOQUE'
  | 'LOCAL_INVALIDO'
  | 'QUANTIDADE_INVALIDA'
  | 'NFE_DUPLICADA'
  | 'XML_INVALIDO'
  | 'JUSTIFICATIVA_OBRIGATORIA'

export interface ItemEntradaInput {
  linha: number
  codigo_parceiro?: string | null
  sku_id?: string | null
  unidade_origem: string
  quantidade_origem: number
  justificativa?: string | null
}

export interface ItemEntradaValidado {
  linha: number
  codigo_parceiro: string | null
  sku_id: string | null
  sku_codigo?: string
  sku_nome?: string
  unidade_origem: string
  quantidade_origem: number
  unidade_estoque: string | null
  quantidade_estoque: number | null
  fator_conversao: number | null
  justificativa: string | null
  status: EstStatusItem
  erro_codigo: EstCodigoErroEntrada | null
  erro_mensagem: string | null
}

export interface LoteEntradaInput {
  empresa_id: string
  origem: EstOrigemEntrada
  pessoa_id: string
  local_id: string
  documento?: string | null
  nfe_chave?: string | null
  nfe_xml_nome?: string | null
  observacao?: string | null
  usuario_id?: string | null
  movimento_em?: string
  itens: ItemEntradaInput[]
}

export interface ResultadoValidacaoLote {
  validoParaEfetivar: boolean
  totalItens: number
  itensValidos: number
  itensComErro: number
  statusSugerido: EstStatusLote
  erroResumo: string | null
  itens: ItemEntradaValidado[]
}
