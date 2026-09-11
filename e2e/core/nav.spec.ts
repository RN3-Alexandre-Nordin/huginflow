import { test, expect, resetUi } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

test.describe('Navegação', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
  })

  test('[UI-NAV-01] Menu: módulos flat (estilo Bifrost)', async ({ page }) => {
    await hideDevOverlays(page)
    await expect(page.getByTestId('nav-cockpit')).toBeVisible()
    await expect(page.getByTestId('nav-workflow')).toBeVisible()
    await expect(page.getByTestId('nav-omni')).toBeVisible()
    await expect(page.getByTestId('nav-cadastros')).toBeVisible()
    await expect(page.getByTestId('nav-funis')).toHaveCount(0)
    await expect(page.getByTestId('nav-pessoas')).toHaveCount(0)

    await page.getByTestId('nav-workflow').click()
    await expect(page).toHaveURL(/\/cockpit\/workflow/)
    await expect(page.getByTestId('hub-card-funis')).toBeVisible()

    await page.getByTestId('nav-cadastros').click()
    await expect(page).toHaveURL(/\/cockpit\/cadastros/)
    await expect(page.getByTestId('hub-card-pessoas')).toBeVisible()
    await expect(page.getByTestId('hub-card-conversoes-um')).toBeVisible()
    await expect(page.getByTestId('hub-card-sku-depara')).toBeVisible()
  })

  test('[UI-NAV-02] Menu hambúrguer recolhe e expande', async ({ page }) => {
    const toggle = page.getByTestId('cockpit-sidebar-toggle')
    const sidebar = page.getByTestId('cockpit-sidebar')

    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('data-sidebar-ready', 'true')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click()
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(sidebar).toBeVisible()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect
      .poll(async () => {
        const columns = await page.getByTestId('cockpit-shell').evaluate((element) => {
          return getComputedStyle(element).gridTemplateColumns
        })
        return Number.parseFloat(columns)
      })
      .toBeLessThan(1)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(sidebar).toBeVisible()
  })
})
