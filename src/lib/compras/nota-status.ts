export const NOTA_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
}

export const PEDIDO_PODE_NOTA = ['aprovado', 'recebido_parcial', 'recebido'] as const

export function pedidoPodeNota(status: string) {
  return (PEDIDO_PODE_NOTA as readonly string[]).includes(status)
}
