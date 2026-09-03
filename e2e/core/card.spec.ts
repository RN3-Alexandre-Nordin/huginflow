import { test, expect, resetUi } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { openFirstCardHub } from '../helpers/kanban'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

test.describe('Card hub', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
  })

  test('[UI-CARD-01] Abrir modal (Gestão do Card)', async ({ page }) => {
    await openFirstCardHub(page)
    await expect(page.getByTestId('card-modal')).toBeVisible()
  })

  test('[UI-CARD-02] Hub: Responsável, Prazo, Cliente', async ({ page }) => {
    await openFirstCardHub(page)
    const meta = page.getByTestId('hub-meta')
    await expect(meta).toBeVisible()
    await expect(meta.getByText('Responsável')).toBeVisible()
    await expect(meta.getByText('Prazo')).toBeVisible()
    await expect(meta.getByText('Cliente')).toBeVisible()
  })

  test('[UI-CARD-03] Hub: Observações + Salvar', async ({ page }) => {
    await openFirstCardHub(page)
    await hideDevOverlays(page)
    await expect(page.getByTestId('hub-observacoes')).toBeVisible()
    await expect(page.getByTestId('hub-observacoes').getByText('Observações')).toBeVisible()
    await expect(page.getByTestId('hub-observacoes-salvar')).toBeVisible()
  })

  test('[UI-CARD-04] Hub: painel Anexos (clipe + Ver)', async ({ page }) => {
    await openFirstCardHub(page)
    await hideDevOverlays(page)
    const strip = page.getByTestId('hub-attachments-strip')
    if (!(await strip.count())) {
      test.skip(true, 'Usuário sem permissão de anexos')
    }
    await expect(strip).toBeVisible()
    await expect(page.getByTestId('hub-attachments-clip')).toBeVisible()
    await expect(page.getByTestId('hub-attachments-ver')).toBeVisible()
  })

  test('[UI-CARD-05] Hub: 4 ações na mesma linha', async ({ page }) => {
    await openFirstCardHub(page)
    await hideDevOverlays(page)
    const actions = page.getByTestId('hub-actions')
    await expect(actions).toBeVisible()
    await expect(page.getByTestId('hub-action-encaminhar')).toBeVisible()
    await expect(page.getByTestId('hub-action-whatsapp')).toBeVisible()
    await expect(page.getByTestId('hub-action-editar')).toBeVisible()
    await expect(page.getByTestId('hub-action-chat')).toBeVisible()

    const box = await actions.boundingBox()
    expect(box?.height ?? 999).toBeLessThan(90)
  })
})
