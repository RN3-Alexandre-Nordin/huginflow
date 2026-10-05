import { huginPadraoAdapter } from './hugin-padrao'
import { clienteAtcLegadoAdapter } from './cliente-atc-legado'
import type { PlanilhaAdapter } from './types'
import type { PlanilhaAdapterCodigo } from '../types'

const BY_CODIGO: Record<PlanilhaAdapterCodigo, PlanilhaAdapter> = {
  hugin_padrao: huginPadraoAdapter,
  cliente_atc_legado: clienteAtcLegadoAdapter,
}

export function getAdapter(codigo: PlanilhaAdapterCodigo): PlanilhaAdapter {
  return BY_CODIGO[codigo]
}

export { adaptersDisponiveis, isAdapterCodigo, ADAPTER_METAS } from './types'
