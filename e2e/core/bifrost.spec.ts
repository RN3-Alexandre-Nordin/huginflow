import { expect, resetUi, test } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

async function openBifrost(page: Parameters<typeof hideDevOverlays>[0], mode: 'open' | 'list') {
  await page.getByTestId('cockpit-help-button').click()
  await page.getByTestId('help-tickets-menu').click()
  await page.getByTestId(mode === 'open' ? 'help-ticket-open' : 'help-ticket-list').click()
  const modal = page.getByTestId('bifrost-support-modal')
  await expect(modal).toHaveAttribute('data-mode', mode === 'open' ? 'abrir-chamado' : 'meus-chamados')
  const iframe = page.getByTestId('bifrost-embed-frame')
  await expect(iframe).toBeVisible({ timeout: 30_000 })
  await expect(iframe).toHaveAttribute('src', /^https:\/\/bifrost\.rn3\.tec\.br\/embed\/sso\?/)
  return { modal, iframe, frame: iframe.contentFrame() }
}

test.describe('Bifrost', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
  })

  test('[UI-BIFROST-01] Abrir e consultar chamados pelo embed SSO', async ({ page }) => {
    const create = await openBifrost(page, 'open')
    await expect(create.iframe).toHaveAttribute('src', /next=%2Fembed%2Fchamados%2Fnovo/)
    await expect(
      create.frame.getByRole('heading', { name: 'Abrir chamado' }).first(),
    ).toBeVisible({ timeout: 30_000 })
    await expect(create.frame.getByLabel('Título')).toBeVisible()
    await expect(create.frame.getByLabel('Descrição')).toBeVisible()
    await expect(create.frame.getByRole('button', { name: 'Abrir chamado' })).toBeVisible()

    await create.modal.getByTestId('bifrost-modal-close').click()
    await expect(create.modal).toHaveCount(0)

    const list = await openBifrost(page, 'list')
    await expect(list.iframe).toHaveAttribute('src', /next=%2Fembed%2Fchamados(?:&|$)/)
    await expect(
      list.frame.getByRole('heading', { name: 'Meus chamados' }).first(),
    ).toBeVisible({ timeout: 30_000 })
    await expect(list.frame.getByText(/Meus chamados|Você ainda não abriu chamados/).first()).toBeVisible()
  })

  test('[UI-BIFROST-02] Acesso direto abre formulário e consulta no domínio Bifrost', async ({
    page,
  }) => {
    const huginOrigin = new URL(page.url()).origin

    const issueToken = async (next: '/embed/chamados/novo' | '/embed/chamados') => {
      const response = await page.request.post(`${huginOrigin}/api/bifrost/embed-token`, {
        data: { next },
      })
      expect(response.ok()).toBeTruthy()
      const payload = (await response.json()) as { embedUrl?: string }
      expect(payload.embedUrl).toMatch(/^https:\/\/bifrost\.rn3\.tec\.br\/embed\/sso\?/)
      return payload.embedUrl!
    }

    await page.goto(await issueToken('/embed/chamados/novo'), { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/^https:\/\/bifrost\.rn3\.tec\.br\/embed\/chamados\/novo/)
    await expect(page.getByRole('heading', { name: 'Abrir chamado' }).first()).toBeVisible()
    await expect(page.getByLabel('Título')).toBeVisible()
    await expect(page.getByLabel('Descrição')).toBeVisible()

    await page.goto(await issueToken('/embed/chamados'), { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/^https:\/\/bifrost\.rn3\.tec\.br\/embed\/chamados/)
    await expect(page.getByRole('heading', { name: 'Meus chamados' }).first()).toBeVisible()
    await expect(page.getByText(/Meus chamados|Você ainda não abriu chamados/).first()).toBeVisible()
  })
})
