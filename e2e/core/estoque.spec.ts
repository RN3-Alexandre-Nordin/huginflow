import { createClient } from '@supabase/supabase-js'
import { expect, resetUi, test } from '../fixtures'
import { ensureAuthenticated, loginAsTestUser } from '../helpers/auth'
import {
  assertDevTestTarget,
  getTestEmail,
  getTestPassword,
  getTestTenantId,
} from '../helpers/env'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

function adminClient() {
  if (process.env.TEST_ALLOW_MUTATIONS !== '1') {
    throw new Error('Estoque E2E mutável exige TEST_ALLOW_MUTATIONS=1')
  }
  assertDevTestTarget()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin env ausente')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function setEstoqueEnabled(enabled: boolean) {
  const admin = adminClient()
  const { error } = await admin
    .from('empresa_addons')
    .update({
      enabled,
      commercial_status: enabled ? 'active' : 'ended',
      updated_at: new Date().toISOString(),
    })
    .eq('empresa_id', getTestTenantId())
    .eq('addon_codigo', 'estoque')
  if (error) throw new Error(`setEstoqueEnabled: ${error.message}`)
}

async function readEstoqueEnabled() {
  const admin = adminClient()
  const { data, error } = await admin
    .from('empresa_addons')
    .select('enabled')
    .eq('empresa_id', getTestTenantId())
    .eq('addon_codigo', 'estoque')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data?.enabled)
}

test.describe('Estoque', () => {
  test('[UI-EST-ADDON-01] Sem addon estoque oculta menu e bloqueia URL', async ({ page }) => {
    const prev = await readEstoqueEnabled()
    try {
      await setEstoqueEnabled(false)
      await loginAsTestUser(page, {
        email: getTestEmail(),
        password: getTestPassword(),
      })
      await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
      await hideDevOverlays(page)
      await expect(page.getByTestId('nav-estoque')).toHaveCount(0)

      await page.goto('/cockpit/estoque', { waitUntil: 'domcontentloaded' })
      if ((await page.url()).includes('acesso-negado')) {
        await expect(page).toHaveURL(/acesso-negado/)
      } else {
        await expect(page.getByTestId('hub-card-locais')).toHaveCount(0)
      }
    } finally {
      await setEstoqueEnabled(prev)
    }
  })

  test('[UI-EST-NAV-01] Hub Estoque mostra cards e listas operacionais abrem', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)

    await expect(page.getByTestId('estoque-hub')).toBeVisible()
    const cards = [
      'hub-card-locais',
      'hub-card-estoque-config',
      'hub-card-entradas',
      'hub-card-retiradas',
      'hub-card-transferencias',
      'hub-card-ajustes',
      'hub-card-remessas',
      'hub-card-requisicoes',
      'hub-card-saldos',
      'hub-card-cardex',
      'hub-card-estoque-relatorios',
    ]
    for (const id of cards) {
      await expect(page.getByTestId(id)).toBeVisible()
    }

    await page.getByTestId('hub-card-entradas').click()
    await expect(page).toHaveURL(/\/cockpit\/estoque\/entradas/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-EST-LOC-01] Locais de estoque carrega', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/locais', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/locais/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-EST-CFG-01] Configuração do estoque carrega', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/configuracao', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/configuracao/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-EST-SAL-01] Consulta Saldos carrega', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/saldos', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/saldos/)
  })

  test('[UI-EST-CAR-01] Cardex carrega sem erro e com painel', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/cardex', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/cardex/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
    await expect(page.getByTestId('estoque-cardex-panel')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('estoque-cardex-error')).toHaveCount(0)
    await expect(page.getByText(/statement timeout/i)).toHaveCount(0)
  })

  test('[UI-EST-CAR-02] Cardex busca por código SKU com hífen (sem timeout)', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)

    const admin = adminClient()
    const tenantId = getTestTenantId()
    const { data: skuRow } = await admin
      .from('cad_skus')
      .select('codigo')
      .eq('empresa_id', tenantId)
      .eq('controla_estoque', true)
      .not('codigo', 'is', null)
      .limit(1)
      .maybeSingle()

    // Preferir código com hífen (regressão DEST-011); senão qualquer SKU do tenant
    let codigo = skuRow?.codigo as string | undefined
    const { data: hyphenSku } = await admin
      .from('cad_skus')
      .select('codigo')
      .eq('empresa_id', tenantId)
      .eq('controla_estoque', true)
      .like('codigo', '%-%')
      .limit(1)
      .maybeSingle()
    if (hyphenSku?.codigo) codigo = hyphenSku.codigo as string

    test.skip(!codigo, 'Tenant sem SKU para busca no Cardex')

    await page.goto(`/cockpit/estoque/cardex?q=${encodeURIComponent(codigo!)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    await hideDevOverlays(page)
    await expect(page.getByTestId('estoque-cardex-panel')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('estoque-cardex-error')).toHaveCount(0)
    await expect(page.getByText(/Erro ao carregar Cardex/i)).toHaveCount(0)
    await expect(page.getByText(/statement timeout/i)).toHaveCount(0)
    // Tabela ou empty — ambos OK; o bug era timeout/erro
    const table = page.getByTestId('estoque-cardex-table')
    const empty = page.getByTestId('estoque-cardex-empty')
    await expect(table.or(empty)).toBeVisible()
  })

  test('[UI-EST-REL-01] Hub Relatórios de estoque carrega', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/relatorios', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/relatorios/)
  })

  test('[UI-EST-LOTE-01] Config FEFO, saldos validade e relatório de lotes', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)

    await page.goto('/cockpit/estoque/configuracao', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
    const loteTab = page.getByRole('tab', { name: /Lote e validade/i })
    if ((await loteTab.count()) > 0) {
      await loteTab.click()
      await expect(page.getByText(/Sugerir FEFO nas saídas/i)).toBeVisible()
    }

    await page.goto('/cockpit/estoque/saldos?validade=a_vencer', {
      waitUntil: 'domcontentloaded',
    })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/validade=a_vencer/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)

    await page.goto('/cockpit/estoque/relatorios/validade-lotes', {
      waitUntil: 'domcontentloaded',
    })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/validade-lotes/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-EST-LOTE-02] Rotas operacionais com LotePicker carregam', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)

    const routes = [
      '/cockpit/estoque/retiradas/novo',
      '/cockpit/estoque/ajustes/novo',
      '/cockpit/estoque/transferencias/novo',
      '/cockpit/estoque/remessas/novo',
    ]
    for (const path of routes) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await hideDevOverlays(page)
      await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
    }
  })

  test('[UI-EST-SERIE-01] Série unitária ainda fora do kernel — skip', async () => {
    test.skip(true, 'controla_serie / UI de série unitária ainda não implementados (MVP = lote/batch)')
  })
})
