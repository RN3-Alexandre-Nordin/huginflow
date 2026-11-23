import type { PlanilhaAdapterCodigo } from './types'

/**
 * Atlas (cliente_atc_legado): qualquer inconsistência de identificação
 * (matrícula ou data) rejeita a planilha inteira, inclusive grupos válidos.
 * Outros adaptadores seguem a regra por grupo.
 */
export function motivoRejeicaoIntegralPlanilha(
  adapter: PlanilhaAdapterCodigo | string,
  errosIdentificacao: string[]
): string | null {
  if (adapter !== 'cliente_atc_legado') return null
  if (!errosIdentificacao.length) return null
  return errosIdentificacao.join('\n')
}
