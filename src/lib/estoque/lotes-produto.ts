/**
 * Resolve / cria lote de produto (batch + validade).
 * Distinto de est_*_lotes (documentos operacionais).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any }

export interface ResolverLoteProdutoInput {
  empresa_id: string
  sku_id: string
  numero_lote: string
  data_validade?: string | null
  data_fabricacao?: string | null
  exige_validade?: boolean
}

export async function resolverOuCriarLoteProduto(
  client: SupabaseClient,
  input: ResolverLoteProdutoInput,
): Promise<{ id: string; created: boolean }> {
  const numero = (input.numero_lote || '').trim()
  if (!numero) {
    throw new Error('LOTE_OBRIGATORIO: número do lote é obrigatório.')
  }

  const validade = input.data_validade?.trim() || null
  const fabricacao = input.data_fabricacao?.trim() || null
  if (input.exige_validade && !validade) {
    throw new Error('VALIDADE_OBRIGATORIA: data de validade é obrigatória para este SKU.')
  }

  const { data: existente, error: errFind } = await client
    .from('est_lotes_produto')
    .select('id, data_validade, data_fabricacao')
    .eq('empresa_id', input.empresa_id)
    .eq('sku_id', input.sku_id)
    .eq('numero_lote', numero)
    .maybeSingle()

  if (errFind) {
    throw new Error(`Falha ao buscar lote produto: ${errFind.message}`)
  }

  if (existente?.id) {
    const patch: Record<string, string> = {}
    if (!existente.data_validade && validade) patch.data_validade = validade
    if (!existente.data_fabricacao && fabricacao) patch.data_fabricacao = fabricacao
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString()
      await client.from('est_lotes_produto').update(patch).eq('id', existente.id)
    }
    return { id: existente.id as string, created: false }
  }

  const agora = new Date().toISOString()
  const { data: criado, error: errIns } = await client
    .from('est_lotes_produto')
    .insert({
      empresa_id: input.empresa_id,
      sku_id: input.sku_id,
      numero_lote: numero,
      data_validade: validade,
      data_fabricacao: fabricacao,
      created_at: agora,
      updated_at: agora,
    })
    .select('id')
    .single()

  if (errIns || !criado?.id) {
    // Corrida: unique conflict — rebuscar
    if (errIns?.code === '23505') {
      const { data: again } = await client
        .from('est_lotes_produto')
        .select('id')
        .eq('empresa_id', input.empresa_id)
        .eq('sku_id', input.sku_id)
        .eq('numero_lote', numero)
        .maybeSingle()
      if (again?.id) return { id: again.id as string, created: false }
    }
    throw new Error(`Falha ao criar lote produto: ${errIns?.message || 'sem id'}`)
  }

  return { id: criado.id as string, created: true }
}
