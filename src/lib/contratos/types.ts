export interface ContractServicoExtra {
  descricao: string
  observacao?: string
}

export interface ContractFillData {
  razaoSocial: string
  tipoSocietario: string
  cnpj: string
  endereco: string
  cidade: string
  representanteNome: string
  representanteCpf: string
  representanteNacionalidade: string
  representanteEstadoCivil: string
  representanteProfissao: string
  representanteCargo: string
  representanteEmail: string
  representanteTelefone: string
  representanteLinha: string
  dataContrato: string
  servicosExtras: ContractServicoExtra[]
  hasContratoComercial: boolean
  dataInicioPrestacao: string
  prazoVigencia: string
  planoContratado: string
  valorSetup: string
  meioPagamentoSetup: string
  valorMensalidade: string
  diaVencimentoMensal: string
  limiteUsuarios: string
  numeroOs: string
  testemunha1Nome: string
  testemunha1Cpf: string
  testemunha2Nome: string
  testemunha2Cpf: string
}

export const CONTRACT_REQUIRED_FIELDS: {
  key: keyof ContractFillData
  label: string
  empresaField: string
}[] = [
  { key: 'razaoSocial', label: 'Razão social', empresaField: 'nome' },
  { key: 'tipoSocietario', label: 'Tipo societário', empresaField: 'tipo_societario' },
  { key: 'cnpj', label: 'CNPJ', empresaField: 'cnpj' },
  { key: 'endereco', label: 'Endereço completo', empresaField: 'endereco' },
  { key: 'representanteNome', label: 'Nome do representante', empresaField: 'responsavel_nome' },
  { key: 'representanteCpf', label: 'CPF do representante', empresaField: 'responsavel_cpf' },
  { key: 'representanteNacionalidade', label: 'Nacionalidade', empresaField: 'responsavel_nacionalidade' },
  { key: 'representanteEstadoCivil', label: 'Estado civil', empresaField: 'responsavel_estado_civil' },
  { key: 'representanteProfissao', label: 'Profissão', empresaField: 'responsavel_profissao' },
  { key: 'representanteCargo', label: 'Cargo / qualidade', empresaField: 'responsavel_cargo' },
]
