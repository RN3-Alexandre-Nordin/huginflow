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
  if (!origem || !destino) return null
  if (origem === destino) return 1

  if (params.skuId) {
    const { data: especifica } = await params.client
      .from('cad_sku_unidade_conversao')
      .select('fator_conversao')
      .eq('empresa_id', params.empresaId)
      .eq('sku_id', params.skuId)
      .ilike('unidade_origem', origem)
      .ilike('unidade_destino', destino)
      .maybeSingle()

    if (especifica?.fator_conversao != null) {
      const n = Number(especifica.fator_conversao)
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  const { data: generica } = await params.client
    .from('cad_sku_unidade_conversao')
    .select('fator_conversao')
    .eq('empresa_id', params.empresaId)
    .is('sku_id', null)
    .ilike('unidade_origem', origem)
    .ilike('unidade_destino', destino)
    .maybeSingle()

  if (generica?.fator_conversao != null) {
    const n = Number(generica.fator_conversao)
    if (Number.isFinite(n) && n > 0) return n
  }

  return null
}
