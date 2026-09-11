'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getMyProfile } from '@/lib/auth/getMyProfile'
import {
  backfillAddonForAllEmpresas,
  type AddonTipo,
  type BillingModel,
} from '@/lib/addons/entitlements'
import { isReservedAddonCodigo, slugifyAddonCodigo } from '@/lib/addons/sku'

const BILLING_MODELS = new Set<BillingModel>(['flat', 'per_seat', 'usage', 'included'])

export type AddonRegistryInput = {
  /** Ignorado no create — gerado do nome. Obrigatório no update (chave). */
  codigo?: string
  nome: string
  descricao: string | null
  tipo: AddonTipo
  sort_order: number
  ativo: boolean
  default_enabled: boolean
  rn3_only: boolean
  billable: boolean
  billing_model: BillingModel
  list_price_cents: number | null
  currency: string
  /** Só create: popular empresa_addons em todas as empresas */
  backfillEmpresas?: boolean
}

function parseFields(raw: AddonRegistryInput) {
  const nome = String(raw.nome ?? '').trim()
  if (!nome) throw new Error('nome obrigatório')

  const tipo: AddonTipo = raw.tipo === 'foundation' ? 'foundation' : 'addon'
  const billing_model = BILLING_MODELS.has(raw.billing_model)
    ? raw.billing_model
    : 'flat'

  let list_price_cents: number | null = null
  if (raw.list_price_cents != null && raw.list_price_cents !== ('' as unknown)) {
    const n = Number(raw.list_price_cents)
    if (!Number.isFinite(n) || n < 0) throw new Error('list_price_cents inválido')
    list_price_cents = Math.floor(n)
  }

  return {
    nome,
    descricao: raw.descricao?.trim() ? String(raw.descricao).trim() : null,
    tipo,
    sort_order: Math.floor(Number(raw.sort_order) || 0),
    ativo: Boolean(raw.ativo),
    default_enabled: tipo === 'foundation' ? true : Boolean(raw.default_enabled),
    rn3_only: Boolean(raw.rn3_only),
    billable: tipo === 'foundation' ? false : Boolean(raw.billable),
    billing_model: tipo === 'foundation' ? ('included' as const) : billing_model,
    list_price_cents: tipo === 'foundation' ? null : list_price_cents,
    currency: (String(raw.currency ?? 'BRL').trim() || 'BRL').toUpperCase(),
    backfillEmpresas: raw.backfillEmpresas !== false,
  }
}

async function allocateUniqueCodigo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  nome: string,
): Promise<string> {
  const base = slugifyAddonCodigo(nome)
  if (isReservedAddonCodigo(base)) {
    throw new Error('Nome gera slug reservado. Escolha outro nome (evite “financeiro”).')
  }

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}_${i + 1}`
    const { data } = await admin
      .from('addon_registry')
      .select('codigo')
      .eq('codigo', candidate)
      .maybeSingle()
    if (!data) return candidate
  }

  throw new Error('Não foi possível gerar SKU interno único a partir do nome.')
}

async function requireSuperadmin() {
  const me = await getMyProfile()
  if (!me || me.role_global !== 'superadmin') {
    return { error: 'Apenas superadmin RN3 pode gerenciar o catálogo de addons.' as const, me: null }
  }
  return { error: null, me }
}

export async function createAddonRegistry(
  input: AddonRegistryInput,
): Promise<{ ok: true; codigo: string } | { error: string }> {
  const gate = await requireSuperadmin()
  if (gate.error || !gate.me) return { error: gate.error ?? 'Negado' }

  let fields
  try {
    fields = parseFields(input)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Payload inválido' }
  }

  const admin = createAdminClient()
  let codigo: string
  try {
    codigo = await allocateUniqueCodigo(admin, fields.nome)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha ao gerar SKU' }
  }

  const now = new Date().toISOString()

  const { error } = await admin.from('addon_registry').insert({
    codigo,
    nome: fields.nome,
    descricao: fields.descricao,
    tipo: fields.tipo,
    sort_order: fields.sort_order,
    ativo: fields.ativo,
    default_enabled: fields.default_enabled,
    rn3_only: fields.rn3_only,
    billable: fields.billable,
    billing_model: fields.billing_model,
    list_price_cents: fields.list_price_cents,
    currency: fields.currency,
    sku_externo: null,
    updated_at: now,
    updated_by: gate.me.id,
  })

  if (error) {
    if (error.code === '23505') return { error: `Código "${codigo}" já existe. Tente de novo.` }
    return { error: error.message }
  }

  if (fields.backfillEmpresas) {
    try {
      await backfillAddonForAllEmpresas(
        codigo,
        fields.default_enabled,
        admin,
        gate.me.id,
      )
    } catch (e) {
      console.error('backfill após createAddonRegistry', e)
      return {
        error:
          'Addon criado, mas falhou o backfill nas empresas. Rode ensure na ficha ou tente de novo.',
      }
    }
  }

  revalidatePath('/cockpit/addons')
  revalidatePath('/cockpit/empresas')
  return { ok: true, codigo }
}

export async function updateAddonRegistry(
  codigo: string,
  input: AddonRegistryInput,
): Promise<{ ok: true } | { error: string }> {
  const gate = await requireSuperadmin()
  if (gate.error || !gate.me) return { error: gate.error ?? 'Negado' }

  const codigoKey = String(codigo ?? '')
    .trim()
    .toLowerCase()
  if (!codigoKey) return { error: 'codigo inválido' }

  const admin = createAdminClient()
  const { data: existing, error: loadError } = await admin
    .from('addon_registry')
    .select('codigo, tipo')
    .eq('codigo', codigoKey)
    .maybeSingle()

  if (loadError) return { error: loadError.message }
  if (!existing) return { error: 'Addon não encontrado.' }

  let fields
  try {
    fields = parseFields(input)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Payload inválido' }
  }

  if (existing.tipo === 'foundation' && fields.tipo !== 'foundation') {
    return { error: 'Não é permitido alterar tipo de um addon foundation.' }
  }
  if (existing.tipo === 'foundation') {
    fields.default_enabled = true
    fields.billable = false
    fields.billing_model = 'included'
    fields.list_price_cents = null
  }

  const { error } = await admin
    .from('addon_registry')
    .update({
      nome: fields.nome,
      descricao: fields.descricao,
      tipo: existing.tipo === 'foundation' ? 'foundation' : fields.tipo,
      sort_order: fields.sort_order,
      ativo: fields.ativo,
      default_enabled: fields.default_enabled,
      rn3_only: fields.rn3_only,
      billable: fields.billable,
      billing_model: fields.billing_model,
      list_price_cents: fields.list_price_cents,
      currency: fields.currency,
      updated_at: new Date().toISOString(),
      updated_by: gate.me.id,
    })
    .eq('codigo', codigoKey)

  if (error) return { error: error.message }

  revalidatePath('/cockpit/addons')
  revalidatePath('/cockpit/empresas')
  return { ok: true }
}

/** Soft-delete: ativo=false. Foundation não desativa. */
export async function deactivateAddonRegistry(
  codigo: string,
): Promise<{ ok: true } | { error: string }> {
  const gate = await requireSuperadmin()
  if (gate.error || !gate.me) return { error: gate.error ?? 'Negado' }

  const codigoKey = String(codigo ?? '')
    .trim()
    .toLowerCase()
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('addon_registry')
    .select('codigo, tipo')
    .eq('codigo', codigoKey)
    .maybeSingle()

  if (!existing) return { error: 'Addon não encontrado.' }
  if (existing.tipo === 'foundation') {
    return { error: 'Foundation não pode ser desativado por aqui (cadastros é base da plataforma).' }
  }

  const { error } = await admin
    .from('addon_registry')
    .update({
      ativo: false,
      updated_at: new Date().toISOString(),
      updated_by: gate.me.id,
    })
    .eq('codigo', codigoKey)

  if (error) return { error: error.message }

  revalidatePath('/cockpit/addons')
  return { ok: true }
}
