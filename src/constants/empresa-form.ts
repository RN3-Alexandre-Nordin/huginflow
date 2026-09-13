export type EmpresaFormSectionId =
  | 'corporativo'
  | 'contato'
  | 'financeiro'
  | 'representante'
  | 'addons'
  | 'ia'

export interface EmpresaFormSection {
  id: EmpresaFormSectionId
  label: string
  hint: string
}

export const EMPRESA_FORM_SECTIONS: EmpresaFormSection[] = [
  {
    id: 'corporativo',
    label: 'Corporativo',
    hint: 'Razão social, CNPJ e status do contrato',
  },
  {
    id: 'contato',
    label: 'Contato & Sede',
    hint: 'Canais corporativos e endereço oficial',
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    hint: 'Faturamento, cobrança, NF-e e chave PIX',
  },
  {
    id: 'representante',
    label: 'Representante',
    hint: 'Qualificação jurídica para contrato MSA',
  },
  {
    id: 'addons',
    label: 'Módulos & Addons',
    hint: 'Entitlements de acesso e faturamento',
  },
  {
    id: 'ia',
    label: 'Cérebro IA',
    hint: 'Modelo, silêncio operacional e persona',
  },
]

export interface EmpresaRecord {
  id: string
  nome: string
  tipo_societario?: string | null
  cnpj: string | null
  email: string | null
  telefone: string | null
  website: string | null
  endereco: string | null
  cidade?: string | null
  financeiro_nome?: string | null
  financeiro_email?: string | null
  financeiro_telefone?: string | null
  financeiro_chave_pix?: string | null
  ramo_atividade: string | null
  responsavel_nome: string | null
  responsavel_cargo: string | null
  responsavel_cpf?: string | null
  responsavel_nacionalidade?: string | null
  responsavel_estado_civil?: string | null
  responsavel_profissao?: string | null
  responsavel_email: string | null
  responsavel_telefone: string | null
  ai_context_prompt?: string | null
  ai_model?: string | null
  ia_silence_timeout?: number | null
  ativo: boolean
  status?: string | null
}
