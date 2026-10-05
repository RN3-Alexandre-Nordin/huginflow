export const SKU_TIPOS = [
  { value: 'produto', label: 'Produto' },
  { value: 'servico', label: 'Serviço' },
] as const

export type SkuTipo = (typeof SKU_TIPOS)[number]['value']

export const SKU_NATUREZAS = [
  { value: 'fisico', label: 'Físico' },
  { value: 'digital', label: 'Digital' },
  { value: 'servico', label: 'Serviço' },
] as const

export const SKU_UNIDADES = [
  'UN',
  'PC',
  'CX',
  'KG',
  'G',
  'L',
  'ML',
  'M',
  'M2',
  'M3',
  'PAR',
  'H',
  'DIA',
  'MES',
  'KIT',
] as const

export const SKU_FORM_SECTIONS = [
  { id: 'identidade', label: 'Identidade', hint: 'Código, tipo e descrição' },
  { id: 'unidades', label: 'Unidades', hint: 'UM venda, compra e estoque' },
  { id: 'comercial', label: 'Comercial', hint: 'Preços e moeda' },
  { id: 'estoque', label: 'Estoque', hint: 'Reposição, mínimos e fornecedor' },
  { id: 'fiscal', label: 'Fiscal', hint: 'Legado · PIS/COFINS · Reforma' },
] as const

export type SkuFormSectionId = (typeof SKU_FORM_SECTIONS)[number]['id']

export type SkuRecord = {
  id?: string
  codigo: string
  nome: string
  nome_fiscal?: string | null
  descricao?: string | null
  tipo?: SkuTipo | null
  natureza?: string | null
  codigo_barras?: string | null
  unidade_venda?: string | null
  unidade_compra?: string | null
  unidade_estoque?: string | null
  preco_venda?: number | string | null
  preco_custo?: number | string | null
  moeda?: string | null
  controla_estoque?: boolean | null
  ponto_reposicao?: number | string | null
  estoque_minimo?: number | string | null
  estoque_maximo?: number | string | null
  lead_time_dias?: number | string | null
  fornecedor_padrao_id?: string | null
  ncm?: string | null
  cest?: string | null
  origem_mercadoria?: string | null
  cfop_venda_dentro?: string | null
  cfop_venda_fora?: string | null
  cst_icms?: string | null
  csosn?: string | null
  aliq_icms?: number | string | null
  aliq_ipi?: number | string | null
  aliq_pis?: number | string | null
  aliq_cofins?: number | string | null
  cst_pis?: string | null
  cst_cofins?: string | null
  cst_ipi?: string | null
  codigo_servico_lc116?: string | null
  codigo_servico_municipal?: string | null
  cnae_servico?: string | null
  iss_retido?: boolean | null
  aliq_iss?: number | string | null
  municipio_prestacao_ibge?: string | null
  nbs?: string | null
  class_trib_ibs_cbs?: string | null
  cst_ibs?: string | null
  cst_cbs?: string | null
  cst_is?: string | null
  aliq_ibs?: number | string | null
  aliq_ibs_uf?: number | string | null
  aliq_ibs_mun?: number | string | null
  aliq_cbs?: number | string | null
  aliq_is?: number | string | null
  perc_red_ibs?: number | string | null
  perc_red_cbs?: number | string | null
  observacoes?: string | null
  ativo?: boolean | null
}

function str(formData: FormData, key: string) {
  const v = formData.get(key)
  if (v == null) return null
  const s = String(v).trim()
  return s.length ? s : null
}

function num(formData: FormData, key: string) {
  const raw = str(formData, key)
  if (raw == null) return null
  let s = raw.replace(/\s/g, '')
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function int(formData: FormData, key: string) {
  const n = num(formData, key)
  if (n == null) return null
  return Math.trunc(n)
}

export function skuPayloadFromForm(formData: FormData) {
  const tipoRaw = str(formData, 'tipo') || 'produto'
  const tipo: SkuTipo = tipoRaw === 'servico' ? 'servico' : 'produto'

  return {
    codigo: String(formData.get('codigo') ?? '').trim().toUpperCase(),
    nome: String(formData.get('nome') ?? '').trim(),
    nome_fiscal: str(formData, 'nome_fiscal'),
    descricao: str(formData, 'descricao'),
    tipo,
    natureza: str(formData, 'natureza'),
    codigo_barras: str(formData, 'codigo_barras'),
    unidade_venda: (str(formData, 'unidade_venda') || 'UN').toUpperCase(),
    unidade_compra: (str(formData, 'unidade_compra') || 'UN').toUpperCase(),
    unidade_estoque: (str(formData, 'unidade_estoque') || 'UN').toUpperCase(),
    preco_venda: num(formData, 'preco_venda'),
    preco_custo: num(formData, 'preco_custo'),
    moeda: str(formData, 'moeda') || 'BRL',
    controla_estoque:
      formData.get('controla_estoque') === 'on' || formData.get('controla_estoque') === 'true',
    ponto_reposicao: num(formData, 'ponto_reposicao'),
    estoque_minimo: num(formData, 'estoque_minimo'),
    estoque_maximo: num(formData, 'estoque_maximo'),
    lead_time_dias: int(formData, 'lead_time_dias'),
    fornecedor_padrao_id: str(formData, 'fornecedor_padrao_id'),
    ncm: str(formData, 'ncm'),
    cest: str(formData, 'cest'),
    origem_mercadoria: str(formData, 'origem_mercadoria'),
    cfop_venda_dentro: str(formData, 'cfop_venda_dentro'),
    cfop_venda_fora: str(formData, 'cfop_venda_fora'),
    cst_icms: str(formData, 'cst_icms'),
    csosn: str(formData, 'csosn'),
    aliq_icms: num(formData, 'aliq_icms'),
    aliq_ipi: num(formData, 'aliq_ipi'),
    aliq_pis: num(formData, 'aliq_pis'),
    aliq_cofins: num(formData, 'aliq_cofins'),
    cst_pis: str(formData, 'cst_pis'),
    cst_cofins: str(formData, 'cst_cofins'),
    cst_ipi: str(formData, 'cst_ipi'),
    codigo_servico_lc116: str(formData, 'codigo_servico_lc116'),
    codigo_servico_municipal: str(formData, 'codigo_servico_municipal'),
    cnae_servico: str(formData, 'cnae_servico'),
    iss_retido: formData.get('iss_retido') === 'on' || formData.get('iss_retido') === 'true',
    aliq_iss: num(formData, 'aliq_iss'),
    municipio_prestacao_ibge: str(formData, 'municipio_prestacao_ibge'),
    nbs: str(formData, 'nbs'),
    class_trib_ibs_cbs: str(formData, 'class_trib_ibs_cbs'),
    cst_ibs: str(formData, 'cst_ibs'),
    cst_cbs: str(formData, 'cst_cbs'),
    cst_is: str(formData, 'cst_is'),
    aliq_ibs: num(formData, 'aliq_ibs'),
    aliq_ibs_uf: num(formData, 'aliq_ibs_uf'),
    aliq_ibs_mun: num(formData, 'aliq_ibs_mun'),
    aliq_cbs: num(formData, 'aliq_cbs'),
    aliq_is: num(formData, 'aliq_is'),
    perc_red_ibs: num(formData, 'perc_red_ibs'),
    perc_red_cbs: num(formData, 'perc_red_cbs'),
    observacoes: str(formData, 'observacoes'),
    ativo: formData.get('ativo') === 'on' || formData.get('ativo') === 'true',
  }
}

export function conversaoPayloadFromForm(formData: FormData) {
  const origem = (str(formData, 'unidade_origem') || '').toUpperCase()
  const destino = (str(formData, 'unidade_destino') || '').toUpperCase()
  const fator = num(formData, 'fator_conversao')
  const skuRaw = str(formData, 'sku_id')
  return {
    sku_id: skuRaw || null,
    unidade_origem: origem,
    unidade_destino: destino,
    fator_conversao: fator,
  }
}

export function deparaPayloadFromForm(formData: FormData) {
  return {
    sku_id: str(formData, 'sku_id') || '',
    pessoa_id: str(formData, 'pessoa_id') || '',
    codigo_parceiro: str(formData, 'codigo_parceiro') || '',
    observacao: str(formData, 'observacao'),
    ativo: formData.get('ativo') === 'on' || formData.get('ativo') === 'true',
  }
}

/** Várias linhas: depara_sku_id[], depara_pessoa_id[], depara_codigo[] */
export function parseDeparasBulkFromForm(formData: FormData) {
  const skus = formData.getAll('depara_sku_id').map(String)
  const pessoas = formData.getAll('depara_pessoa_id').map(String)
  const codigos = formData.getAll('depara_codigo').map(String)
  const rows: {
    sku_id: string
    pessoa_id: string
    codigo_parceiro: string
    observacao: string | null
    ativo: boolean
  }[] = []
  const seen = new Set<string>()

  for (let i = 0; i < Math.max(skus.length, pessoas.length, codigos.length); i++) {
    const sku_id = (skus[i] || '').trim()
    const pessoa_id = (pessoas[i] || '').trim()
    const codigo_parceiro = (codigos[i] || '').trim()
    if (!sku_id && !pessoa_id && !codigo_parceiro) continue
    if (!sku_id || !pessoa_id || !codigo_parceiro) {
      return { error: `Linha ${i + 1}: preencha SKU, pessoa e código do parceiro (ou deixe a linha vazia).` }
    }
    const key = `${sku_id}:${pessoa_id}`
    if (seen.has(key)) {
      return { error: `Linha ${i + 1}: SKU + pessoa duplicados nesta lista.` }
    }
    seen.add(key)
    rows.push({
      sku_id,
      pessoa_id,
      codigo_parceiro,
      observacao: null,
      ativo: true,
    })
  }

  if (!rows.length) return { error: 'Informe ao menos uma linha completa.' }
  return { rows }
}
