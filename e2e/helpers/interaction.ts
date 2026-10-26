import type { Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Clica até a ação surtir efeito. O HTML do servidor aparece antes da hidratação do React
 * (no `next dev` isso leva 1–2 s), e um clique nesse intervalo é descartado em silêncio.
 * Não reclica se o efeito já aconteceu — seguro para botões que alternam (abrir/fechar).
 */
export async function clickUntil(
  trigger: Locator,
  isDone: () => Promise<boolean>,
  timeoutMs = 20_000,
) {
  await expect(async () => {
    if (!(await isDone())) await trigger.click()
    await expect.poll(isDone, { timeout: 2_000 }).toBe(true)
  }).toPass({ timeout: timeoutMs })
}
