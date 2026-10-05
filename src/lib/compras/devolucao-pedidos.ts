import { pedidoPodeDevolver } from '@/lib/compras/devolucao-status'
import { dataFiltroIso, diaIntervalo, textoFiltro, UUID_FILTRO } from '@/lib/compras/filtros-lista'
import { createClient } from '@/utils/supabase/server'

type Cliente = Awaited<ReturnType<typeof createClient>>

export type PedidoDevolucaoResumo = {
  id: string
  numero: string
  fornecedorNome: string
  status: string
  data: string
}

export type ItemPedidoDevolucao = {
  id: string
  descricao: string
  unidade: string
  recebido: number
  devolvido: number
}

export type PedidoDevolucaoCarregado = {
  id: string
  numero: string
  fornecedorNome: string
  itens: ItemPedidoDevolucao[]
}

const STATUS_DEVOLUCAO = ['recebido', 'recebido_parcial'] as const

function nomeEmbed(value: { nome?: string } | { nome?: string }[] | null | undefined) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.nome || '' : value.nome || ''
}

export async function listarPedidosParaDevolucao(
  supabase: Cliente,
  empresaId: string,
  raw: { q?: string; fornecedor?: string; data?: string; status?: string },
): Promise<{ error: string | null; pedidos: PedidoDevolucaoResumo[] }> {
  const busca = textoFiltro(raw.q)
  const fornecedorId = UUID_FILTRO.test(raw.fornecedor || '') ? raw.fornecedor! : ''
  const data = dataFiltroIso(raw.data)
  const status = (STATUS_DEVOLUCAO as readonly string[]).includes(raw.status || '') ? raw.status! : ''

  let query = supabase
    .from('com_pedidos')
    .select('id, numero, status, created_at, fornecedor:crm_leads!fornecedor_id(nome)')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(50)
  query = status
    ? query.eq('status', status)
    : query.in('status', [...STATUS_DEVOLUCAO])
  if (fornecedorId) query = query.eq('fornecedor_id', fornecedorId)
  if (busca) query = query.ilike('numero', `%${busca}%`)
  if (data) {
    const dia = diaIntervalo(data)
    query = query.gte('created_at', dia.inicio).lt('created_at', dia.fim)
  }

  const { data: rows, error } = await query
  if (error) return { error: error.message, pedidos: [] }
  return {
    error: null,
    pedidos: (rows || []).map((row) => ({
      id: row.id,
      numero: row.numero,
      fornecedorNome: nomeEmbed(row.fornecedor) || '—',
      status: row.status,
      data: row.created_at,
    })),
  }
}

export async function carregarPedidoParaDevolucao(
  supabase: Cliente,
  empresaId: string,
  pedidoId: string,
): Promise<{ error: string | null; pedido: PedidoDevolucaoCarregado | null }> {
  if (!UUID_FILTRO.test(pedidoId)) return { error: 'Pedido inválido.', pedido: null }

  const { data: row, error } = await supabase
    .from('com_pedidos')
    .select(
      'id, numero, status, fornecedor:crm_leads!fornecedor_id(nome), itens:com_pedido_itens(id, descricao, unidade)',
    )
    .eq('empresa_id', empresaId)
    .eq('id', pedidoId)
    .maybeSingle()
  if (error) return { error: error.message, pedido: null }
  if (!row || !pedidoPodeDevolver(row.status)) {
    return { error: 'Só é possível devolver pedido que já teve recebimento.', pedido: null }
  }

  const itemIds = (row.itens || []).map((item) => item.id)
  const recebido = new Map<string, number>()
  const devolvido = new Map<string, number>()
  if (itemIds.length) {
    const [{ data: recebimentos }, { data: devolucoes }] = await Promise.all([
      supabase
        .from('com_recebimento_itens')
        .select('pedido_item_id, quantidade')
        .eq('empresa_id', empresaId)
        .in('pedido_item_id', itemIds),
      supabase
        .from('com_devolucao_itens')
        .select('pedido_item_id, quantidade, devolucao:com_devolucoes!devolucao_id(status)')
        .eq('empresa_id', empresaId)
        .in('pedido_item_id', itemIds),
    ])
    for (const linha of recebimentos || []) {
      recebido.set(linha.pedido_item_id, (recebido.get(linha.pedido_item_id) || 0) + Number(linha.quantidade))
    }
    for (const linha of devolucoes || []) {
      const cab = linha.devolucao as { status?: string } | { status?: string }[] | null
      const status = Array.isArray(cab) ? cab[0]?.status : cab?.status
      if (status === 'cancelada') continue
      devolvido.set(
        linha.pedido_item_id,
        (devolvido.get(linha.pedido_item_id) || 0) + Number(linha.quantidade),
      )
    }
  }

  const itens = (row.itens || [])
    .map((item) => ({
      id: item.id,
      descricao: item.descricao,
      unidade: item.unidade,
      recebido: recebido.get(item.id) || 0,
      devolvido: devolvido.get(item.id) || 0,
    }))
    .filter((item) => item.recebido - item.devolvido > 0.0001)

  if (!itens.length) {
    return { error: 'Nada deste pedido ainda pode ser devolvido.', pedido: null }
  }

  return {
    error: null,
    pedido: {
      id: row.id,
      numero: row.numero,
      fornecedorNome: nomeEmbed(row.fornecedor) || '—',
      itens,
    },
  }
}
