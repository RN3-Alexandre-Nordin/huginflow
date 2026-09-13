'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import {
  atenderRequisicao,
  criarRequisicao,
  type ItemRequisicaoInput,
} from '@/lib/estoque/processar-requisicao'

const LIST_PATH = '/cockpit/estoque/requisicoes'

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
  revalidatePath('/cockpit/estoque')

  return resultado
}

export async function transicionarStatusRequisicaoAction(
  requisicaoId: string,
  novoStatus: 'enviada' | 'aprovada' | 'cancelada'
) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  // Permissões específicas por transição
  if (novoStatus === 'aprovada') {
    const canApprove =
      isSuperAdmin ||
      hasPermission(me, 'estoque_aprovacao', 'edit') ||
      hasPermission(me, 'estoque', 'edit')

    if (!canApprove) {
      return { error: 'Sem permissão para aprovar requisições de materiais.' }
    }
  }

  const supabase = await createClient()

  // Carrega requisição
  const { data: req, error: errReq } = await supabase
    .from('est_requisicoes')
    .select('*, est_config:empresa_id(*)')
    .eq('empresa_id', empresaId)
    .eq('id', requisicaoId)
    .single()

  if (errReq || !req) {
    return { error: 'Requisição não encontrada.' }
  }

  // Validação de transições permitidas
  if (novoStatus === 'enviada' && req.status !== 'rascunho') {
    return { error: 'Apenas requisições em rascunho podem ser enviadas.' }
  }
  if (novoStatus === 'aprovada' && req.status !== 'enviada') {
    return { error: 'Apenas requisições enviadas podem ser aprovadas.' }
  }
  if (novoStatus === 'cancelada' && ['atendida', 'cancelada'].includes(req.status)) {
    return { error: 'Esta requisição não pode ser cancelada no status atual.' }
  }

  const { error: errUpdate } = await supabase
    .from('est_requisicoes')
    .update({
      status: novoStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requisicaoId)

  if (errUpdate) {
    return { error: `Erro ao atualizar status: ${errUpdate.message}` }
  }

  revalidatePath(LIST_PATH)
  revalidatePath(`${LIST_PATH}/${requisicaoId}`)

  return { sucesso: true, novoStatus }
}

export async function atenderRequisicaoAction(
  requisicaoId: string,
  localBaixaId?: string
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
