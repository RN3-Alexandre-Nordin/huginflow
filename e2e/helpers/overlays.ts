import type { Page } from '@playwright/test'

/** Esconde overlays do Next.js Dev (toast “1 issue”, portal) que atrapalham cliques. */
export async function hideDevOverlays(page: Page) {
  await page
    .addStyleTag({
      content: `
        nextjs-portal,
        [data-nextjs-toast],
        #__next-build-watcher,
        [data-nextjs-dialog-overlay] {
          display: none !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }
      `,
    })
    .catch(() => {})
}
