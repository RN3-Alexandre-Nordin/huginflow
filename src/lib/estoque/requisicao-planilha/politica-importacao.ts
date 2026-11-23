import type { PlanilhaAdapterCodigo } from './types'

export type PoliticaImportacaoRequisicao = {
  autoAtender: boolean
  aprovadaNaOrigem: boolean
}

type ConfigAutoAtender = {
  req_planilha_auto_atender?: boolean | null
} | null

/**
 * Atlas chega aprovada no sistema de origem e só é baixada manualmente.
 * Hugin padrão segue `req_planilha_auto_atender` e a aprovação interna.
 */
export function politicaImportacaoRequisicao(
  adapter: PlanilhaAdapterCodigo,
  config?: ConfigAutoAtender
): PoliticaImportacaoRequisicao {
  if (adapter === 'cliente_atc_legado') {
    return { autoAtender: false, aprovadaNaOrigem: true }
  }
  return {
    autoAtender: Boolean(config?.req_planilha_auto_atender),
    aprovadaNaOrigem: false,
  }
}

/** Parâmetros da efetivação. `executarAtendimento` é o único gate de `atenderRequisicao`. */
export function planoEfetivacaoRequisicaoPlanilha(
  adapter: PlanilhaAdapterCodigo,
  config: ConfigAutoAtender | undefined,
  enviarInformado?: boolean
) {
  const politica = politicaImportacaoRequisicao(adapter, config)
  return {
    autoAtender: politica.autoAtender,
    aprovada_na_origem: politica.aprovadaNaOrigem,
    enviar_imediatamente: politica.aprovadaNaOrigem
      ? true
      : politica.autoAtender
        ? false
        : Boolean(enviarInformado),
    executarAtendimento: politica.autoAtender,
  }
}
