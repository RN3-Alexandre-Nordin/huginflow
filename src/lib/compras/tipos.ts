export const TIPOS_COMPRA = ['produtivo', 'consumo', 'servico'] as const
export type TipoCompra = (typeof TIPOS_COMPRA)[number]

export const TIPO_COMPRA_LABEL: Record<TipoCompra, string> = {
  produtivo: 'Material produtivo',
  consumo: 'Material não produtivo',
  servico: 'Serviço',
}

export function tipoCompraValido(value: string): value is TipoCompra {
  return (TIPOS_COMPRA as readonly string[]).includes(value)
}

export type ComConfig = {
  empresa_id: string
  aprovacao_ativa: boolean
  nivel1_grupo_id: string | null
  /** Até este valor, sem alçada. Acima dele, exige a 1ª. */
  nivel1_teto: number | null
  nivel2_grupo_id: string | null
  /** Acima deste valor, exige a 2ª alçada. */
  nivel2_a_partir: number | null
}

/**
 * Quantos níveis o valor exige.
 * Ex.: teto 500 e 2ª a partir de 5000 → até 500 nenhum, até 5000 um, acima de 5000 dois.
 * 0 também quando a alçada está desligada.
 */
export function niveisExigidos(config: ComConfig | null, valor: number): 0 | 1 | 2 {
  if (!config?.aprovacao_ativa) return 0
  const ateSemAlcada = config.nivel1_teto == null ? 0 : Number(config.nivel1_teto)
  if (valor <= ateSemAlcada) return 0
  const segunda = config.nivel2_a_partir
  if (!config.nivel2_grupo_id || segunda == null) return 1
  return valor > Number(segunda) ? 2 : 1
}
