import { test, expect } from '../fixtures'
import { loginAsTestUser } from '../helpers/auth'
import { createRestrictedUserFixture, phase3BaseUrl } from '../helpers/phase3'

test.describe('Permissões', () => {
  test('[UI-PERM-01] Sem permissão, Funis fica oculto e interditado', async ({ browser }) => {
    const fixture = await createRestrictedUserFixture()
    const context = await browser.newContext({ baseURL: phase3BaseUrl(), locale: 'pt-BR' })
    const page = await context.newPage()

    try {
      await loginAsTestUser(page, {
        email: fixture.email,
        password: fixture.password,
      })
      await expect(page.getByTestId('nav-funis')).toHaveCount(0)
      await expect(page.getByTestId('hub-card-funis')).toHaveCount(0)

      await page.goto('/cockpit/crm/funis', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('access-denied')).toBeVisible()
      await expect(page.getByText('Acesso Interditado')).toBeVisible()
      await expect(page.getByTestId('funil-abrir-kanban')).toHaveCount(0)
    } finally {
      await context.close()
      await fixture.cleanup()
    }
  })
})
