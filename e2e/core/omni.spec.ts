import { test, expect, resetUi } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

test.describe('Omnichannel', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
  })

  test('[UI-OMNI-01] Abrir Chat Omnichannel + lista carrega', async ({ page }) => {
    await page.goto('/cockpit/crm/chat', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByTestId('omni-chat-page')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('omni-search')).toBeVisible()
    await expect(page.getByTestId('omni-conversa-list')).toBeVisible()
  })

  test('[UI-OMNI-02] Selecionar conversa + campo responder', async ({ page }) => {
    await page.goto('/cockpit/crm/chat', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByTestId('omni-conversa-list')).toBeVisible({ timeout: 45_000 })

    const item = page.getByTestId('omni-conversa-item').first()
    const empty = page.getByText('Nenhuma conversa encontrada')
    if (await empty.isVisible().catch(() => false)) {
      test.skip(true, 'Sem conversas no tenant de teste')
    }

    await expect(item).toBeVisible({ timeout: 30_000 })
    await item.click()
    await expect(page.getByTestId('omni-reply-input')).toBeVisible({ timeout: 20_000 })
  })
})
