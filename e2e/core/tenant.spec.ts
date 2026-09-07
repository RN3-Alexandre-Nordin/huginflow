import { test, expect, resetUi } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { createCrossTenantPipelineFixture } from '../helpers/phase3'

test.describe('Isolamento de tenant', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
  })

  test('[UI-TENANT-01] Funil de outra empresa não aparece nem abre', async ({ page }) => {
    const fixture = await createCrossTenantPipelineFixture()
    try {
      await page.goto(`/cockpit/crm/funis?q=${encodeURIComponent(fixture.pipelineName)}`, {
        waitUntil: 'domcontentloaded',
      })
      await expect(page.getByTestId('funil-row')).toHaveCount(0)
      await expect(page.getByText(fixture.pipelineName, { exact: true })).toHaveCount(0)

      await page.goto(`/cockpit/crm/funis/${fixture.pipelineId}`, {
        waitUntil: 'domcontentloaded',
      })
      await expect(page.getByTestId('kanban-board')).toHaveCount(0)
      await expect(page.getByText(fixture.pipelineName, { exact: true })).toHaveCount(0)
    } finally {
      await fixture.cleanup()
    }
  })
})
