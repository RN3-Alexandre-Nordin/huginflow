'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import {
  processarLoteRemessa,
  processarRetornoRemessa,
  processarLiquidacaoRemessa,
  gerarNumeroRemessa,
  type ItemRemessaInput,
} from '@/lib/estoque/operacoes-avancadas'

const LIST_PATH = '/cockpit/estoque/remessas'

function revalidateRemessaPaths(remessaId?: string) {
  try {
    revalidatePath(LIST_PATH)
    revalidatePath('/cockpit/estoque')
    revalidatePath('/cockpit/estoque/cardex')
    revalidatePath('/cockpit/estoque/saldos')
    if (remessaId) revalidatePath(`${LIST_PATH}/${remessaId}`)
  } catch {
    // revalidate não deve bloquear o sucesso da remessa
  }
}

export async function previewNumeroRemessaAction() {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { numero: null as string | null }
  const supabase = await createClient()
  const numero = await gerarNumeroRemessa(me.empresa_id, supabase)
  return { numero }
}

export async function criarRemessaAction(data: {
  destinatario_pessoa_id: string
  motivo_codigo: string
  motivo_texto?: string
  observacao?: string
  documento?: string
  previsao_retorno_em?: string
  itens: ItemRemessaInput[]
}) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canCreate) {
    return { error: 'Sem permissão para criar remessas de estoque.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  const res = await processarLoteRemessa(
    {
      empresa_id: empresaId,
      destinatario_pessoa_id: data.destinatario_pessoa_id,
      motivo_codigo: data.motivo_codigo,
      motivo_texto: data.motivo_texto,
      observacao: data.observacao,
      documento: data.documento,
      previsao_retorno_em: data.previsao_retorno_em,
      usuario_id: me.id,
      itens: data.itens,
    },
    supabase
  )

  if (!res.sucesso) {
    return { error: res.mensagem }
  }

  revalidateRemessaPaths(res.remessaId)

  return res
}

export async function registrarRetornoRemessaAction(data: {
  remessa_id: string
  item_id: string
  quantidade_retorno: number
  local_destino_id: string
  observacao?: string
}) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canEdit =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'edit') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canEdit) {
    return { error: 'Sem permissão para registrar retorno de remessas.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  const res = await processarRetornoRemessa(
    {
      empresa_id: empresaId,
      remessa_id: data.remessa_id,
      item_id: data.item_id,
      quantidade_retorno: data.quantidade_retorno,
      local_destino_id: data.local_destino_id,
      usuario_id: me.id,
      observacao: data.observacao,
    },
    supabase
  )

  if (!res.sucesso) {
    return { error: res.mensagem }
  }

  revalidateRemessaPaths(data.remessa_id)

  return res
}

export async function registrarRetornosRemessaAction(data: {
  remessa_id: string
  observacao?: string
  itens: Array<{
    item_id: string
    quantidade_retorno?: number
    sku_retorno_id?: string
    local_destino_id?: string
    quantidade_fecha_poder?: number
    quantidade_baixa?: number
    motivo_baixa_codigo?: string
    motivo_baixa_texto?: string
  }>
}) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canEdit =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'edit') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canEdit) {
    return { error: 'Sem permissão para registrar retorno de remessas.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const itens = (data.itens || []).filter(
    (it) => Number(it.quantidade_retorno || 0) > 0 || Number(it.quantidade_baixa || 0) > 0
  )
  if (itens.length === 0) {
    return { error: 'Informe retorno e/ou baixa em ao menos um item.' }
  }

  const supabase = await createClient()
  const obs = data.observacao?.trim() || undefined

  const resultados: Array<{
    item_id: string
    sucesso: boolean
    mensagem: string
    movimentoId?: string
  }> = []

  let ultimoStatus: string | undefined

  for (const it of itens) {
    const res = await processarLiquidacaoRemessa(
      {
        empresa_id: empresaId,
        remessa_id: data.remessa_id,
        item_id: it.item_id,
        quantidade_retorno: Number(it.quantidade_retorno || 0),
        sku_retorno_id: it.sku_retorno_id,
        local_destino_id: it.local_destino_id,
        quantidade_fecha_poder: it.quantidade_fecha_poder,
        quantidade_baixa: Number(it.quantidade_baixa || 0),
        motivo_baixa_codigo: it.motivo_baixa_codigo,
        motivo_baixa_texto: it.motivo_baixa_texto,
        usuario_id: me.id,
        observacao: obs,
      },
      supabase
    )

    if (res.sucesso) {
      ultimoStatus = res.novoStatus
      resultados.push({
        item_id: it.item_id,
        sucesso: true,
        mensagem: res.mensagem,
        movimentoId: res.movimentoId,
      })
    } else {
      resultados.push({
        item_id: it.item_id,
        sucesso: false,
        mensagem: res.mensagem || 'Falha ao processar liquidação.',
      })
    }
  }

  revalidateRemessaPaths(data.remessa_id)
  try {
    revalidatePath(`${LIST_PATH}/${data.remessa_id}/retorno`)
  } catch {
    // ignore
  }

  const ok = resultados.filter((r) => r.sucesso).length
  const falhas = resultados.filter((r) => !r.sucesso)

  if (ok === 0) {
    return {
      sucesso: false as const,
      mensagem: falhas[0]?.mensagem || 'Nenhuma liquidação foi registrada.',
      resultados,
    }
  }

  if (falhas.length > 0) {
    return {
      sucesso: true as const,
      parcial: true as const,
      novoStatus: ultimoStatus,
      mensagem: `${ok} ok · ${falhas.length} com erro: ${falhas.map((f) => f.mensagem).join(' | ')}`,
      resultados,
    }
  }

  return {
    sucesso: true as const,
    parcial: false as const,
    novoStatus: ultimoStatus,
    mensagem:
      ok === 1
        ? resultados[0].mensagem
        : `${ok} liquidações registradas. Estoque e poder de terceiros atualizados.`,
    resultados,
  }
}
