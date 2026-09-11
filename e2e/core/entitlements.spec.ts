import { test, expect } from '../fixtures'
import { createClient } from '@supabase/supabase-js'
import { ensureAuthenticated, loginAsTestUser } from '../helpers/auth'
import { assertDevTestTarget, getBaseUrl, getTestEmail, getTestPassword, getTestTenantId } from '../helpers/env'
import { hideDevOverlays } from '../helpers/overlays'

function adminClient() {
  if (process.env.TEST_ALLOW_MUTATIONS !== '1') {
    throw new Error('Entitlements E2E exige TEST_ALLOW_MUTATIONS=1')
  }
  assertDevTestTarget()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin env ausente')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function setAddonEnabled(codigo: string, enabled: boolean) {
  const admin = adminClient()
  const tenantId = getTestTenantId()
  const { error } = await admin
    .from('empresa_addons')
    .update({
      enabled,
      commercial_status: enabled ? 'active' : 'ended',
      updated_at: new Date().toISOString(),
    })
    .eq('empresa_id', tenantId)
    .eq('addon_codigo', codigo)
  if (error) throw new Error(`setAddonEnabled ${codigo}: ${error.message}`)
}

async function readAddonEnabled(codigo: string) {
  const admin = adminClient()
  const { data, error } = await admin
    .from('empresa_addons')
    .select('enabled')
    .eq('empresa_id', getTestTenantId())
    .eq('addon_codigo', codigo)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data?.enabled)
}

test.describe('Entitlements', () => {
  test('[UI-ENT-01] workflow off oculta Funis e bloqueia URL', async ({ page }) => {
    const prev = await readAddonEnabled('workflow')
    try {
      await setAddonEnabled('workflow', false)

      await loginAsTestUser(page, {
        email: getTestEmail(),
        password: getTestPassword(),
      })
      await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
      await hideDevOverlays(page)

      await expect(page.getByTestId('nav-funis')).toHaveCount(0)
      await expect(page.getByTestId('hub-card-funis')).toHaveCount(0)
      await page.goto('/cockpit/workflow', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('hub-card-funis')).toHaveCount(0)

      await page.goto('/cockpit/crm/funis', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/acesso-negado/)
      await expect(page.getByText(/módulo não habilitado/i)).toBeVisible()
    } finally {
      await setAddonEnabled('workflow', prev)
    }
  })

  test('[UI-ENT-02] omni off oculta Chat e bloqueia URL', async ({ page }) => {
    const prev = await readAddonEnabled('omni')
    try {
      await setAddonEnabled('omni', false)

      await loginAsTestUser(page, {
        email: getTestEmail(),
        password: getTestPassword(),
      })
      await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
      await hideDevOverlays(page)

      await expect(page.getByTestId('nav-omni')).toHaveCount(0)

      await page.goto('/cockpit/crm/chat', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/acesso-negado/)
    } finally {
      await setAddonEnabled('omni', prev)
    }
  })

  test('[API-ENT-01] catálogo e addons da empresa com Bearer', async ({ request }) => {
    const secret = process.env.HUGIN_ADDONS_INTERNAL_SECRET?.trim()
    test.skip(!secret, 'HUGIN_ADDONS_INTERNAL_SECRET ausente')

    const base = getBaseUrl().replace(/\/$/, '')
    const tenantId = getTestTenantId()

    const catalog = await request.get(`${base}/api/v1/addons`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    expect(catalog.status()).toBe(200)
    const catalogJson = await catalog.json()
    expect(catalogJson.addons.some((a: { codigo: string }) => a.codigo === 'workflow')).toBeTruthy()
    expect(catalogJson.addons.some((a: { codigo: string }) => a.codigo === 'financeiro')).toBeFalsy()

    const empresa = await request.get(`${base}/api/v1/empresas/${tenantId}`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    expect(empresa.status()).toBe(200)
    const empresaJson = await empresa.json()
    expect(empresaJson.empresa.tenant_id).toBe(tenantId)

    const addons = await request.get(`${base}/api/v1/empresas/${tenantId}/addons`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    expect(addons.status()).toBe(200)
    const addonsJson = await addons.json()
    expect(addonsJson.tenant_id).toBe(tenantId)
    expect(Array.isArray(addonsJson.addons)).toBeTruthy()
    expect(addonsJson.addons[0]).not.toHaveProperty('list_price_cents')

    const unauthorized = await request.get(`${base}/api/v1/addons`)
    expect(unauthorized.status()).toBe(401)
  })

  test('[UI-ENT-03] finance RN3 continua rn3Only (tenant sem menu)', async ({ page }) => {
    await ensureAuthenticated(page)
    await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByRole('link', { name: 'Financeiro' })).toHaveCount(0)
    await page.goto('/cockpit/financeiro', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/acesso-negado/)
  })
})
