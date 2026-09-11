import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { assertAddonsInternalSecret } from '@/lib/addons/internal-api-auth'
import { getEmpresaAddonLines } from '@/lib/addons/entitlements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Entitlements + linha comercial da empresa.
 * Query `?include_prices=1` inclui preços efetivos (RN3).
 * Default: enabled, commercial_status, plano, quantity — sem preços.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = assertAddonsInternalSecret(request)
  if (denied) return denied

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'empresa id obrigatório' }, { status: 400 })
  }

  const url = new URL(request.url)
  const includePrices = url.searchParams.get('include_prices') === '1'

  const admin = createAdminClient()
  const { data: empresa, error } = await admin
    .from('empresas')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!empresa) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
  }

  const lines = await getEmpresaAddonLines(id, admin)

  return NextResponse.json({
    empresa_id: id,
    tenant_id: id,
    addons: lines.map((line) => {
      const base = {
        codigo: line.addon_codigo,
        nome: line.registry.nome,
        tipo: line.registry.tipo,
        enabled: line.enabled,
        commercial_status: line.commercial_status,
        plano: line.plano,
        quantity: line.quantity,
        billable: line.registry.billable,
        billing_model: line.registry.billing_model,
        starts_at: line.starts_at,
        ends_at: line.ends_at,
      }
      if (!includePrices) return base
      return {
        ...base,
        price_override_cents: line.price_override_cents,
        list_price_cents: line.registry.list_price_cents,
        effective_price_cents: line.effective_price_cents,
        currency: line.registry.currency,
      }
    }),
  })
}
