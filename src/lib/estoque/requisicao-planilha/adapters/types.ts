import type { CanonicalReqRow, PlanilhaAdapterCodigo, PlanilhaAdapterMeta } from '../types'
import { ADDON_ADAPTER_ATC } from '../types'

export type AdapterContext = {
  empresaId: string
  /** Matrícula (codigo_externo) → { id, documento, nome } — preenchido pelo caller no adapter ATC */
  pessoasPorMatricula?: Map<
    string,
    { id: string; documento: string | null; nome: string }
  >
}

export type PlanilhaAdapter = PlanilhaAdapterMeta & {
  toCanonical(
    matrix: string[][],
    ctx: AdapterContext
  ): { rows: CanonicalReqRow[]; erros: string[] }
}

export const ADAPTER_METAS: PlanilhaAdapterMeta[] = [
  {
    codigo: 'hugin_padrao',
    label: 'Padrão Hugin Flow',
    hint: 'Colunas: codigo_origem, sistema_origem, requisitante_documento, requisitante_nome, sku_codigo, quantidade, observacao',
    addonCodigo: null,
  },
  {
    codigo: 'cliente_atc_legado',
    label: 'Cliente ATC (legado suprimentos)',
    hint: 'Export BSC/suprimentos — transformado para o padrão Hugin',
    addonCodigo: ADDON_ADAPTER_ATC,
  },
]

export function adaptersDisponiveis(
  addons: Record<string, boolean>,
  isSuperAdmin = false
): PlanilhaAdapterMeta[] {
  return ADAPTER_METAS.filter((a) => {
    if (!a.addonCodigo) return true
    if (isSuperAdmin) return true
    return addons[a.addonCodigo] === true
  })
}

export function isAdapterCodigo(v: string): v is PlanilhaAdapterCodigo {
  return ADAPTER_METAS.some((a) => a.codigo === v)
}
