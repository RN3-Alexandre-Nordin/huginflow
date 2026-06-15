export const FINANCE_TIPOS = [
  { value: 'setup', label: 'Setup (implantação)' },
  { value: 'mensalidade', label: 'Mensalidade' },
  { value: 'extra', label: 'Extra / avulso' },
] as const

export const FINANCE_MEIOS_PAGAMENTO = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'outro', label: 'Outro' },
] as const

export type FinanceTipo = (typeof FINANCE_TIPOS)[number]['value']
export type FinanceMeioPagamento = (typeof FINANCE_MEIOS_PAGAMENTO)[number]['value']

export const FINANCE_STATUS_LABEL: Record<string, string> = {
  aberta: 'Em aberto',
  vencida: 'Vencida',
  paga_parcial: 'Paga parcial',
  paga: 'Paga',
  cancelada: 'Cancelada',
}

export const FINANCE_STATUS_COLOR: Record<string, string> = {
  aberta: 'text-[#2BAADF] bg-[#2BAADF]/10 border-[#2BAADF]/20',
  vencida: 'text-red-400 bg-red-500/10 border-red-500/20',
  paga_parcial: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  paga: 'text-[#80B828] bg-[#80B828]/10 border-[#80B828]/20',
  cancelada: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
}
