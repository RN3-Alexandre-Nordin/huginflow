export const PESSOA_PAPEIS = [
  { value: 'lead', label: 'Lead' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'funcionario', label: 'Funcionário' },
  { value: 'transportador', label: 'Transportador' },
  { value: 'parceiro', label: 'Parceiro' },
  { value: 'prestador', label: 'Prestador' },
  { value: 'contato', label: 'Contato' },
] as const

export type PessoaPapel = (typeof PESSOA_PAPEIS)[number]['value']

export const PESSOA_NATUREZAS = [
  { value: 'pf', label: 'Pessoa física' },
  { value: 'pj', label: 'Pessoa jurídica' },
] as const

export type PessoaNatureza = (typeof PESSOA_NATUREZAS)[number]['value']

export const PESSOA_STATUS = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'bloqueado', label: 'Bloqueado' },
] as const

export const PESSOA_PREFERENCIAS_CONTATO = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
] as const

export const PESSOA_FORM_SECTIONS = [
  { id: 'identidade', label: 'Identidade', hint: 'Papéis, PF/PJ e documentos' },
  { id: 'contato', label: 'Contato', hint: 'Telefones, e-mails e preferência' },
  { id: 'endereco', label: 'Endereço', hint: 'Localização principal' },
  { id: 'comercial', label: 'Comercial', hint: 'Origem, cargo e relacionamento' },
  { id: 'fiscal', label: 'Fiscal', hint: 'Regime e contribuições' },
  { id: 'financeiro', label: 'Financeiro', hint: 'PIX e dados bancários' },
] as const

export type PessoaFormSectionId = (typeof PESSOA_FORM_SECTIONS)[number]['id']

export type PessoaRecord = {
  id?: string
  nome: string
  nome_fantasia?: string | null
  natureza?: PessoaNatureza | null
  papeis?: string[] | null
  documento?: string | null
  rg_ie?: string | null
  inscricao_municipal?: string | null
  email?: string | null
  email_financeiro?: string | null
  telefone?: string | null
  telefone_2?: string | null
  whatsapp?: string | null
  site?: string | null
  preferencia_contato?: string | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  pais?: string | null
  canal_id?: string | null
  origem_detalhe?: string | null
  cargo?: string | null
  empresa_cliente?: string | null
  observacoes?: string | null
  status_relacionamento?: string | null
  ativo?: boolean | null
  optante_simples?: boolean | null
  regime_tributario?: string | null
  pix?: string | null
  banco?: string | null
  agencia?: string | null
  conta?: string | null
}

export function parsePapeisFromForm(formData: FormData): string[] {
  const raw = formData.getAll('papeis').map((v) => String(v).trim()).filter(Boolean)
  const allowed = new Set(PESSOA_PAPEIS.map((p) => p.value))
  const unique = [...new Set(raw.filter((p) => allowed.has(p as PessoaPapel)))]
  return unique.length > 0 ? unique : ['lead']
}

export function labelPapel(value: string): string {
  return PESSOA_PAPEIS.find((p) => p.value === value)?.label ?? value
}

export function pessoaPayloadFromForm(formData: FormData) {
  const str = (key: string) => {
    const v = formData.get(key)
    if (v == null) return null
    const s = String(v).trim()
    return s.length ? s : null
  }

  const naturezaRaw = str('natureza') || 'pf'
  const natureza = naturezaRaw === 'pj' ? 'pj' : 'pf'

  return {
    nome: String(formData.get('nome') ?? '').trim(),
    nome_fantasia: str('nome_fantasia'),
    natureza,
    papeis: parsePapeisFromForm(formData),
    documento: str('documento'),
    rg_ie: str('rg_ie'),
    inscricao_municipal: str('inscricao_municipal'),
    email: str('email'),
    email_financeiro: str('email_financeiro'),
    telefone: str('telefone'),
    telefone_2: str('telefone_2'),
    whatsapp: str('whatsapp'),
    site: str('site'),
    preferencia_contato: str('preferencia_contato'),
    cep: str('cep'),
    logradouro: str('logradouro'),
    numero: str('numero'),
    complemento: str('complemento'),
    bairro: str('bairro'),
    cidade: str('cidade'),
    uf: str('uf')?.toUpperCase() ?? null,
    pais: str('pais') || 'BR',
    canal_id: str('canal_id'),
    origem_detalhe: str('origem_detalhe'),
    cargo: str('cargo'),
    empresa_cliente: str('empresa_cliente'),
    observacoes: str('observacoes'),
    status_relacionamento: str('status_relacionamento') || 'ativo',
    ativo: formData.get('ativo') === 'on' || formData.get('ativo') === 'true',
    optante_simples: formData.get('optante_simples') === 'on' || formData.get('optante_simples') === 'true',
    regime_tributario: str('regime_tributario'),
    pix: str('pix'),
    banco: str('banco'),
    agencia: str('agencia'),
    conta: str('conta'),
  }
}
