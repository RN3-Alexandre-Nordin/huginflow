import type { ContractFillData } from './types'
import { CONTRACT_REQUIRED_FIELDS } from './types'

export type EmpresaRow = Record<string, unknown>

function formatContractDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function contractDataFromEmpresa(empresa: EmpresaRow, referenceDate = new Date()): ContractFillData {
  const razaoSocial = String(empresa.nome ?? '').trim()
  const representanteNome = String(empresa.responsavel_nome ?? '').trim()
  const representanteCpf = String(empresa.responsavel_cpf ?? '').trim()
  const representanteCargo = String(empresa.responsavel_cargo ?? '').trim()

  return {
    razaoSocial,
    tipoSocietario: String(empresa.tipo_societario ?? '').trim(),
    cnpj: String(empresa.cnpj ?? '').trim(),
    endereco: String(empresa.endereco ?? '').trim(),
    cidade: String(empresa.cidade ?? '').trim(),
    representanteNome,
    representanteCpf,
    representanteNacionalidade: String(empresa.responsavel_nacionalidade ?? '').trim(),
    representanteEstadoCivil: String(empresa.responsavel_estado_civil ?? '').trim(),
    representanteProfissao: String(empresa.responsavel_profissao ?? '').trim(),
    representanteCargo,
    representanteEmail: String(empresa.responsavel_email ?? '').trim(),
    representanteTelefone: String(empresa.responsavel_telefone ?? '').trim(),
    representanteLinha: [representanteNome, representanteCpf && `CPF ${representanteCpf}`, representanteCargo]
      .filter(Boolean)
      .join(', '),
    dataContrato: formatContractDate(referenceDate),
    servicosExtras: [],
    hasContratoComercial: false,
    dataInicioPrestacao: '',
    prazoVigencia: '',
    planoContratado: '',
    valorSetup: '',
    meioPagamentoSetup: '',
    valorMensalidade: '',
    diaVencimentoMensal: '',
    limiteUsuarios: '',
    numeroOs: '',
    testemunha1Nome: '',
    testemunha1Cpf: '',
    testemunha2Nome: '',
    testemunha2Cpf: '',
  }
}

export function getMissingContractFields(data: ContractFillData): string[] {
  const missing: string[] = []
  for (const field of CONTRACT_REQUIRED_FIELDS) {
    if (!data[field.key]?.trim()) {
      missing.push(field.label)
    }
  }
  if (!data.cidade.trim()) {
    missing.push('Cidade (sede) — recomendado para o campo Local')
  }
  return missing
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
