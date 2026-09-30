import type { SupabaseClient } from '@supabase/supabase-js'

type TabelaNumero = 'com_solicitacoes' | 'com_pedidos' | 'com_cotacoes'

async function proximoNumeroDoDia(
  client: SupabaseClient,
  empresaId: string,
  tabela: TabelaNumero,
  prefixoBase: string,
): Promise<string> {
  const hoje = new Date()
  const yyyy = hoje.getFullYear()
  const mm = String(hoje.getMonth() + 1).padStart(2, '0')
  const dd = String(hoje.getDate()).padStart(2, '0')
  const prefixo = `${prefixoBase}-${yyyy}${mm}${dd}-`

  const { count } = await client
    .from(tabela)
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .ilike('numero', `${prefixo}%`)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `${prefixo}${seq}`
}

export function gerarNumeroSolicitacao(empresaId: string, client: SupabaseClient) {
  return proximoNumeroDoDia(client, empresaId, 'com_solicitacoes', 'SOL')
}

export function gerarNumeroPedido(empresaId: string, client: SupabaseClient) {
  return proximoNumeroDoDia(client, empresaId, 'com_pedidos', 'PC')
}

export function gerarNumeroCotacao(empresaId: string, client: SupabaseClient) {
  return proximoNumeroDoDia(client, empresaId, 'com_cotacoes', 'COT')
}
