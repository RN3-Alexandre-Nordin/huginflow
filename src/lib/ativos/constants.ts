export const ATIVO_STATUS = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'em_uso', label: 'Em uso' },
  { value: 'em_manutencao', label: 'Em manutenção' },
  { value: 'baixado', label: 'Baixado' },
  { value: 'alienado', label: 'Alienado' },
] as const

export type AtivoStatus = (typeof ATIVO_STATUS)[number]['value']

export const ATIVO_FORM_SECTIONS = [
  { id: 'identidade', label: 'Identidade', hint: 'Código, patrimônio e SKU' },
  { id: 'aquisicao', label: 'Aquisição', hint: 'Valores, NF e fornecedor' },
  { id: 'depreciacao', label: 'Depreciação', hint: 'Fórmula e vida útil' },
  { id: 'localizacao', label: 'Localização', hint: 'Local físico e centro de custo' },
  { id: 'situacao', label: 'Situação', hint: 'Status e baixa' },
] as const

export type AtivoFormSectionId = (typeof ATIVO_FORM_SECTIONS)[number]['id']

export type AtivoRecord = {
  id?: string
  codigo: string
  nome: string
  descricao?: string | null
  numero_patrimonio?: string | null
  numero_serie?: string | null
  categoria?: string | null
  sku_id?: string | null
  data_aquisicao?: string | null
  valor_aquisicao?: number | string | null
  valor_residual?: number | string | null
  moeda?: string | null
  nf_compra?: string | null
  fornecedor_id?: string | null
  formula_depreciacao_id?: string | null
  vida_util_meses?: number | string | null
  data_inicio_depreciacao?: string | null
  taxa_anual_pct?: number | string | null
  valor_contabil_atual?: number | string | null
  localizacao?: string | null
  departamento_id?: string | null
  responsavel_id?: string | null
  status?: AtivoStatus | string | null
  data_baixa?: string | null
  motivo_baixa?: string | null
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
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function int(formData: FormData, key: string) {
  const n = num(formData, key)
  if (n == null) return null
  return Math.trunc(n)
}

export function ativoPayloadFromForm(formData: FormData) {
  const statusRaw = str(formData, 'status') || 'em_uso'
  const status = ATIVO_STATUS.some((s) => s.value === statusRaw)
    ? statusRaw
    : 'em_uso'

  return {
    codigo: String(formData.get('codigo') ?? '').trim().toUpperCase(),
    nome: String(formData.get('nome') ?? '').trim(),
    descricao: str(formData, 'descricao'),
    numero_patrimonio: str(formData, 'numero_patrimonio'),
    numero_serie: str(formData, 'numero_serie'),
    categoria: str(formData, 'categoria'),
    sku_id: str(formData, 'sku_id'),
    data_aquisicao: str(formData, 'data_aquisicao'),
    valor_aquisicao: num(formData, 'valor_aquisicao'),
    valor_residual: num(formData, 'valor_residual'),
    moeda: str(formData, 'moeda') || 'BRL',
    nf_compra: str(formData, 'nf_compra'),
    fornecedor_id: str(formData, 'fornecedor_id'),
    formula_depreciacao_id: str(formData, 'formula_depreciacao_id'),
    vida_util_meses: int(formData, 'vida_util_meses'),
    data_inicio_depreciacao: str(formData, 'data_inicio_depreciacao'),
    taxa_anual_pct: num(formData, 'taxa_anual_pct'),
    valor_contabil_atual: num(formData, 'valor_contabil_atual'),
    localizacao: str(formData, 'localizacao'),
    departamento_id: str(formData, 'departamento_id'),
    responsavel_id: str(formData, 'responsavel_id'),
    status,
    data_baixa: str(formData, 'data_baixa'),
    motivo_baixa: str(formData, 'motivo_baixa'),
    observacoes: str(formData, 'observacoes'),
    ativo: formData.get('ativo') === 'on' || formData.get('ativo') === 'true',
  }
}
