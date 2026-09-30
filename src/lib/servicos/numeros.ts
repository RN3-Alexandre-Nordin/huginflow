import type { SupabaseClient } from '@supabase/supabase-js'

/** Próximo código de serviço: SRV-0001, SRV-0002… por empresa. */
export async function gerarCodigoServico(
  empresaId: string,
  client: SupabaseClient,
): Promise<string> {
  const prefixo = 'SRV-'
  const { data } = await client
    .from('cad_servicos')
    .select('codigo')
    .eq('empresa_id', empresaId)
    .ilike('codigo', `${prefixo}%`)
    .order('codigo', { ascending: false })
    .limit(50)

  let max = 0
  for (const row of data || []) {
    const raw = String(row.codigo || '')
    if (!raw.toUpperCase().startsWith(prefixo)) continue
    const n = Number(raw.slice(prefixo.length))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefixo}${String(max + 1).padStart(4, '0')}`
}
