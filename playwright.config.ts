import { defineConfig, devices } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
for (const file of ['.env.local', '.env']) {
  const p = resolve(root, file)
  if (existsSync(p)) loadDotenv({ path: p, override: false })
}

const baseURL =
  process.env.TEST_BASE_URL ||
  process.env.MANUAL_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000'

/**
 * Um único project = um único browser.
 * Sessão contínua via e2e/fixtures.ts (auth → core na mesma janela).
 */
export default defineConfig({
  testDir: './e2e/core',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  globalTimeout: 15 * 60 * 1000,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/playwright-results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['./e2e/reporters/hugin-agent-reporter.ts'],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    headless: process.env.TEST_HEADED !== '1',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  outputDir: 'test-results/artifacts',
})
