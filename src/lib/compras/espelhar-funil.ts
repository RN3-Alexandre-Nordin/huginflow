import type { SupabaseClient } from '@supabase/supabase-js'

/** Move o card para a etapa do documento. Falha do funil não desfaz o pedido. */
export async function espelharPedidoFunil(client: SupabaseClient, pedidoId: string) {
  await client.rpc('com_espelhar_funil_pedido', { p_pedido_id: pedidoId })
}
