import { expect, resetUi, test } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'

test.describe.configure({ mode: 'serial' })

test.describe('Financeiro', () => {
  test('[UI-FIN-01] Financeiro permanece restrito ao superadmin RN3', async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/financeiro', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/cockpit\/acesso-negado/)
    await expect(page.getByRole('heading', { name: /acesso restrito/i })).toBeVisible()
    await expect(page.getByTestId('finance-page')).toHaveCount(0)
  })
})
