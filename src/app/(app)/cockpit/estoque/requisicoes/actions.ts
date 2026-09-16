'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import {
  calcularValorEstimadoRequisicao,
  podeAprovarRequisicao,
  statusAoEnviarRequisicao,
} from '@/lib/estoque/aprovacao-requisicao'
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
  const isSuperAdmin = me?.role_global === 'superadmin'

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  const { data: config } = await supabase
    .from('est_config')
    .select('req_aprovacao_ativa, req_aprovador_usuario_id, req_aprovacao_valor_minimo')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (novoStatus === 'aprovada' || novoStatus === 'rejeitada') {
    if (!podeAprovarRequisicao(me, config)) {
      return {
        error:
          'Somente o aprovador configurado em Estoque → Configuração, o admin da empresa ou superadmin podem decidir.',
      }
    }
  }

  if (novoStatus === 'cancelada') {
    const canCancel =
      isSuperAdmin ||
      me?.role_global === 'admin' ||
      hasPermission(me, 'estoque_requisicoes', 'edit') ||
      hasPermission(me, 'estoque', 'edit')
    if (!canCancel) {
      return { error: 'Sem permissão para cancelar esta requisição.' }
    }
  }

  if (novoStatus === 'pendente_aprovacao') {
    const canSend =
      isSuperAdmin ||
      hasPermission(me, 'estoque_requisicoes', 'edit') ||
      hasPermission(me, 'estoque_requisicoes', 'create') ||
      hasPermission(me, 'estoque', 'edit')
    if (!canSend) {
      return { error: 'Sem permissão para enviar requisição para aprovação.' }
    }
  }

  const { data: req, error: errReq } = await supabase
    .from('est_requisicoes')
    .select('id, status')
    .eq('empresa_id', empresaId)
    .eq('id', requisicaoId)
    .single()

  if (errReq || !req) {
    return { error: 'Requisição não encontrada.' }
  }

  if (novoStatus === 'pendente_aprovacao' && req.status !== 'rascunho') {
    return { error: 'Apenas requisições em rascunho podem ser enviadas para aprovação.' }
  }
  if (novoStatus === 'aprovada' && req.status !== 'pendente_aprovacao') {
    return { error: 'Apenas requisições pendentes de aprovação podem ser aprovadas.' }
  }
  if (novoStatus === 'rejeitada' && req.status !== 'pendente_aprovacao') {
    return { error: 'Apenas requisições pendentes de aprovação podem ser rejeitadas.' }
  }
  if (
    novoStatus === 'cancelada' &&
    ['atendida_total', 'cancelada'].includes(req.status)
  ) {
    return { error: 'Esta requisição não pode ser cancelada no status atual.' }
  }

  const agora = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: novoStatus,
    updated_at: agora,
  }

  // Envio a partir de rascunho: recalcula valor e aplica regra (pode auto-aprovar)
  if (novoStatus === 'pendente_aprovacao' && req.status === 'rascunho') {
    const { data: itens } = await supabase
      .from('est_requisicao_itens')
      .select('sku_id, quantidade_pedida')
      .eq('requisicao_id', requisicaoId)

    const skuIds = [...new Set((itens || []).map((i) => i.sku_id).filter(Boolean))]
    const precosPorSku = new Map<string, number>()
    if (skuIds.length > 0) {
      const { data: skus } = await supabase
        .from('cad_skus')
        .select('id, preco_custo')
        .eq('empresa_id', empresaId)
        .in('id', skuIds)
      for (const s of skus || []) {
        precosPorSku.set(s.id, Number(s.preco_custo || 0))
      }
    }

    const valorEstimado = calcularValorEstimadoRequisicao(
      (itens || []).map((i) => ({
        sku_id: i.sku_id,
        quantidade_pedida: Number(i.quantidade_pedida || 0),
      })),
      precosPorSku,
    )
    const statusFinal = statusAoEnviarRequisicao(config, valorEstimado)
    patch.status = statusFinal
    patch.valor_estimado = valorEstimado
  }

  if (novoStatus === 'aprovada' || novoStatus === 'rejeitada') {
    patch.aprovador_usuario_id = me.id
    patch.aprovado_em = agora
    patch.aprovacao_resultado = novoStatus === 'aprovada' ? 'aprovada' : 'rejeitada'
  }

  const { error: errUpdate } = await supabase
    .from('est_requisicoes')
    .update(patch)
    .eq('id', requisicaoId)

  if (errUpdate) {
    return { error: `Erro ao atualizar status: ${errUpdate.message}` }
  }

  revalidatePath(LIST_PATH)
  revalidatePath(APROVACAO_PATH)
  revalidatePath(`${LIST_PATH}/${requisicaoId}`)

  return { sucesso: true, novoStatus }
}

export async function atenderRequisicaoAction(
  requisicaoId: string,
  localBaixaId?: string,
  itens?: Array<{ item_id: string; quantidade: number }>
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
