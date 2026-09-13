'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getMyProfile } from '@/lib/auth/getMyProfile'
import {
  type EmpresaAddonUpdateInput,
  normalizeAddonUpdates,
  upsertEmpresaAddonLines,
} from '@/lib/addons/entitlements'

/**
 * Persiste entitlements + linha comercial. Somente superadmin RN3.
 * Admin/operador: ignorado (não altera), mesmo com POST forjado.
 */
export async function updateEmpresaAddons(
  empresaId: string,
  updates: EmpresaAddonUpdateInput[],
): Promise<{ ok: true } | { error: string }> {
  const me = await getMyProfile()
  if (!me || me.role_global !== 'superadmin') {
    return { error: 'Apenas superadmin RN3 pode alterar addons da empresa.' }
  }

  if (!empresaId || !Array.isArray(updates)) {
    return { error: 'Payload inválido.' }
  }

  const normalized = normalizeAddonUpdates(updates)

  if (normalized.some((item) => !item.addon_codigo)) {
    return { error: 'addon_codigo obrigatório em cada linha.' }
  }

  try {
    const admin = createAdminClient()
    await upsertEmpresaAddonLines(empresaId, normalized, admin, me.id)
  } catch (err) {
    console.error('updateEmpresaAddons', err)
    return {
      error: err instanceof Error ? err.message : 'Falha ao salvar addons.',
    }
  }

  revalidatePath(`/cockpit/empresas/${empresaId}/editar`)
  revalidatePath('/cockpit/empresas')
  revalidatePath('/cockpit')
  revalidatePath('/cockpit/estoque')
  return { ok: true }
}
