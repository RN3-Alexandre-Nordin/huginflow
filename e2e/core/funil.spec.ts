import { test, expect, resetUi } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { openFirstKanban } from '../helpers/kanban'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

test.describe('Funil / Kanban', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
  })

  test('[UI-FUNIL-01] Lista Funis → Abrir Kanban', async ({ page }) => {
    await openFirstKanban(page)
    await expect(page).toHaveURL(/\/cockpit\/crm\/funis\/.+/)
    await expect(page.getByTestId('kanban-board')).toBeVisible()
  })

  test('[UI-FUNIL-02] Colunas do board visíveis', async ({ page }) => {
    await openFirstKanban(page)
    await hideDevOverlays(page)
    const cols = page.getByTestId('kanban-column')
    await expect(cols.first()).toBeVisible()
    expect(await cols.count()).toBeGreaterThanOrEqual(1)
  })
})
