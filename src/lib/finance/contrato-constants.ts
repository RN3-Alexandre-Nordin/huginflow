export const CONTRATO_SETUP_MEIOS = [
  { value: 'pix', label: 'PIX' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'transferencia', label: 'Depósito bancário' },
  { value: 'boleto', label: 'Boleto' },
] as const

export type ContratoSetupMeio = (typeof CONTRATO_SETUP_MEIOS)[number]['value']

export const CONTRATO_STATUS = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'suspenso', label: 'Suspenso' },
  { value: 'encerrado', label: 'Encerrado' },
  { value: 'cancelado', label: 'Cancelado' },
] as const

export const CONTRATO_INDICE_REAJUSTE = [
  { value: '', label: '— Não definido —' },
  { value: 'nenhum', label: 'Sem reajuste' },
  { value: 'ipca', label: 'IPCA' },
  { value: 'igpm', label: 'IGP-M' },
  { value: 'outro', label: 'Outro' },
] as const

export const CONTRATO_STATUS_COLOR: Record<string, string> = {
  rascunho: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  ativo: 'text-[#80B828] bg-[#80B828]/10 border-[#80B828]/20',
  suspenso: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  encerrado: 'text-[#2BAADF] bg-[#2BAADF]/10 border-[#2BAADF]/20',
  cancelado: 'text-red-400 bg-red-500/10 border-red-500/20',
}

export type ContratoStatus = (typeof CONTRATO_STATUS)[number]['value']
