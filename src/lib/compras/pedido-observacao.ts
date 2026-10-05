import type { SupabaseClient } from '@supabase/supabase-js'

/** Observação do pedido. Se estiver vazia, usa a da solicitação ligada pela cotação. */
export async function observacaoDoPedido(
  supabase: SupabaseClient,
  empresaId: string,
  pedido: { observacao: string | null; cotacao_id: string | null },
): Promise<string> {
  const propria = pedido.observacao?.trim()
  if (propria) return propria
  if (!pedido.cotacao_id) return ''

  const { data: cot } = await supabase
    .from('com_cotacoes')
    .select('observacao, solicitacao_id')
    .eq('id', pedido.cotacao_id)
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (!cot) return ''

  if (cot.solicitacao_id) {
    const { data: sol } = await supabase
      .from('com_solicitacoes')
      .select('observacao')
      .eq('id', cot.solicitacao_id)
      .eq('empresa_id', empresaId)
      .maybeSingle()
    const texto = sol?.observacao?.trim()
    if (texto) return texto
  }

  return cot.observacao?.trim() || ''
}
