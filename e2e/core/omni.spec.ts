import { test, expect, resetUi } from '../fixtures'
import { ensureAuthenticated, loginAsTestUser } from '../helpers/auth'
import { hideDevOverlays } from '../helpers/overlays'
import {
  createMultiSessionFixture,
  createOmniDepartmentIsolationFixture,
} from '../helpers/phase3'
import { getBaseUrl } from '../helpers/env'

test.describe.configure({ mode: 'serial' })

async function openConversation(page: Parameters<typeof hideDevOverlays>[0]) {
  await page.goto('/cockpit/crm/chat', { waitUntil: 'domcontentloaded' })
  await hideDevOverlays(page)
  await expect(page.getByTestId('omni-conversa-list')).toBeVisible({ timeout: 45_000 })
  const item = page.getByTestId('omni-conversa-item').first()
  await expect(item).toBeVisible({
    timeout: 30_000,
  })
  await item.click()
  await expect(page.getByTestId('omni-reply-input')).toBeVisible({ timeout: 20_000 })
}

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
    await openConversation(page)
  })

  test('[UI-OMNI-03] Abrir Contexto do cliente', async ({ page }) => {
    await openConversation(page)
    const toggle = page.getByTestId('omni-context-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('omni-customer-context-panel')).toBeVisible()
  })

  test('[UI-OMNI-04] Encaminhar visível com conversa', async ({ page }) => {
    await openConversation(page)
    await expect(page.getByTestId('omni-redirect-button')).toBeVisible()
    await expect(page.getByTestId('omni-redirect-button')).toBeEnabled()
  })

  test('[UI-OMNI-MULTI] Duas sessões do mesmo lead mantêm históricos separados', async ({
    page,
  }) => {
    const fixture = await createMultiSessionFixture()
    try {
      await page.goto('/cockpit/crm/chat', { waitUntil: 'domcontentloaded' })
      await hideDevOverlays(page)
      await expect(page.getByTestId('omni-conversa-list')).toBeVisible({ timeout: 45_000 })
      await page.getByTestId('omni-search').fill(fixture.leadName)

      const items = page.getByTestId('omni-conversa-item').filter({ hasText: fixture.leadName })
      await expect(items).toHaveCount(2)

      for (let index = 0; index < fixture.sessionIds.length; index += 1) {
        const sessionId = fixture.sessionIds[index]
        const otherMessage = fixture.messages[index === 0 ? 1 : 0]
        const item = page.locator(
          `[data-testid="omni-conversa-item"][data-session-id="${sessionId}"]`,
        )
        await expect(item).toBeVisible()
        await item.click()
        await expect(page).toHaveURL(new RegExp(`sessao=${sessionId}`))
        const messages = page.getByTestId('omni-message')
        await expect(messages.filter({ hasText: fixture.messages[index] })).toBeVisible()
        await expect(messages.filter({ hasText: otherMessage })).toHaveCount(0)
      }
    } finally {
      await fixture.cleanup()
    }
  })

  test('[UI-OMNI-DEPT] Operador vê somente sessões do próprio departamento', async ({
    page,
    browser,
  }) => {
    const fixture = await createOmniDepartmentIsolationFixture()
    try {
      await page.goto('/cockpit/crm/chat', { waitUntil: 'domcontentloaded' })
      await page.getByTestId('omni-search').fill(fixture.leadName)
      for (const sessionId of fixture.sessionIds) {
        await expect(
          page.locator(
            `[data-testid="omni-conversa-item"][data-session-id="${sessionId}"]`,
          ),
        ).toBeVisible()
      }

      for (let index = 0; index < fixture.operators.length; index += 1) {
        const context = await browser.newContext({ baseURL: getBaseUrl(), locale: 'pt-BR' })
        const operatorPage = await context.newPage()
        try {
          await loginAsTestUser(operatorPage, fixture.operators[index])
          await operatorPage.goto('/cockpit/crm/chat', { waitUntil: 'domcontentloaded' })
          await hideDevOverlays(operatorPage)
          await operatorPage.getByTestId('omni-search').fill(fixture.leadName)

          const ownSession = fixture.sessionIds[index]
          const otherSession = fixture.sessionIds[index === 0 ? 1 : 0]
          await expect(
            operatorPage.locator(
              `[data-testid="omni-conversa-item"][data-session-id="${ownSession}"]`,
            ),
          ).toBeVisible()
          await expect(
            operatorPage.locator(
              `[data-testid="omni-conversa-item"][data-session-id="${otherSession}"]`,
            ),
          ).toHaveCount(0)
        } finally {
          await context.close()
        }
      }
    } finally {
      await fixture.cleanup()
    }
  })
})
