import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import { hideDevOverlays } from './helpers/overlays'

type WorkerFixtures = {
  continuousContext: BrowserContext
  continuousPage: Page
}

/**
 * Um browser + um contexto + uma página para TODA a suíte e2e/core.
 * Auth e demais casos rodam na mesma janela (TEST_HEADED=1 / Mostrar browser).
 */
export const test = base.extend<{ page: Page; context: BrowserContext }, WorkerFixtures>({
  continuousContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
      })
      await use(context)
      await context.close()
    },
    { scope: 'worker' },
  ],

  continuousPage: [
    async ({ continuousContext }, use) => {
      const page = await continuousContext.newPage()
      await use(page)
    },
    { scope: 'worker' },
  ],

  context: async ({ continuousContext }, use) => {
    await use(continuousContext)
  },

  page: async ({ continuousPage }, use) => {
    await use(continuousPage)
  },
})

export { expect }

export async function resetUi(page: Page) {
  await hideDevOverlays(page)
  const modal = page.getByTestId('card-modal')
  if (await modal.isVisible().catch(() => false)) {
    const close = modal.locator('button').filter({ has: page.locator('svg.lucide-x') }).first()
    if (await close.count()) {
      await close.click({ force: true }).catch(() => {})
    } else {
      await page.keyboard.press('Escape').catch(() => {})
    }
    await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }
  if ((await page.getByTestId('chat-panel').getAttribute('data-open').catch(() => null)) === 'true') {
    await page.locator('.fixed.inset-0').first().click({ force: true }).catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
  }
}
