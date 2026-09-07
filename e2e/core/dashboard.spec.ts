import { expect, resetUi, test } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

test.describe('Dashboard do gestor', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
  })

  test('[UI-DASH-01] KPIs e filtros do gestor carregam dados reais', async ({ page }) => {
    await expect(page.getByTestId('manager-dashboard')).toBeVisible()
    await expect(page.getByTestId('manager-kpi-vendas')).toBeVisible()
    await expect(page.getByTestId('manager-kpi-cards')).toBeVisible()
    await expect(page.getByTestId('manager-kpi-chats')).toBeVisible()
    await expect(page.getByTestId('manager-kpi-gargalos')).toBeVisible()

    const metric = page.getByTestId('manager-chart-metric')
    await expect(metric.locator('option')).toHaveCount(4)
    await metric.selectOption('receita')

    for (const period of ['dia', 'semana', 'mes']) {
      await page.getByTestId(`manager-period-${period}`).click()
      await expect(page.getByTestId('manager-chart-bar').first()).toBeVisible()
    }
  })
})
