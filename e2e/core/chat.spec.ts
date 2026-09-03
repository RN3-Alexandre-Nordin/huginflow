import { test, expect, resetUi } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

test.describe('Chat interno flutuante', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
  })

  test('[UI-CHAT-01] Botão flutuante abre Conversas', async ({ page }) => {
    await hideDevOverlays(page)
    const fab = page.getByTestId('chat-fab')
    await expect(fab).toBeVisible({ timeout: 30_000 })
    await fab.click()
    await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-open', 'true')
    await expect(page.getByTestId('chat-panel-title')).toBeVisible()
  })
})
