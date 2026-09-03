import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { hideDevOverlays } from './overlays'

function funilRows(page: Page) {
  return page.locator('div.group.border-l-2').filter({
    has: page.getByTestId('funil-abrir-kanban'),
  })
}

async function ensureCardsVisible(page: Page) {
  const limpar = page.getByRole('button', { name: /Limpar Filtros/i })
  if (await limpar.count()) {
    await limpar.click()
    await page.waitForTimeout(1200)
  }

  const meusCards = page.getByRole('button', { name: 'Meus Cards' })
  if (await meusCards.count()) {
    const active = await meusCards.evaluate((el) => el.className.includes('2BAADF'))
    if (active) {
      await meusCards.click()
      await page.waitForTimeout(1500)
    }
  }
}

/** Abre um funil com cards (prioriza Financeiro / Vendas). */
export async function openFirstKanban(page: Page) {
  await page.goto('/cockpit/crm/funis', { waitUntil: 'domcontentloaded' })
  await hideDevOverlays(page)

  const rows = funilRows(page)
  await expect(rows.first()).toBeAttached({ timeout: 30_000 })
  const count = await rows.count()

  const preferred: number[] = []
  const withCards: number[] = []
  const others: number[] = []

  for (let i = 0; i < count; i++) {
    const text = (await rows.nth(i).innerText()).toLowerCase()
    const cardsMatch = text.match(/(\d+)\s*card/)
    const nCards = cardsMatch ? Number(cardsMatch[1]) : 0
    if (/financeiro|vendas|comercial|pedido/.test(text) && !/reprovad/.test(text)) {
      preferred.push(i)
    } else if (nCards > 0) {
      withCards.push(i)
    } else {
      others.push(i)
    }
  }

  const order = [...preferred, ...withCards, ...others]

  for (const idx of order) {
    await page.goto('/cockpit/crm/funis', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    const row = funilRows(page).nth(idx)
    await expect(row).toBeAttached({ timeout: 20_000 })
    await row.hover()
    await row.getByTestId('funil-abrir-kanban').click({ force: true })
    await expect(page.getByTestId('kanban-board')).toBeVisible({ timeout: 45_000 })
    await hideDevOverlays(page)
    await ensureCardsVisible(page)

    if ((await page.getByTestId('card-gestao-btn').count()) > 0) {
      return
    }
  }

  throw new Error(
    'Nenhum funil com cards editáveis encontrado. Popule o tenant de teste (ex.: Financeiro Monte Sinai).',
  )
}

export async function openFirstCardHub(page: Page) {
  await openFirstKanban(page)
  const gestao = page.getByTestId('card-gestao-btn').first()
  await expect(gestao).toBeVisible({ timeout: 10_000 })
  await gestao.click()
  await expect(page.getByTestId('card-modal')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('card-hub')).toBeVisible({ timeout: 20_000 })
}
