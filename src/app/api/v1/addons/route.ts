import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { assertAddonsInternalSecret } from '@/lib/addons/internal-api-auth'
import { listAddonRegistry } from '@/lib/addons/entitlements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Catálogo global de addons.
 * Query: `?include_prices=1` inclui list_price_cents / currency / sku_externo (sistemas RN3).
 * Sem isso, resposta sem preços (integrações genéricas).
 */
export async function GET(request: Request) {
  const denied = assertAddonsInternalSecret(request)
  if (denied) return denied

  const url = new URL(request.url)
  const includePrices = url.searchParams.get('include_prices') === '1'
  const onlyActive = url.searchParams.get('only_active') !== '0'
  const onlyBillable = url.searchParams.get('only_billable') === '1'

  const admin = createAdminClient()
  const rows = await listAddonRegistry(
    { onlyActive, onlyBillable },
    admin,
  )

  return NextResponse.json({
    addons: rows.map((row) => {
      const base = {
        codigo: row.codigo,
        nome: row.nome,
        descricao: row.descricao,
        tipo: row.tipo,
        sort_order: row.sort_order,
        ativo: row.ativo,
        default_enabled: row.default_enabled,
        rn3_only: row.rn3_only,
        billable: row.billable,
        billing_model: row.billing_model,
      }
      if (!includePrices) return base
      return {
        ...base,
        list_price_cents: row.list_price_cents,
        currency: row.currency,
        sku_externo: row.sku_externo,
      }
    }),
  })
}
