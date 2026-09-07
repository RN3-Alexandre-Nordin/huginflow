import { test, expect, resetUi } from '../fixtures'
import { ensureAuthenticated } from '../helpers/auth'
import { openFirstKanban } from '../helpers/kanban'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

test.describe('Chat interno flutuante', () => {
  test.beforeEach(async ({ page }) => {
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
  })

  test('[UI-CHAT-01] Botão flutuante abre Conversas', async ({ page }) => {
    await hideDevOverlays(page)
    const fab = page.getByTestId('chat-fab')
    await expect(fab).toBeVisible({ timeout: 30_000 })
    await fab.click()
    await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-open', 'true')
    await expect(page.getByTestId('chat-panel-title')).toBeVisible()
  })

  test('[UI-CHAT-02] Thread Card abre Gestão do Card', async ({ page }) => {
    await openFirstKanban(page)
    const card = page.getByTestId('kanban-card').first()
    const cardId = await card.getAttribute('data-card-id')
    const cardTitle = (await card.getByTestId('kanban-card-title').innerText()).trim()
    expect(cardId).toBeTruthy()
    expect(cardTitle).toBeTruthy()

    await page.getByTestId('chat-fab').click()
    await expect(page.getByTestId('chat-panel')).toHaveAttribute('data-open', 'true')
    await page.getByTestId('chat-search').fill(cardTitle)

    const exactConversation = page.locator(
      `[data-testid="chat-conversation-item"][data-conversation-type="card"][data-conversation-id="${cardId}"]`,
    )
    await expect(exactConversation).toContainText(cardTitle, { timeout: 20_000 })
    await exactConversation.click()

    await expect(page.getByTestId('chat-card-thread')).toHaveText('Thread do Card')
    await page.getByTestId('chat-card-manage').click()
    await expect(page.getByTestId('card-modal')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('card-hub')).toBeVisible()
  })

  test('[UI-CHAT-03] Mencionar @ abre lista de usuários', async ({ page }) => {
    await openFirstKanban(page)
    const cardId = await page.getByTestId('kanban-card').first().getAttribute('data-card-id')
    expect(cardId).toBeTruthy()

    await page.getByTestId('chat-fab').click()
    await page.getByTestId('chat-search').fill(
      (await page.getByTestId('kanban-card-title').first().innerText()).trim(),
    )
    const conversation = page.locator(
      `[data-testid="chat-conversation-item"][data-conversation-type="card"][data-conversation-id="${cardId}"]`,
    )
    await expect(conversation).toBeVisible({ timeout: 20_000 })
    await conversation.click()

    const input = page.getByTestId('chat-message-input')
    await input.fill('@')
    const userOption = page.locator(
      '[data-testid="chat-mention-option"][data-mention-type="user"]',
    ).first()
    await expect(page.getByTestId('chat-mention-list')).toBeVisible()
    await expect(userOption).toBeVisible()
    await userOption.click()
    await expect(input).toHaveValue(/^\[.+\], $/)
  })
})
