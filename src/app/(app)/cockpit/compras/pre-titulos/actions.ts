'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { dataFiltroIso, textoFiltro, UUID_FILTRO } from '@/lib/compras/filtros-lista'
import { PRE_TITULO_STATUS_LABEL } from '@/lib/compras/pre-titulo-status'
import { TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import * as XLSX from 'xlsx'

async function gate(action: 'view' | 'edit') {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Sessão sem empresa.' as const, me: null }
  const isSuper = me.role_global === 'superadmin'
  if (!isSuper && !(await empresaHasAddon(me.empresa_id, 'compras'))) {
    return { error: 'Addon Compras não está ativo nesta empresa.' as const, me: null }
  }
  if (!isSuper && !hasPermission(me, 'compras_exportacao', action)) {
    return { error: 'Sem permissão para esta ação.' as const, me: null }
  }
  return { error: null, me }
}

export async function dispensarPreTitulo(id: string) {
  const { error, me } = await gate('edit')
  if (error || !me) return { error: error || 'Sem permissão.' }
  if (!UUID_FILTRO.test(id)) return { error: 'Pré-título inválido.' }
  const supabase = await createClient()
  const { data, error: upErr } = await supabase
    .from('com_pre_titulos')
    .update({
      status: 'dispensado',
      dispensado_em: new Date().toISOString(),
      dispensado_usuario_id: me.id,
    })
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .eq('status', 'aguardando_ap')
    .select('id')
    .maybeSingle()
  if (upErr) return { error: upErr.message }
  if (!data) return { error: 'Só um pré-título aguardando contas a pagar pode ser dispensado.' }
  revalidatePath('/cockpit/compras/pre-titulos')
  return { ok: true as const }
}

export async function trazerNotasConfirmadas() {
  const { error, me } = await gate('view')
  if (error || !me) return { error: error || 'Sem permissão.', quantidade: 0 }
  const supabase = await createClient()
  const { data, error: rpcErr } = await supabase.rpc('com_gravar_pre_titulos_pendentes', { p_limite: 100 })
  if (rpcErr) return { error: rpcErr.message, quantidade: 0 }
  revalidatePath('/cockpit/compras/pre-titulos')
  return { error: null as string | null, quantidade: Number(data || 0) }
}

function impostosTexto(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return Object.entries(value as Record<string, unknown>)
    .map(([chave, valor]) => `${chave}: ${valor ?? ''}`)
    .join('; ')
}

function nomeEmbed(value: { nome?: string } | { nome?: string }[] | null | undefined) {
  if (!value) return ''
  return Array.isArray(value) ? value[0]?.nome || '' : value.nome || ''
}

export async function exportarPlanilhaContador(filtros: {
  q?: string
  fornecedor?: string
  data?: string
  status?: string
}) {
  const { error, me } = await gate('view')
  if (error || !me) return { error: error || 'Sem permissão.', base64: null, filename: '' }

  const supabase = await createClient()
  const busca = textoFiltro(filtros.q)
  const fornecedorId = UUID_FILTRO.test(filtros.fornecedor || '') ? filtros.fornecedor! : ''
  const dataFiltro = dataFiltroIso(filtros.data)
  const statusFiltro = filtros.status && PRE_TITULO_STATUS_LABEL[filtros.status] ? filtros.status : ''

  let query = supabase
    .from('com_pre_titulos')
    .select(
      `numero, tipo, valor, vencimento, status,
       nota:com_notas!nota_id(
         numero, serie, data_emissao, frete, valor_total, vencimento,
         itens:com_nota_itens(descricao, cfop, centro_custo, n_serie, quantidade, preco_unitario, frete_rateado, impostos)
       ),
       pedido:com_pedidos!pedido_id(
         numero,
         aprovacoes:com_pedido_aprovacoes(nivel, decisao, aprovador:usuarios!usuario_id(nome))
       ),
       fornecedor:crm_leads!fornecedor_id(nome)`,
    )
    .eq('empresa_id', me.empresa_id)
    .order('created_at', { ascending: false })
    .limit(500)
  if (fornecedorId) query = query.eq('fornecedor_id', fornecedorId)
  if (statusFiltro) query = query.eq('status', statusFiltro)
  if (dataFiltro) query = query.eq('vencimento', dataFiltro)
  if (busca) query = query.ilike('numero', `%${busca}%`)

  const { data, error: qErr } = await query
  if (qErr) return { error: qErr.message, base64: null, filename: '' }

  const linhas: Array<Record<string, string | number>> = []
  for (const row of data || []) {
    const nota = (Array.isArray(row.nota) ? row.nota[0] : row.nota) as {
      numero?: string
      serie?: string
      data_emissao?: string
      frete?: number
      valor_total?: number
      vencimento?: string | null
      itens?: Array<{
        descricao?: string
        cfop?: string | null
        centro_custo?: string | null
        n_serie?: string | null
        quantidade?: number
        preco_unitario?: number
        frete_rateado?: number
        impostos?: unknown
      }>
    } | null
    const pedido = (Array.isArray(row.pedido) ? row.pedido[0] : row.pedido) as {
      numero?: string
      aprovacoes?: Array<{
        nivel?: number
        decisao?: string
        aprovador?: { nome?: string } | { nome?: string }[] | null
      }>
    } | null
    const aprovacoes = pedido?.aprovacoes || []
    const nivel = (n: number) => {
      const item = aprovacoes.find((a) => a.nivel === n)
      if (!item) return ''
      const quem = nomeEmbed(item.aprovador)
      return [quem, item.decisao].filter(Boolean).join(' · ')
    }
    const itens = nota?.itens?.length ? nota.itens : [null]
    for (const item of itens) {
      linhas.push({
        Data: nota?.data_emissao || '',
        Fornecedor: nomeEmbed(row.fornecedor),
        Documento: nota ? `${nota.numero || ''}/${nota.serie || ''}` : '',
        'Número da nota': nota?.numero || '',
        'Série da nota': nota?.serie || '',
        Tipo: TIPO_COMPRA_LABEL[row.tipo as TipoCompra] || row.tipo,
        CFOP: item?.cfop || '',
        'Centro de custo': item?.centro_custo || '',
        Produto: item?.descricao || '',
        'Série do produto': item?.n_serie || '',
        Quantidade: item?.quantidade ?? '',
        'Preço unitário': item?.preco_unitario ?? '',
        Frete: Number(nota?.frete || 0),
        'Frete do item': Number(item?.frete_rateado || 0),
        Impostos: impostosTexto(item?.impostos),
        Total: Number(nota?.valor_total ?? row.valor ?? 0),
        Vencimento: nota?.vencimento || row.vencimento || '',
        Pedido: pedido?.numero || '',
        'Aprovação nível 1': nivel(1),
        'Aprovação nível 2': nivel(2),
        'Pré-título': row.numero,
        'Status do pré-título': PRE_TITULO_STATUS_LABEL[row.status] || row.status,
      })
    }
  }

  const sheet = XLSX.utils.json_to_sheet(
    linhas.length
      ? linhas
      : [{ Documento: 'Nenhum pré-título com esses filtros.' }],
  )
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Contador')
  const base64 = XLSX.write(book, { type: 'base64', bookType: 'xlsx' }) as string
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return { error: null as string | null, base64, filename: `compras-contador-${hoje}.xlsx` }
}
