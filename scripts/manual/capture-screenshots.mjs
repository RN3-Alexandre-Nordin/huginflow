/**
 * Captura prints do Ragnar para o manual do usuário.
 * Uso: npm run manual:capture  (com npm run dev ativo)
 */
import { chromium } from 'playwright'
import { mkdirSync, existsSync, readFileSync, copyFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const imgDir = resolve(root, 'docs/manual/img')
const stepsDir = resolve(imgDir, 'steps')
const videoDir = resolve(imgDir, 'videos')

const BASE = process.env.MANUAL_BASE_URL || 'http://localhost:3000'
const EMAIL = process.env.MANUAL_EMAIL || 'golive-gestor-510160@teste.ragnar.dev'
const PASSWORD = process.env.MANUAL_PASSWORD || 'RagnarDevTest1!'
const RECORD_VIDEO = process.argv.includes('--video')

function loadEnvLocal() {
  const path = resolve(root, '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0 && !process.env[t.slice(0, i)]) {
      process.env[t.slice(0, i)] = t.slice(i + 1).trim()
    }
  }
}

async function shot(page, name, opts = {}) {
  const dir = opts.steps ? stepsDir : imgDir
  mkdirSync(dir, { recursive: true })
  const file = resolve(dir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: !!opts.fullPage })
  console.log('  ✓', file.replace(root + '\\', '').replace(root + '/', ''))
}

function alias(from, to) {
  if (existsSync(from)) {
    copyFileSync(from, to)
    console.log('  →', to.replace(root + '\\', '').replace(root + '/', ''))
  }
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1200)
}

async function closeChatPanel(page) {
  const overlay = page.locator('.fixed.inset-0.bg-black\\/70').first()
  if (await overlay.count()) {
    await overlay.click({ position: { x: 8, y: 8 }, force: true })
    await page.waitForTimeout(500)
  }
}

async function login(page) {
  await goto(page, '/login')
  await shot(page, '01-login', { steps: true })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await shot(page, '02-login-preenchido', { steps: true })
  await Promise.all([
    page.waitForURL(/\/cockpit/, { timeout: 60000 }),
    page.click('#login-submit'),
  ])
  await page.waitForTimeout(2000)
  if (!page.url().includes('/cockpit')) {
    await shot(page, 'login-erro', { fullPage: true })
    throw new Error(`Login falhou — URL: ${page.url()}`)
  }
}

async function main() {
  loadEnvLocal()
  mkdirSync(stepsDir, { recursive: true })
  mkdirSync(videoDir, { recursive: true })

  console.log(`Base: ${BASE}\nUsuário: ${EMAIL}\n`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: RECORD_VIDEO ? { dir: videoDir, size: { width: 1280, height: 720 } } : undefined,
  })
  const page = await context.newPage()

  try {
    await login(page)
    await shot(page, '03-cockpit-dashboard')
    await shot(page, '03-cockpit', { steps: true })

    await goto(page, '/cockpit/crm/chat')
    await shot(page, '05-chat-omni')
    await shot(page, '04-chat-omni', { steps: true })

    await goto(page, '/cockpit/configuracoes/canais')
    await shot(page, '04-canais')
    await shot(page, '05-canais', { steps: true })

    await goto(page, '/cockpit/crm/funis')
    await shot(page, '06-kanban')
    await shot(page, '06-funis', { steps: true })

    await goto(page, '/cockpit/crm/conhecimento')
    await shot(page, '07-conhecimento')
    await shot(page, '07-conhecimento', { steps: true })

    await goto(page, '/cockpit/ajuda')
    await shot(page, '08-ajuda-manual')

    await goto(page, '/cockpit')
    const chatBtn = page.locator('button.fixed.bottom-8.right-8')
    if (await chatBtn.count()) {
      await chatBtn.click()
      await page.waitForTimeout(1000)
      await shot(page, '09-chat-interno')
      await shot(page, '08-chat-interno', { steps: true })
      await closeChatPanel(page)
    }

    await goto(page, '/cockpit')
    if (await page.locator('a[aria-label="Abrir manual do usuário"]').count()) {
      await shot(page, '09-icone-ajuda', { steps: true })
    }

    console.log('\nCapturas concluídas.')
    alias(resolve(stepsDir, '01-login.png'), resolve(imgDir, '01-login.png'))
    alias(resolve(stepsDir, '03-cockpit.png'), resolve(imgDir, '02-sidebar.png'))
    alias(resolve(imgDir, '04-canais.png'), resolve(imgDir, '03-wizard-whatsapp.png'))
    alias(resolve(imgDir, '04-canais.png'), resolve(imgDir, '04-canal-card.png'))
    alias(resolve(imgDir, '05-chat-omni.png'), resolve(imgDir, '05-chat.png'))
    alias(resolve(imgDir, '06-kanban.png'), resolve(imgDir, '06-kanban.png'))
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((e) => {
  console.error('\nFalha:', e.message)
  process.exit(1)
})
