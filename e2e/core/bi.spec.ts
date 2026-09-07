import { expect, resetUi, test } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

test.describe('Relatórios e Analytics', () => {
  test('[UI-BI-01] Relatórios carregam KPIs, série e heatmap do tenant', async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/relatorios', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)

    await expect(page.getByTestId('reports-page')).toBeVisible()
    await expect(page.getByTestId('reports-kpi-open')).toBeVisible()
    await expect(page.getByTestId('reports-kpi-unassigned')).toBeVisible()
    await expect(page.getByTestId('reports-kpi-first-response')).toBeVisible()
    await expect(page.getByTestId('reports-kpi-resolution')).toBeVisible()
    await expect(page.getByTestId('reports-daily-chart')).toBeVisible()
    await expect(page.getByTestId('reports-heatmap')).toBeVisible()

    const departmentFilter = page.getByTestId('reports-department-filter')
    await expect(departmentFilter).toBeVisible()
    await departmentFilter.selectOption('')
    await expect(page.getByTestId('reports-error')).toHaveCount(0)
  })
})
