import { expect, resetUi, test } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

test.describe('Cadastros mestres', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
    await hideDevOverlays(page)
  })

  test('[UI-CAD-01] Hub Cadastros lista cards de mestres', async ({ page }) => {
    await page.goto('/cockpit/cadastros', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)

    await expect(page.getByTestId('cadastros-hub')).toBeVisible()
    await expect(page.getByTestId('hub-card-pessoas')).toBeVisible()
    await expect(page.getByTestId('hub-card-skus')).toBeVisible()
    await expect(page.getByTestId('hub-card-sku-familias')).toBeVisible()
    await expect(page.getByTestId('hub-card-conversoes-um')).toBeVisible()
    await expect(page.getByTestId('hub-card-sku-depara')).toBeVisible()
    await expect(page.getByTestId('hub-card-ativos')).toBeVisible()
  })

  test('[UI-CAD-02] Lista Pessoas carrega', async ({ page }) => {
    await page.goto('/cockpit/crm/leads', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByTestId('pessoas-page')).toBeVisible()
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-CAD-03] Lista SKUs carrega', async ({ page }) => {
    await page.goto('/cockpit/cadastros/skus', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByTestId('skus-page')).toBeVisible()
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-CAD-04] Lista Famílias de SKU carrega', async ({ page }) => {
    await page.goto('/cockpit/cadastros/sku-familias', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByTestId('sku-familias-page')).toBeVisible()
  })

  test('[UI-CAD-05] Lista Conversões UM carrega', async ({ page }) => {
    await page.goto('/cockpit/cadastros/conversoes-um', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByTestId('conversoes-um-page')).toBeVisible()
  })

  test('[UI-CAD-06] Lista De-para SKU carrega', async ({ page }) => {
    await page.goto('/cockpit/cadastros/sku-depara', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByTestId('sku-depara-page')).toBeVisible()
  })

  test('[UI-CAD-07] Lista Ativos carrega', async ({ page }) => {
    await page.goto('/cockpit/cadastros/ativos', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByTestId('ativos-page')).toBeVisible()
  })
})
