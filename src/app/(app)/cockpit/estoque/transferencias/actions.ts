'use server'

import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import {
  gerarNumeroTransferencia,
  processarLoteTransferencia,
  type TransferenciaLoteInput,
} from '@/lib/estoque/operacoes-avancadas'
import { revalidatePath } from 'next/cache'

export async function consultarSaldoOrigemAction(skuId: string, localId: string) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { saldo: 0 }

  const supabase = await createClient()
  const { data } = await supabase
    .from('est_saldos')
    .select('quantidade')
    .eq('empresa_id', me.empresa_id)
    .eq('sku_id', skuId)
    .eq('local_id', localId)
    .maybeSingle()

  return { saldo: Number(data?.quantidade || 0) }
}

/** SKUs com saldo > 0 no local de origem (para o combobox da transferência). */
export async function listarSkusComSaldoNoLocalAction(localId: string) {
  const me = await getMyProfile()
  if (!me?.empresa_id || !localId) {
    return {
      skus: [] as Array<{
        id: string
        codigo: string
        nome: string
        unidade_estoque: string
        saldo: number
      }>,
    }
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('est_saldos')
    .select(
      `
      quantidade,
      cad_skus!est_saldos_sku_id_fkey (
        id,
        codigo,
        nome,
        unidade_estoque,
        ativo,
        controla_estoque
      )
    `
    )
    .eq('empresa_id', me.empresa_id)
    .eq('local_id', localId)
    .gt('quantidade', 0)

  const skus = (data || [])
    .map((row) => {
      const sku = row.cad_skus as {
        id: string
        codigo: string
        nome: string
        unidade_estoque: string
        ativo: boolean
        controla_estoque: boolean
      } | null
      if (!sku?.ativo || !sku.controla_estoque) return null
      return {
        id: sku.id,
        codigo: sku.codigo,
        nome: sku.nome,
        unidade_estoque: sku.unidade_estoque,
        saldo: Number(row.quantidade || 0),
      }
    })
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR'))

  return { skus }
}

/** Prévia do próximo número TRF-… (não reserva; a geração definitiva ocorre no submit). */
export async function previewNumeroTransferenciaAction() {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { numero: null as string | null }

  const supabase = await createClient()
  const numero = await gerarNumeroTransferencia(me.empresa_id, supabase)
  return { numero }
}

export async function criarTransferenciaLoteAction(
  input: Omit<TransferenciaLoteInput, 'usuario_id'>
) {
  const me = await getMyProfile()
  if (!me?.empresa_id) {
    return { error: 'Usuário não autenticado ou sem empresa vinculada.' }
  }

  const isSuperAdmin = me.role_global === 'superadmin'
  const permitido =
    isSuperAdmin ||
    hasPermission(me, 'estoque_transferencias', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!permitido) {
    return { error: 'Permissão insuficiente para realizar transferências de estoque.' }
  }

  const supabase = await createClient()

  const resultado = await processarLoteTransferencia({
    empresa_id: me.empresa_id,
    input: {
      ...input,
      usuario_id: me.id,
    },
    client: supabase,
  })

  if (resultado.sucesso) {
    try {
      revalidatePath('/cockpit/estoque/transferencias')
      revalidatePath('/cockpit/estoque/cardex')
      revalidatePath('/cockpit/estoque/saldos')
      if (resultado.loteId) {
        revalidatePath(`/cockpit/estoque/transferencias/${resultado.loteId}`)
      }
    } catch {
      // commit já ocorreu
    }
  }

  return resultado
}
