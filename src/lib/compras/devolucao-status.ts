export const DEVOLUCAO_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
}

export const DEVOLUCAO_MOTIVO_LABEL: Record<string, string> = {
  trocado: 'SKU trocado',
  avaria: 'Avaria',
  outro: 'Outro',
}

export function pedidoPodeDevolver(status: string) {
  return status === 'recebido' || status === 'recebido_parcial'
}
