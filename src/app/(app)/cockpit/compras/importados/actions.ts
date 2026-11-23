'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { normalizarCodigoEtiqueta } from '@/lib/compras/codigo-etiqueta'
import { espelharPedidoFunil } from '@/lib/compras/espelhar-funil'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

async function gate() {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Sessão sem empresa.' as const, me: null }
  const isSuper = me.role_global === 'superadmin'
  if (!isSuper && !(await empresaHasAddon(me.empresa_id, 'compras'))) {
    return { error: 'Addon Compras não está ativo nesta empresa.' as const, me: null }
  }
  const pode =
    isSuper ||
    hasPermission(me, 'compras_conferencia', 'create') ||
    hasPermission(me, 'compras_conferencia', 'edit')
  if (!pode) return { error: 'Sem permissão para conferir recebimento.' as const, me: null }
  const supabase = await createClient()
  const { data: config } = await supabase
    .from('com_config')
    .select('recebimento_importados, importados_limpeza')
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (!config?.recebimento_importados) {
    return { error: 'O recebimento de importados está desligado.' as const, me: null }
  }
  return { error: null, me, supabase, limpeza: String(config.importados_limpeza || 'baixa_manual') }
}

export async function buscarPedidoImportado(codigo: string) {
  const acesso = await gate()
  if (acesso.error || !acesso.me) return { error: acesso.error || 'Sem permissão.' }
  const limpo = codigo.trim()
  if (!limpo) return { error: 'Informe o código da caixa.' }
  const { data } = await acesso.supabase
    .from('com_pedidos')
    .select('id, status')
    .eq('empresa_id', acesso.me.empresa_id)
    .eq('codigo_fornecedor', limpo)
    .maybeSingle()
  if (!data) return { error: 'Nenhum pedido importado com esse código de fornecedor.' }
  if (!['aprovado', 'recebido_parcial'].includes(data.status)) {
    return { error: 'Este pedido não está para conferência.' }
  }
  return { ok: true as const, pedidoId: data.id as string }
}

export async function identificarEtiquetaImportado(input: { pedidoId: string; codigos: string[] }) {
  const acesso = await gate()
  if (acesso.error || !acesso.me) return { error: acesso.error || 'Sem permissão.' }
  const codigos = (input.codigos || []).map((codigo) => String(codigo ?? '').trim()).filter((codigo) => normalizarCodigoEtiqueta(codigo))
  if (!codigos.length) return { error: 'Não foi possível ler o número da etiqueta.' }
  const { data, error } = await acesso.supabase.rpc('com_prever_etiquetas_importado', {
    p_pedido_id: input.pedidoId,
    p_codigos: codigos,
  })
  if (error) return { error: error.message }
  const resultado = data as { status?: string; origem?: string } | null
  if (!resultado?.status) return { error: 'Não foi possível identificar a etiqueta.' }
  if (resultado.status === 'unico' && codigos.length > 1 && (resultado.origem === 'sku' || resultado.origem === 'alternativo')) {
    resultado.origem = 'ocr'
  }
  return { ok: true as const, resultado }
}

export async function confirmarItemImportado(input: {
  pedidoId: string
  pedidoItemId: string
  codigoLido: string
  origem: 'sku' | 'alternativo' | 'ocr' | 'manual'
  quantidade: number
  localId: string
  localTemporario: string
}) {
  const acesso = await gate()
  if (acesso.error || !acesso.me) return { error: acesso.error || 'Sem permissão.' }
  const { supabase } = acesso
  const codigoLido = String(input.codigoLido ?? '').trim()
  if (!normalizarCodigoEtiqueta(codigoLido)) return { error: 'Não foi possível ler o número da etiqueta.' }
  const quantidade = Number(input.quantidade)
  if (!(quantidade > 0)) return { error: 'Informe a quantidade.' }

  const localId = input.localId.trim()
  const localTemporario = input.localTemporario.trim()
  if (localId && localTemporario) return { error: 'Escolha o local de estoque ou o local temporário.' }
  if (!localId && !localTemporario) {
    return { error: 'Indique o local de estoque ou o local temporário antes de confirmar.' }
  }

  const { data: gravado, error: rpcErr } = await supabase.rpc('com_confirmar_leitura_importada', {
    p_pedido_id: input.pedidoId,
    p_pedido_item_id: input.pedidoItemId,
    p_codigo_lido: codigoLido,
    p_quantidade: quantidade,
    p_local_id: localId || null,
    p_local_temporario: localTemporario || null,
    p_origem: input.origem,
  })
  if (rpcErr) return { error: rpcErr.message }
  const conferencia = gravado as { ok?: boolean; codigo?: string; descricao?: string } | null
  if (!conferencia?.ok || !conferencia.codigo) {
    return { error: 'Não foi possível gravar a conferência.' }
  }

  revalidatePath(`/cockpit/compras/importados/${input.pedidoId}`)
  revalidatePath(`/cockpit/compras/pedidos/${input.pedidoId}`)
  return {
    ok: true as const,
    codigo: conferencia.codigo,
    descricao: (conferencia.descricao || '') as string,
  }
}

export async function aprenderCodigoImportado(input: {
  pedidoId: string
  pedidoItemId: string
  codigoLido: string
}) {
  const acesso = await gate()
  if (acesso.error || !acesso.me) return { error: acesso.error || 'Sem permissão.' }
  const podeCadastrar =
    acesso.me.role_global === 'superadmin' ||
    hasPermission(acesso.me, 'skus', 'create') ||
    hasPermission(acesso.me, 'skus', 'edit')
  if (!podeCadastrar) {
    return { error: 'O cadastro deste código exige autorização de manutenção do de-para.' }
  }
  const codigoLido = String(input.codigoLido ?? '').trim()
  if (!normalizarCodigoEtiqueta(codigoLido)) return { error: 'Não foi possível ler o número da etiqueta.' }
  const { data, error } = await acesso.supabase.rpc('com_aprender_codigo_importado', {
    p_pedido_id: input.pedidoId,
    p_pedido_item_id: input.pedidoItemId,
    p_codigo_lido: codigoLido,
  })
  if (error) return { error: error.message }
  const gravado = data as { ok?: boolean; status?: string } | null
  if (!gravado?.ok) return { error: 'Não foi possível salvar o vínculo.' }
  revalidatePath('/cockpit/cadastros/sku-depara')
  return { ok: true as const, status: gravado.status || 'criado' }
}

export async function fecharRecebimentoImportado(pedidoId: string) {
  const acesso = await gate()
  if (acesso.error || !acesso.me) return { error: acesso.error || 'Sem permissão.' }
  const { supabase } = acesso

  const { data: fechamento, error: rpcErr } = await supabase.rpc(
    'com_fechar_recebimento_importado',
    { p_pedido_id: pedidoId },
  )
  if (rpcErr) return { error: rpcErr.message }
  const resultado = fechamento as {
    ok?: boolean
    entradas?: string[]
    avisos?: string[]
    fechou?: boolean
  } | null
  if (!resultado?.ok) return { error: 'Não foi possível fechar o recebimento.' }

  const entradas = Array.isArray(resultado.entradas) ? resultado.entradas : []
  const avisos = Array.isArray(resultado.avisos) ? resultado.avisos : []
  const fechou = Boolean(resultado.fechou)

  // O espelhamento fica fora da transação. A função engole a falha do funil,
  // então um fechamento já confirmado não volta como erro de repetição.
  await espelharPedidoFunil(supabase, pedidoId)

  revalidatePath(`/cockpit/compras/importados/${pedidoId}`)
  revalidatePath(`/cockpit/compras/pedidos/${pedidoId}`)
  revalidatePath('/cockpit/compras/pedidos')
  return { ok: true as const, entradas, avisos, fechou }
}
