/**
 * Motor de entitlements da plataforma Hugin.
 *
 * Eixos (nunca misturar):
 * 1. Entitlement técnico — `empresa_addons.enabled` (este módulo)
 * 2. RBAC — `hasPermission` / matriz de grupos (fora daqui)
 * 3. Comercial (leitura) — plano, commercial_status, preços — NÃO gera `finance_contratos`
 *
 * Billing SaaS RN3 (`finance_*`) NÃO é addon: gate de plataforma `rn3Only`.
 * FinOps do cliente (futuro) = slug `finops` — rotas/tabelas próprias.
 *
 * `codigo` é string validada no `addon_registry` (catálogo dinâmico), não enum fechado no código.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

/** SKU interno; validar sempre contra o registry (não hardcodar união fechada). */
export type AddonCodigo = string

export type AddonTipo = 'foundation' | 'addon'
export type BillingModel = 'flat' | 'per_seat' | 'usage' | 'included'
export type CommercialStatus = 'active' | 'trial' | 'courtesy' | 'suspended' | 'ended'

export type AddonRegistryRow = {
  codigo: AddonCodigo
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
  sku_externo: string | null
  config_schema: Record<string, unknown>
}

export type EmpresaAddonRow = {
  empresa_id: string
  addon_codigo: AddonCodigo
  enabled: boolean
  plano: string | null
  commercial_status: CommercialStatus
  quantity: number
  price_override_cents: number | null
  starts_at: string | null
  ends_at: string | null
  config_json: Record<string, unknown>
  updated_at: string
  updated_by: string | null
}

/** Linha comercial + catálogo (UI / futura fatura RN3). Sem dependência de finance_contratos. */
export type EmpresaAddonLine = EmpresaAddonRow & {
  registry: AddonRegistryRow
  /** Override da empresa, senão list_price do catálogo. */
  effective_price_cents: number | null
}

/** Payload para seed em createEmpresa (W3). */
export type EmpresaAddonDefault = {
  addon_codigo: AddonCodigo
  enabled: boolean
  commercial_status: CommercialStatus
  quantity: number
}

export class AddonEntitlementError extends Error {
  readonly code = 'ADDON_NOT_ENTITLED' as const

  constructor(
    public readonly empresaId: string,
    public readonly addonCodigo: AddonCodigo,
  ) {
    super(`Addon "${addonCodigo}" não habilitado para a empresa.`)
    this.name = 'AddonEntitlementError'
  }
}

export class AddonUnknownError extends Error {
  readonly code = 'ADDON_UNKNOWN' as const

  constructor(public readonly addonCodigo: AddonCodigo) {
    super(`Addon "${addonCodigo}" não existe no catálogo.`)
    this.name = 'AddonUnknownError'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EntitlementsDb = SupabaseClient<any, 'public', any>

async function resolveClient(client?: EntitlementsDb): Promise<EntitlementsDb> {
  if (client) return client
  return await createClient()
}

const REGISTRY_SELECT =
  'codigo, nome, descricao, tipo, sort_order, ativo, default_enabled, rn3_only, billable, billing_model, list_price_cents, currency, sku_externo, config_schema'

const EMPRESA_ADDON_SELECT =
  'empresa_id, addon_codigo, enabled, plano, commercial_status, quantity, price_override_cents, starts_at, ends_at, config_json, updated_at, updated_by'

function mapRegistry(row: Record<string, unknown>): AddonRegistryRow {
  return {
    codigo: String(row.codigo),
    nome: String(row.nome ?? ''),
    descricao: row.descricao == null ? null : String(row.descricao),
    tipo: row.tipo === 'foundation' ? 'foundation' : 'addon',
    sort_order: Number(row.sort_order ?? 0),
    ativo: Boolean(row.ativo),
    default_enabled: Boolean(row.default_enabled),
    rn3_only: Boolean(row.rn3_only),
    billable: Boolean(row.billable),
    billing_model: (row.billing_model as BillingModel) || 'flat',
    list_price_cents:
      row.list_price_cents == null ? null : Number(row.list_price_cents),
    currency: String(row.currency ?? 'BRL'),
    sku_externo: row.sku_externo == null ? null : String(row.sku_externo),
    config_schema:
      row.config_schema && typeof row.config_schema === 'object'
        ? (row.config_schema as Record<string, unknown>)
        : {},
  }
}

function mapEmpresaAddon(row: Record<string, unknown>): EmpresaAddonRow {
  return {
    empresa_id: String(row.empresa_id),
    addon_codigo: String(row.addon_codigo),
    enabled: Boolean(row.enabled),
    plano: row.plano == null ? null : String(row.plano),
    commercial_status: (row.commercial_status as CommercialStatus) || 'active',
    quantity: Number(row.quantity ?? 1),
    price_override_cents:
      row.price_override_cents == null ? null : Number(row.price_override_cents),
    starts_at: row.starts_at == null ? null : String(row.starts_at),
    ends_at: row.ends_at == null ? null : String(row.ends_at),
    config_json:
      row.config_json && typeof row.config_json === 'object'
        ? (row.config_json as Record<string, unknown>)
        : {},
    updated_at: String(row.updated_at ?? ''),
    updated_by: row.updated_by == null ? null : String(row.updated_by),
  }
}

export function effectiveListPriceCents(
  line: Pick<EmpresaAddonRow, 'price_override_cents'>,
  registry: Pick<AddonRegistryRow, 'list_price_cents'>,
): number | null {
  if (line.price_override_cents != null) return line.price_override_cents
  return registry.list_price_cents
}

export async function listAddonRegistry(
  options: { onlyActive?: boolean; onlyBillable?: boolean } = {},
  client?: EntitlementsDb,
): Promise<AddonRegistryRow[]> {
  const supabase = await resolveClient(client)
  let query = supabase.from('addon_registry').select(REGISTRY_SELECT).order('sort_order', {
    ascending: true,
  })

  if (options.onlyActive) query = query.eq('ativo', true)
  if (options.onlyBillable) query = query.eq('billable', true)

  const { data, error } = await query
  if (error) throw new Error(`listAddonRegistry: ${error.message}`)
  return (data ?? []).map((row) => mapRegistry(row as Record<string, unknown>))
}

export async function getAddonRegistryByCodigo(
  codigo: AddonCodigo,
  client?: EntitlementsDb,
): Promise<AddonRegistryRow | null> {
  const supabase = await resolveClient(client)
  const { data, error } = await supabase
    .from('addon_registry')
    .select(REGISTRY_SELECT)
    .eq('codigo', codigo)
    .maybeSingle()

  if (error) throw new Error(`getAddonRegistryByCodigo: ${error.message}`)
  if (!data) return null
  return mapRegistry(data as Record<string, unknown>)
}

/** Valida SKU no catálogo (falha se não existir). */
export async function assertAddonInRegistry(
  codigo: AddonCodigo,
  client?: EntitlementsDb,
): Promise<AddonRegistryRow> {
  const row = await getAddonRegistryByCodigo(codigo, client)
  if (!row) throw new AddonUnknownError(codigo)
  return row
}

export async function isFoundationAddon(
  codigo: AddonCodigo,
  client?: EntitlementsDb,
): Promise<boolean> {
  const row = await getAddonRegistryByCodigo(codigo, client)
  return row?.tipo === 'foundation'
}

/**
 * Mapa codigo → enabled (técnico). Foundation ativo no registry conta como true
 * mesmo se a linha estiver inconsistente.
 */
export async function getEmpresaAddons(
  empresaId: string,
  client?: EntitlementsDb,
): Promise<Record<string, boolean>> {
  const supabase = await resolveClient(client)
  const [registry, { data, error }] = await Promise.all([
    listAddonRegistry({ onlyActive: true }, supabase),
    supabase
      .from('empresa_addons')
      .select('addon_codigo, enabled')
      .eq('empresa_id', empresaId),
  ])

  if (error) throw new Error(`getEmpresaAddons: ${error.message}`)

  const byCodigo = new Map(
    (data ?? []).map((row) => [String(row.addon_codigo), Boolean(row.enabled)]),
  )

  const result: Record<string, boolean> = {}
  for (const item of registry) {
    if (item.tipo === 'foundation') {
      result[item.codigo] = true
      continue
    }
    result[item.codigo] = byCodigo.get(item.codigo) === true
  }
  return result
}

/**
 * Eixo técnico: empresa tem acesso ao addon?
 * Foundation ativo → sempre true. Addon inativo no catálogo → false.
 */
export async function empresaHasAddon(
  empresaId: string,
  codigo: AddonCodigo,
  client?: EntitlementsDb,
): Promise<boolean> {
  const supabase = await resolveClient(client)
  const registry = await getAddonRegistryByCodigo(codigo, supabase)
  if (!registry || !registry.ativo) return false
  if (registry.tipo === 'foundation') return true

  const { data, error } = await supabase
    .from('empresa_addons')
    .select('enabled')
    .eq('empresa_id', empresaId)
    .eq('addon_codigo', codigo)
    .maybeSingle()

  if (error) throw new Error(`empresaHasAddon: ${error.message}`)
  return Boolean(data?.enabled)
}

export async function assertEmpresaAddon(
  empresaId: string,
  codigo: AddonCodigo,
  client?: EntitlementsDb,
): Promise<void> {
  const ok = await empresaHasAddon(empresaId, codigo, client)
  if (!ok) throw new AddonEntitlementError(empresaId, codigo)
}

/**
 * Linhas comerciais + catálogo para UI e futura ponte de fatura (Sessão 7).
 * Não consulta nem exige `finance_contratos`.
 */
export async function getEmpresaAddonLines(
  empresaId: string,
  client?: EntitlementsDb,
): Promise<EmpresaAddonLine[]> {
  const supabase = await resolveClient(client)
  const { data, error } = await supabase
    .from('empresa_addons')
    .select(`${EMPRESA_ADDON_SELECT}, addon_registry ( ${REGISTRY_SELECT} )`)
    .eq('empresa_id', empresaId)

  if (error) throw new Error(`getEmpresaAddonLines: ${error.message}`)

  const lines: EmpresaAddonLine[] = []
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>
    const nested = row.addon_registry
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue
    const registry = mapRegistry(nested as Record<string, unknown>)
    const empresaAddon = mapEmpresaAddon(row)
    lines.push({
      ...empresaAddon,
      registry,
      effective_price_cents: effectiveListPriceCents(empresaAddon, registry),
    })
  }

  return lines.sort((a, b) => a.registry.sort_order - b.registry.sort_order)
}

/**
 * Defaults técnicos/comerciais para seed ao criar empresa (W3).
 * Fonte: registry ativo — SKU novo no banco entra automaticamente.
 */
export async function defaultsFromRegistry(
  client?: EntitlementsDb,
): Promise<EmpresaAddonDefault[]> {
  const registry = await listAddonRegistry({ onlyActive: true }, client)
  return registry.map((item) => ({
    addon_codigo: item.codigo,
    enabled: item.default_enabled,
    commercial_status: item.default_enabled ? 'active' : 'ended',
    quantity: 1,
  }))
}

/**
 * Insere linhas faltantes do catálogo (idempotente). Não sobrescreve enabled/comercial.
 * Usar com client service_role (escrita bloqueada para authenticated).
 */
export async function ensureEmpresaAddonRows(
  empresaId: string,
  client: EntitlementsDb,
  updatedBy?: string | null,
): Promise<void> {
  const defaults = await defaultsFromRegistry(client)
  if (defaults.length === 0) return

  const now = new Date().toISOString()
  const rows = defaults.map((item) => ({
    empresa_id: empresaId,
    addon_codigo: item.addon_codigo,
    enabled: item.enabled,
    commercial_status: item.commercial_status,
    quantity: item.quantity,
    updated_at: now,
    updated_by: updatedBy ?? null,
  }))

  const { error } = await client.from('empresa_addons').upsert(rows, {
    onConflict: 'empresa_id,addon_codigo',
    ignoreDuplicates: true,
  })

  if (error) throw new Error(`ensureEmpresaAddonRows: ${error.message}`)
}

/**
 * Ao criar SKU no catálogo: cria linha em todas as empresas (default_enabled).
 * Idempotente — não sobrescreve linhas existentes.
 */
export async function backfillAddonForAllEmpresas(
  addonCodigo: AddonCodigo,
  defaultEnabled: boolean,
  client: EntitlementsDb,
  updatedBy?: string | null,
): Promise<void> {
  const { data: empresas, error: empError } = await client.from('empresas').select('id')
  if (empError) throw new Error(`backfillAddonForAllEmpresas: ${empError.message}`)
  if (!empresas?.length) return

  const now = new Date().toISOString()
  const rows = empresas.map((e) => ({
    empresa_id: e.id as string,
    addon_codigo: addonCodigo,
    enabled: defaultEnabled,
    commercial_status: defaultEnabled ? 'active' : 'ended',
    quantity: 1,
    updated_at: now,
    updated_by: updatedBy ?? null,
  }))

  const { error } = await client.from('empresa_addons').upsert(rows, {
    onConflict: 'empresa_id,addon_codigo',
    ignoreDuplicates: true,
  })

  if (error) throw new Error(`backfillAddonForAllEmpresas: ${error.message}`)
}

export type EmpresaAddonUpdateInput = {
  addon_codigo: AddonCodigo
  enabled: boolean
  plano: string | null
  commercial_status: CommercialStatus
  quantity: number
  price_override_cents: number | null
  starts_at: string | null
  ends_at: string | null
}

/**
 * Upsert técnico + comercial. Caller deve garantir superadmin + service_role client.
 * Foundation: `enabled` forçado true.
 */
export async function upsertEmpresaAddonLines(
  empresaId: string,
  updates: EmpresaAddonUpdateInput[],
  client: EntitlementsDb,
  updatedBy?: string | null,
): Promise<void> {
  if (updates.length === 0) return

  const registry = await listAddonRegistry({}, client)
  const byCodigo = new Map(registry.map((r) => [r.codigo, r]))
  const now = new Date().toISOString()

  const rows = updates.map((item) => {
    const meta = byCodigo.get(item.addon_codigo)
    if (!meta) throw new AddonUnknownError(item.addon_codigo)

    const enabled = meta.tipo === 'foundation' ? true : Boolean(item.enabled)
    const commercial_status: CommercialStatus =
      meta.tipo === 'foundation'
        ? 'active'
        : item.commercial_status

    return {
      empresa_id: empresaId,
      addon_codigo: item.addon_codigo,
      enabled,
      plano: item.plano?.trim() ? item.plano.trim() : null,
      commercial_status,
      quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
      price_override_cents:
        item.price_override_cents == null
          ? null
          : Math.max(0, Math.floor(item.price_override_cents)),
      starts_at: item.starts_at || null,
      ends_at: item.ends_at || null,
      updated_at: now,
      updated_by: updatedBy ?? null,
    }
  })

  const { error } = await client.from('empresa_addons').upsert(rows, {
    onConflict: 'empresa_id,addon_codigo',
  })

  if (error) throw new Error(`upsertEmpresaAddonLines: ${error.message}`)
}
