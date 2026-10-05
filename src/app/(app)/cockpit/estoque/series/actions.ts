'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

async function empresaDoUsuario() {
  const me = await getMyProfile()
  const empresaId = me?.empresa_id ?? ''
  if (!me || !empresaId) return { error: 'Empresa não identificada.' as const }
  return { me, empresaId }
}

export async function listarSeriesAction(
  skuId: string,
  situacao: 'em_estoque' | 'em_terceiro',
  localId?: string,
) {
  const gate = await empresaDoUsuario()
  if ('error' in gate) return { error: gate.error, series: [] as Array<{ id: string; numero: string }> }
  const podeVer =
    gate.me.role_global === 'superadmin' ||
    hasPermission(gate.me, 'estoque', 'view') ||
    hasPermission(gate.me, 'estoque_entradas', 'view') ||
    hasPermission(gate.me, 'estoque_retiradas', 'view') ||
    hasPermission(gate.me, 'estoque_transferencias', 'view') ||
    hasPermission(gate.me, 'estoque_ajustes', 'view') ||
    hasPermission(gate.me, 'estoque_remessas', 'view') ||
    hasPermission(gate.me, 'estoque_requisicoes', 'view') ||
    hasPermission(gate.me, 'estoque_atendimento', 'view')
  if (!podeVer) return { error: 'Sem permissão para ver séries.', series: [] }

  const supabase = await createClient()
  let query = supabase
    .from('est_series')
    .select('id, numero')
    .eq('empresa_id', gate.empresaId)
    .eq('sku_id', skuId)
    .eq('situacao', situacao)
    .order('numero')
    .limit(200)
  if (situacao === 'em_estoque' && localId) query = query.eq('local_id', localId)
  const { data, error } = await query
  if (error) return { error: error.message, series: [] }
  return { series: data || [] }
}

export async function atribuirSerieAction(input: { skuId: string; localId: string; numero: string }) {
  const gate = await empresaDoUsuario()
  if ('error' in gate) return { error: gate.error }
  const pode =
    gate.me.role_global === 'superadmin' ||
    hasPermission(gate.me, 'estoque_ajustes', 'create') ||
    hasPermission(gate.me, 'estoque', 'edit')
  if (!pode) return { error: 'Sem permissão para inventariar série.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('est_atribuir_serie_saldo', {
    p_empresa_id: gate.empresaId,
    p_sku_id: input.skuId,
    p_local_id: input.localId,
    p_numero: input.numero.trim(),
    p_usuario_id: gate.me.id,
  })
  if (error) {
    const texto = error.message.replace(/^[^:]+:\s*/, '')
    return { error: texto || 'Não foi possível atribuir a série.' }
  }
  revalidatePath('/cockpit/estoque/series')
  revalidatePath('/cockpit/estoque/saldos')
  return { ok: true as const }
}
