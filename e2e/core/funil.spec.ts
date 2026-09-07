import { test, expect, resetUi } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { openFirstKanban } from '../helpers/kanban'
import { hideDevOverlays } from '../helpers/overlays'
import { createMoveCardFixture } from '../helpers/phase3'

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

  test('[UI-CARD-MOVE] Arrastar card persiste na coluna destino', async ({ page }) => {
    const fixture = await createMoveCardFixture()
    try {
      await page.goto(`/cockpit/crm/funis/${fixture.pipelineId}`, {
        waitUntil: 'domcontentloaded',
      })
      await hideDevOverlays(page)

      const card = page.locator(`[data-testid="kanban-card"][data-card-id="${fixture.cardId}"]`)
      const target = page.locator(
        `[data-testid="kanban-column"][data-stage-id="${fixture.toStageId}"]`,
      )
      await expect(card).toBeVisible()
      await expect(target).toBeVisible()

      const cardBox = await card.boundingBox()
      const targetBox = await target.boundingBox()
      if (!cardBox || !targetBox) throw new Error('Card ou coluna sem posição para drag')

      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(cardBox.x + cardBox.width / 2 + 12, cardBox.y + cardBox.height / 2, {
        steps: 3,
      })
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.7, {
        steps: 12,
      })
      await page.mouse.up()

      await expect(target.locator(`[data-card-id="${fixture.cardId}"]`)).toBeVisible({
        timeout: 20_000,
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(
        page
          .locator(`[data-testid="kanban-column"][data-stage-id="${fixture.toStageId}"]`)
          .locator(`[data-card-id="${fixture.cardId}"]`),
      ).toBeVisible()
    } finally {
      await fixture.cleanup()
    }
  })
})
