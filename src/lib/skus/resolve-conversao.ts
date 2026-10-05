/**
 * Resolve fator de conversão: específica do SKU vence genérica da empresa.
 * 1 unidade_origem = fator × unidade_destino
 */
export async function resolveFatorConversao(params: {
  empresaId: string
  origem: string
  destino: string
  skuId?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { from: (t: string) => any }
}): Promise<number | null> {
  const origem = params.origem.trim().toUpperCase()
  const destino = params.destino.trim().toUpperCase()
  if (!origem || !destino || origem === destino) return origem === destino ? 1 : null

  const base = params.client
    .from('cad_sku_unidade_conversao')
    .select('fator_conversao, sku_id')
    .eq('empresa_id', params.empresaId)
    .ilike('unidade_origem', origem)
    .ilike('unidade_destino', destino)

  if (params.skuId) {
    const { data: especifica } = await base.eq('sku_id', params.skuId).maybeSingle()
    if (especifica?.fator_conversao != null) return Number(especifica.fator_conversao)
  }

  const { data: generica } = await params.client
    .from('cad_sku_unidade_conversao')
    .select('fator_conversao')
    .eq('empresa_id', params.empresaId)
    .is('sku_id', null)
    .ilike('unidade_origem', origem)
    .ilike('unidade_destino', destino)
    .maybeSingle()

  return generica?.fator_conversao != null ? Number(generica.fator_conversao) : null
}
