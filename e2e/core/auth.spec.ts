import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test, expect } from '../fixtures'
import { loginAsTestUser, expectLoggedOutRedirect } from '../helpers/auth'
import { getTestEmail } from '../helpers/env'
import { hideDevOverlays } from '../helpers/overlays'

const authFile = resolve(__dirname, '../.auth/user.json')

test.describe.configure({ mode: 'serial' })

test.describe('Auth', () => {
  test('[UI-AUTH-01] Login com credencial válida → Cockpit', async ({ page }) => {
    await page.context().clearCookies()
    await loginAsTestUser(page)
    await expect(page).toHaveURL(/\/cockpit/)
    await expect(page.getByTestId('cockpit-main')).toBeVisible()
  })

  test('[UI-AUTH-02] Senha errada → mensagem de erro', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await page.fill('#email', getTestEmail())
    await page.fill('#password', 'senha-errada-e2e-999')
    await page.click('#login-submit')
    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('[UI-AUTH-03] Sem sessão, /cockpit → login', async ({ page }) => {
    await page.context().clearCookies()
    await expectLoggedOutRedirect(page)
  })

  /** Último passo do bloco auth — mantém sessão para card/omni/funil (não usar afterAll: trava). */
  test('_sessao: restaurar login para restante da suíte', async ({ page }) => {
    await page.context().clearCookies()
    await loginAsTestUser(page)
    mkdirSync(dirname(authFile), { recursive: true })
    await page.context().storageState({ path: authFile })
    await expect(page.getByTestId('cockpit-shell')).toBeVisible()
  })
})
