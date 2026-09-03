import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { getTestEmail, getTestPassword } from './env'
import { hideDevOverlays } from './overlays'

export async function loginAsTestUser(
  page: Page,
  opts?: { email?: string; password?: string },
) {
  const email = opts?.email ?? getTestEmail()
  const password = opts?.password ?? getTestPassword()

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await hideDevOverlays(page)
  await expect(page.getByTestId('login-form')).toBeVisible()

  await page.fill('#email', email)
  await page.fill('#password', password)

  await Promise.all([
    page.waitForURL(/\/cockpit/, { timeout: 60_000 }),
    page.click('#login-submit'),
  ])

  await hideDevOverlays(page)
  await expect(page.getByTestId('cockpit-shell')).toBeVisible({ timeout: 30_000 })
}

/** Reutiliza sessão já aberta — só faz login se caiu em /login. */
export async function ensureAuthenticated(page: Page) {
  const url = page.url()
  if (!url.includes('/login') && url.includes('/cockpit')) {
    const shell = page.getByTestId('cockpit-shell')
    if (await shell.isVisible().catch(() => false)) return
  }

  await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
  await hideDevOverlays(page)

  if (page.url().includes('/login')) {
    await loginAsTestUser(page)
    return
  }

  await expect(page.getByTestId('cockpit-shell')).toBeVisible({ timeout: 30_000 })
}

export async function expectLoggedOutRedirect(page: Page) {
  await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/login/, { timeout: 30_000 })
  await expect(page).toHaveURL(/\/login/)
}
