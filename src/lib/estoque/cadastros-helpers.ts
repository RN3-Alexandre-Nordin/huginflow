import type { SupabaseClient } from '@supabase/supabase-js'

type LocalRow = {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

export type FornecedorOption = {
  id: string
  nome: string
  documento: string | null
}

export type PessoaEstoqueOption = {
  id: string
  nome: string
  documento: string | null
  papeis: string[]
}

/**
 * Lista pessoas ativas da empresa (qualquer papel: cliente, fornecedor, etc.).
 * Destinatário de remessa / poder de terceiros — sem filtro de papel.
 */
export async function loadPessoasEmpresa(
  supabase: SupabaseClient,
  empresaId: string,
): Promise<PessoaEstoqueOption[]> {
  if (!empresaId) return []

  const { data, error } = await supabase
    .from('crm_leads')
    .select('id, nome, documento, papeis')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('nome')
    .limit(500)

  if (error) {
    console.error('[estoque] loadPessoasEmpresa', error.message)
    return []
  }

  return (data || []).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    documento: (p.documento as string | null) ?? null,
    papeis: Array.isArray(p.papeis) ? (p.papeis as string[]) : [],
  }))
}

/**
 * Lista somente pessoas com papel `fornecedor` da empresa (tenant).
 * Usa coluna `documento` (não há cnpj/cpf em crm_leads).
 * Somente leitura — não altera Cardex/Saldo.
 */
export async function loadFornecedoresEmpresa(
  supabase: SupabaseClient,
  empresaId: string,
): Promise<FornecedorOption[]> {
  if (!empresaId) return []

  const { data, error } = await supabase
    .from('crm_leads')
    .select('id, nome, documento, papeis')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .contains('papeis', ['fornecedor'])
    .order('nome')

  if (error) {
    console.error('[estoque] loadFornecedoresEmpresa', error.message)
    return []
  }

  return (data || []).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    documento: (p.documento as string | null) ?? null,
  }))
}

/** Local padrão: est_config.nfe_xml_local_padrao_id → principal → BRANCO → primeiro. */
export function resolveLocalPadraoEstoque(
  locais: LocalRow[],
  configLocalId?: string | null,
): LocalRow | undefined {
  if (configLocalId) {
    const fromConfig = locais.find((l) => l.id === configLocalId)
    if (fromConfig) return fromConfig
  }
  return (
    locais.find((l) => l.eh_principal) ||
    locais.find((l) => l.codigo === 'BRANCO') ||
    locais[0]
  )
}

export async function loadLocalPadraoEmpresa(
  supabase: SupabaseClient,
  empresaId: string,
  locais: LocalRow[],
): Promise<LocalRow | undefined> {
  if (!empresaId) return resolveLocalPadraoEstoque(locais, null)

  const { data: config } = await supabase
    .from('est_config')
    .select('nfe_xml_local_padrao_id')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  return resolveLocalPadraoEstoque(locais, config?.nfe_xml_local_padrao_id)
}
