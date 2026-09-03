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
})
