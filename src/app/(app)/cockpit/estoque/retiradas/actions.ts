'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import {
  processarLoteRetirada,
  type ItemRetiradaInput,
} from '@/lib/estoque/operacoes-avancadas'

const LIST_PATH = '/cockpit/estoque/retiradas'

export async function criarRetiradaAction(data: {
  observacao?: string
  movimento_em?: string
  itens: ItemRetiradaInput[]
}) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate =
    isSuperAdmin ||
    hasPermission(me, 'estoque_retiradas', 'create') ||
    hasPermission(me, 'estoque', 'edit')

  if (!canCreate) {
    return { error: 'Sem permissão para registrar retiradas de estoque.' }
  }

  const empresaId = me?.empresa_id ?? ''
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  const res = await processarLoteRetirada(
    {
      empresa_id: empresaId,
      usuario_id: me.id,
      observacao: data.observacao,
      movimento_em: data.movimento_em,
      itens: data.itens,
    },
    supabase
  )

  if (!res.sucesso) {
    return { error: res.mensagem }
  }

  try {
    revalidatePath(LIST_PATH)
    revalidatePath('/cockpit/estoque')
    revalidatePath('/cockpit/estoque/cardex')
    revalidatePath('/cockpit/estoque/saldos')
    if (res.loteId) {
      revalidatePath(`${LIST_PATH}/${res.loteId}`)
    }
  } catch {
    // commit já ocorreu
  }

  return res
}
