export const PEDIDO_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  recebido_parcial: 'Recebido parcial',
  recebido: 'Recebido',
}

export function pedidoEditavel(status: string) {
  return status === 'aguardando_aprovacao' || status === 'aprovado' || status === 'recusado'
}

export function pedidoRecebivel(status: string) {
  return status === 'aprovado' || status === 'recebido_parcial'
}

export function pedidoTemPdf(status: string) {
  return status === 'aprovado' || status === 'recebido_parcial' || status === 'recebido'
}
