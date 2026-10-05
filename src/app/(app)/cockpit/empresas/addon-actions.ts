'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getMyProfile } from '@/lib/auth/getMyProfile'
import {
  type CommercialStatus,
  type EmpresaAddonUpdateInput,
  upsertEmpresaAddonLines,
} from '@/lib/addons/entitlements'

const COMMERCIAL_STATUSES = new Set<CommercialStatus>([
  'active',
  'trial',
  'courtesy',
  'suspended',
  'ended',
])

function parseCommercialStatus(value: unknown): CommercialStatus {
  const raw = String(value ?? 'active')
  return COMMERCIAL_STATUSES.has(raw as CommercialStatus)
    ? (raw as CommercialStatus)
    : 'active'
}

function parseNullableCents(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.round(n))
}

function parseNullableDate(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

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

  const normalized: EmpresaAddonUpdateInput[] = updates.map((item) => ({
    addon_codigo: String(item.addon_codigo ?? '').trim(),
    enabled: Boolean(item.enabled),
    plano: item.plano == null || item.plano === '' ? null : String(item.plano),
    commercial_status: parseCommercialStatus(item.commercial_status),
    quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
    price_override_cents: parseNullableCents(item.price_override_cents),
    starts_at: parseNullableDate(item.starts_at),
    ends_at: parseNullableDate(item.ends_at),
  }))

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
  return { ok: true }
}
