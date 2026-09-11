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

  test('[UI-NAV-01] Menu lateral: Cockpit, Omni, Funis', async ({ page }) => {
    await hideDevOverlays(page)
    await expect(page.getByTestId('nav-cockpit')).toBeVisible()
    await expect(page.getByTestId('nav-omni')).toBeVisible()
    await expect(page.getByTestId('nav-funis')).toBeVisible()
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
