'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
const INTENCAO_POR_STATUS = {
  pendente_aprovacao: 'enviar',
  aprovada: 'aprovar',
  rejeitada: 'rejeitar',
  cancelada: 'cancelar',
} as const
import {
  atenderRequisicao,
  criarRequisicao,
  type ItemRequisicaoInput,
} from '@/lib/estoque/processar-requisicao'

const LIST_PATH = '/cockpit/estoque/requisicoes'
const APROVACAO_PATH = '/cockpit/estoque/requisicoes/aprovacao'

export async function criarRequisicaoAction(data: {
  requisitante_pessoa_id: string
  departamento_id?: string
  observacao?: string
  enviar_imediatamente?: boolean
  itens: ItemRequisicaoInput[]
}) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_requisicoes', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canCreate) {
    return { error: 'Sem permissão para criar requisições de materiais.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  const resultado = await criarRequisicao(
    {
      empresa_id: empresaId,
      requisitante_pessoa_id: data.requisitante_pessoa_id,
      solicitante_usuario_id: me.id,
      departamento_id: data.departamento_id || null,
      observacao: data.observacao,
      origem: 'manual',
      enviar_imediatamente: data.enviar_imediatamente,
      itens: data.itens,
    },
    supabase
  )

  if (!resultado.sucesso) {
    return { error: resultado.mensagem }
  }

  revalidatePath(LIST_PATH)
  revalidatePath(APROVACAO_PATH)
  revalidatePath('/cockpit/estoque')

  return resultado
}

export async function transicionarStatusRequisicaoAction(
  requisicaoId: string,
  novoStatus: 'pendente_aprovacao' | 'aprovada' | 'rejeitada' | 'cancelada'
) {
  const me = await getMyProfile()
  const empresaId = me?.empresa_id ?? ''
  if (!empresaId || !me?.id) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()
  const { data: transicao, error } = await supabase.rpc('est_transicionar_requisicao', {
    p_empresa_id: empresaId,
    p_requisicao_id: requisicaoId,
    p_intencao: INTENCAO_POR_STATUS[novoStatus],
  })

  if (error || !transicao?.sucesso) {
    return { error: transicao?.mensagem || error?.message || 'Falha ao atualizar a requisição.' }
  }

  revalidatePath(LIST_PATH)
  revalidatePath(APROVACAO_PATH)
  revalidatePath(`${LIST_PATH}/${requisicaoId}`)

  return { sucesso: true, novoStatus: transicao.status || novoStatus }
}

export async function atenderRequisicaoAction(
  requisicaoId: string,
  localBaixaId?: string,
  itens?: Array<{ item_id: string; quantidade: number }>,
  alocacoesPorItem?: Record<
    string,
    Array<{
      lote_produto_id: string
      numero_lote: string
      data_validade: string | null
      quantidade: number
      saldo_disponivel?: number
    }>
  > | null,
  seriesPorItem?: Record<string, string[]> | null
) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canAtender =
    isSuperAdmin ||
    hasPermission(me, 'estoque_atendimento', 'create') ||
    hasPermission(me, 'estoque_atendimento', 'edit') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canAtender) {
    return { error: 'Sem permissão para atender requisições de estoque.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  const res = await atenderRequisicao(
    {
      empresa_id: empresaId,
      requisicao_id: requisicaoId,
      usuario_id: me.id,
      local_baixa_id: localBaixaId,
      itens,
      alocacoes_por_item: alocacoesPorItem || null,
      series_por_item: seriesPorItem || null,
    },
    supabase
  )

  if (!res.sucesso) {
    return { error: res.mensagem }
  }

  revalidatePath(LIST_PATH)
  revalidatePath(`${LIST_PATH}/${requisicaoId}`)
  revalidatePath('/cockpit/estoque/cardex')
  revalidatePath('/cockpit/estoque/saldos')

  return res
}

export async function vincularSkuItemRequisicaoAction(itemId: string) {
  const me = await getMyProfile()
  const empresaId = me?.empresa_id
  if (!empresaId) return { error: 'Empresa não identificada.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('est_vincular_sku_item_requisicao', {
    p_empresa_id: empresaId,
    p_item_id: itemId,
    p_sku_id: null,
  })
  if (error || !data?.sucesso) {
    return { error: data?.mensagem || error?.message || 'Não foi possível vincular o SKU.' }
  }
  revalidatePath(LIST_PATH)
  if (data.requisicao_id) revalidatePath(`${LIST_PATH}/${data.requisicao_id}`)
  return { ok: true }
}
