/**
 * Planejamento de filtros do Cardex (Performance SaaS).
 * Fonte única para página + scripts/agent — evita OR(ilike)+sku_id que estoura timeout.
 */

/**
 * Padrão ILIKE seguro para PostgREST (hífen/especiais, ex.: DEST-011).
 * @param {string} term
 */
export function postgrestIlikePattern(term) {
  const clean = String(term ?? '')
    .trim()
    .replace(/"/g, '')
  if (!clean) return null
  return `"%${clean}%"`
}

/**
 * @typedef {'sku_ids' | 'pessoa_ids' | 'sku_or_pessoa' | 'documento_motivo' | 'none'} CardexSearchMode
 *
 * @typedef {{
 *   mode: CardexSearchMode
 *   skuIds: string[]
 *   pessoaIds: string[]
 *   likePat: string | null
 *   countMode: 'exact' | 'estimated'
 * }} CardexSearchPlan
 */

/**
 * Decide como filtrar est_movimentos a partir da busca livre.
 * Regra: se o termo resolveu SKU/pessoa, filtrar por ID (índice).
 * ILIKE em documento/motivo só quando não há match de cadastro.
 *
 * @param {{
 *   term?: string | null
 *   skuIdsFromQ?: string[]
 *   pessoaIdsFromQ?: string[]
 *   skuIdFilter?: string | null
 *   pessoaIdFilter?: string | null
 * }} input
 * @returns {CardexSearchPlan}
 */
export function planCardexTextSearch(input) {
  const term = String(input.term ?? '').trim()
  const skuIds = [...new Set((input.skuIdsFromQ ?? []).filter(Boolean))]
  const pessoaIds = [...new Set((input.pessoaIdsFromQ ?? []).filter(Boolean))]
  const skuIdFilter = input.skuIdFilter || null
  const pessoaIdFilter = input.pessoaIdFilter || null

  if (!term) {
    return {
      mode: 'none',
      skuIds: [],
      pessoaIds: [],
      likePat: null,
      countMode: 'exact',
    }
  }

  const likePat = postgrestIlikePattern(term)
  const useSku = skuIds.length > 0 && !skuIdFilter
  const usePessoa = pessoaIds.length > 0 && !pessoaIdFilter

  if (useSku && usePessoa) {
    return {
      mode: 'sku_or_pessoa',
      skuIds,
      pessoaIds,
      likePat: null,
      countMode: 'estimated',
    }
  }
  if (useSku) {
    return {
      mode: 'sku_ids',
      skuIds,
      pessoaIds: [],
      likePat: null,
      countMode: 'estimated',
    }
  }
  if (usePessoa) {
    return {
      mode: 'pessoa_ids',
      skuIds: [],
      pessoaIds,
      likePat: null,
      countMode: 'estimated',
    }
  }

  return {
    mode: 'documento_motivo',
    skuIds: [],
    pessoaIds: [],
    likePat,
    countMode: 'estimated',
  }
}

/**
 * Detecta plano legado perigoso (OR de ilike + ids) — não deve ser usado.
 * @param {string[]} orParts
 */
export function isUnsafeCardexOrPlan(orParts) {
  const parts = orParts || []
  const hasIlike = parts.some((p) => /ilike/i.test(p))
  const hasIdIn = parts.some((p) => /sku_id\.in|pessoa_id\.in/i.test(p))
  return hasIlike && hasIdIn
}
