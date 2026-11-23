/**
 * Planilha canônica de requisição (§10.8) + adaptadores cobráveis.
 * O core só grava linhas CanonicalReqRow.
 */

export type CanonicalReqRow = {
  /** Índice 1-based na planilha (após header) */
  linha: number
  requisitante_documento: string
  /** Matrícula/código externo. O adapter ATC resolve a pessoa por este campo. */
  requisitante_codigo_externo?: string
  /** Nome como veio na origem (rastreio; não substitui match por documento) */
  requisitante_nome?: string
  sku_codigo: string
  quantidade: number
  observacao?: string
  /** ID da requisição no sistema de origem — agrupa 1:1 */
  codigo_origem?: string
  /** Ex.: atc_suprimentos, sap, planilha */
  sistema_origem?: string
}

export type PlanilhaAdapterCodigo = 'hugin_padrao' | 'cliente_atc_legado'

export type PlanilhaAdapterMeta = {
  codigo: PlanilhaAdapterCodigo
  label: string
  hint: string
  /** Addon que libera este adapter (null = incluso no estoque) */
  addonCodigo: string | null
}

export type CanonicalReqRowErro = CanonicalReqRow & {
  erro?: string
  codigo_erro?: string
}

export type RequisicaoPlanilhaGrupoPreview = {
  codigo_origem: string | null
  sistema_origem: string | null
  requisitante_documento: string
  requisitante_pessoa_id: string | null
  /** Nome cadastrado em Pessoas (se achou) */
  requisitante_nome: string | null
  /** Nome texto da planilha / origem */
  requisitante_nome_origem: string | null
  observacao: string | null
  ja_existe?: boolean
  numero_existente?: string | null
  itens: Array<{
    linha: number
    sku_codigo: string
    sku_id: string | null
    sku_nome: string | null
    quantidade: number
    erro?: string
    codigo_erro?: string
  }>
  erro_cabecalho?: string
  codigo_erro_cabecalho?: string
}

/** Motivo único de bloqueio do grupo. `null` = apto a criar a requisição inteira. */
export function motivoBloqueioGrupo(
  g: RequisicaoPlanilhaGrupoPreview
): string | null {
  if (g.ja_existe || g.erro_cabecalho) {
    return g.erro_cabecalho || 'Requisição de origem já importada.'
  }
  if (!g.requisitante_pessoa_id) {
    return 'Requisitante não resolvido.'
  }
  if (g.itens.length === 0) {
    return 'Grupo sem itens.'
  }
  const ruins = g.itens.filter((i) => i.erro || !i.sku_id)
  if (ruins.length > 0) {
    const detalhe = ruins
      .map((i) => {
        const material = i.sku_codigo.trim() || '(material vazio)'
        return `linha ${i.linha} · ${material}: ${i.erro || 'SKU não resolvido'}`
      })
      .join('; ')
    return `Grupo bloqueado: um item inválido impede a requisição inteira (${detalhe}).`
  }
  return null
}

export const CANONICAL_HEADERS = [
  'codigo_origem',
  'sistema_origem',
  'requisitante_documento',
  'requisitante_nome',
  'sku_codigo',
  'quantidade',
  'observacao',
] as const

export const ADDON_ADAPTER_ATC = 'estoque_req_adapter_atc'
