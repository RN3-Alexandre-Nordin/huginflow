/**

 * Captura prints do HuginFlow para manuais e treinamento.

 * Uso: npm run manual:capture  (com npm run dev ativo)

 *

 * Env opcional: MANUAL_BASE_URL, MANUAL_EMAIL, MANUAL_PASSWORD

 */

import { chromium } from 'playwright'

import { mkdirSync, existsSync, readFileSync, copyFileSync } from 'fs'

import { resolve, dirname } from 'path'

import { fileURLToPath } from 'url'



const __dirname = dirname(fileURLToPath(import.meta.url))

const root = resolve(__dirname, '../..')

const imgDir = resolve(root, 'docs/manual/img')

const stepsDir = resolve(imgDir, 'steps')

const treinamentoDir = resolve(imgDir, 'treinamento')

const videoDir = resolve(imgDir, 'videos')



const BASE = process.env.MANUAL_BASE_URL || 'http://localhost:3000'

const EMAIL = process.env.MANUAL_EMAIL || 'vendedor@montesinaiatacado.com.br'

const PASSWORD =
  process.env.MANUAL_PASSWORD ||
  (EMAIL.includes('montesinai') ? 'hugin123@2026' : 'HuginDevTest1!')

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

  const dir = opts.dir || (opts.steps ? stepsDir : imgDir)

  mkdirSync(dir, { recursive: true })

  const file = resolve(dir, `${name}.png`)

  if (opts.locator) {

    await opts.locator.screenshot({ path: file })

  } else {

    await page.screenshot({ path: file, fullPage: !!opts.fullPage })

  }

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

  await page.waitForTimeout(1500)

}



async function closeChatPanel(page) {

  const overlay = page.locator('.fixed.inset-0.bg-black\\/70').first()

  if (await overlay.count()) {

    await overlay.click({ position: { x: 8, y: 8 }, force: true })

    await page.waitForTimeout(500)

  }

}



async function closeCardModal(page) {

  const closeBtn = page.locator('button').filter({ has: page.locator('svg.lucide-x') }).first()

  if (await closeBtn.count()) {

    await closeBtn.click()

    await page.waitForTimeout(400)

  }

}



async function openFirstPipeline(page) {

  await goto(page, '/cockpit/crm/funis')

  const link = page.locator('a[href*="/cockpit/crm/funis/"]').filter({ hasNot: page.locator('text=novo') }).first()

  if (!(await link.count())) {

    console.log('  ⚠ Nenhum funil encontrado — pulando capturas de card')

    return false

  }

  await link.click()

  await page.waitForTimeout(2000)

  return true

}



async function openFirstCardModal(page) {

  const transferBtn = page.locator('button[title="Transferir para Outro Funil"]').first()

  if (!(await transferBtn.count())) {

    console.log('  ⚠ Nenhum card no funil — pulando modal')

    return false

  }

  await transferBtn.click()

  await page.waitForTimeout(1200)

  return true

}



async function captureLogin(page) {

  await goto(page, '/login')

  await page.waitForSelector('#email', { timeout: 15000 })

  await shot(page, '01-login', { steps: true })

  await shot(page, '01-login', { dir: treinamentoDir })



  const formPanel = page.locator('form[action="/api/auth/login"]').first()

  if (await formPanel.count()) {

    await shot(page, '01-login-form', { dir: treinamentoDir, locator: formPanel })

  }



  await page.fill('#email', EMAIL)

  await page.fill('#password', PASSWORD)

  await shot(page, '02-login-preenchido', { steps: true })

}



async function captureKanbanTreinamento(page) {

  const hasPipeline = await openFirstPipeline(page)

  if (!hasPipeline) return



  await shot(page, '06-kanban')

  await shot(page, '06-funis', { steps: true })

  await shot(page, 'kanban-tile-acoes', { dir: treinamentoDir })



  const expandBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') }).first()

  if (await expandBtn.count()) {

    await expandBtn.click()

    await page.waitForTimeout(800)

    await shot(page, 'card-atendimento-whatsapp', { dir: treinamentoDir })

    await expandBtn.click()

  }



  if (!(await openFirstCardModal(page))) return



  await shot(page, 'card-modal-resumo', { dir: treinamentoDir })



  const editBtn = page.getByRole('button', { name: /Editar Card/i })

  if (await editBtn.count()) {

    await editBtn.click()

    await page.waitForTimeout(800)

    await shot(page, 'card-encaminhar-responsavel', { dir: treinamentoDir })

    await page.getByRole('button', { name: /Cancelar/i }).click()

    await page.waitForTimeout(500)

  }



  const transferSection = page.locator('text=Transferência Rápida de Funil').first()

  if (await transferSection.count()) {

    await transferSection.scrollIntoViewIfNeeded()

    await page.waitForTimeout(400)

    await shot(page, 'card-transferir-funil', { dir: treinamentoDir })

  }



  const attachments = page.locator('text=Anexos e Documentos').first()

  if (await attachments.count()) {

    await attachments.scrollIntoViewIfNeeded()

    await page.waitForTimeout(400)

    await shot(page, 'card-anexos', { dir: treinamentoDir })

  }



  const chatTab = page.getByRole('button', { name: /Chat Interno/i })

  if (await chatTab.count()) {

    await chatTab.click()

    await page.waitForTimeout(1200)

    await shot(page, 'card-chat-interno', { dir: treinamentoDir })



    const input = page.locator('textarea[placeholder*="Digite"]').first()
    if (!(await input.count())) {
      const fallback = page.locator('textarea').first()
      if (await fallback.count()) {
        try {
          await fallback.click({ timeout: 5000 })
          await fallback.fill('@')
          await page.waitForTimeout(1000)
          if (await page.locator('text=Mencionar Contato').count()) {
            await shot(page, 'card-mencao-at', { dir: treinamentoDir })
          }
        } catch {
          console.log('  ⚠ Menção no card — pulando card-mencao-at')
        }
      }
    } else if (await input.count()) {
      try {
        await input.click({ timeout: 5000 })
        await input.fill('@')
        await page.waitForTimeout(1000)
        if (await page.locator('text=Mencionar Contato').count()) {
          await shot(page, 'card-mencao-at', { dir: treinamentoDir })
        }
      } catch {
        console.log('  ⚠ Menção no card — pulando card-mencao-at')
      }
    }

  }



  await closeCardModal(page)

}



async function login(page) {

  await captureLogin(page)

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

  mkdirSync(treinamentoDir, { recursive: true })

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

    await shot(page, 'whatsapp-assumir', { dir: treinamentoDir })



    await goto(page, '/cockpit/configuracoes/canais')

    await shot(page, '04-canais')

    await shot(page, '05-canais', { steps: true })



    await captureKanbanTreinamento(page)



    await goto(page, '/cockpit')

    const chatBtn = page.locator('button.fixed.bottom-8.right-8')

    if (await chatBtn.count()) {

      await chatBtn.click()

      await page.waitForTimeout(1000)

      await shot(page, '09-chat-interno')

      await shot(page, '08-chat-interno', { steps: true })

      await shot(page, 'chat-badge-nao-lidas', { dir: treinamentoDir })

      await shot(page, 'chat-gestao-card', { dir: treinamentoDir })



      const firstConv = page.locator('.flex-1.overflow-y-auto.py-2 button').first()
      if (await firstConv.count()) {
        await firstConv.click()
        await page.waitForTimeout(800)
      }

      const chatInput = page.locator('textarea[placeholder*="Digite"]').first()

      if (await chatInput.count()) {
        try {
          await chatInput.click({ timeout: 5000 })
          await chatInput.fill('@')
          await page.waitForTimeout(1000)
          if (await page.locator('text=Mencionar Contato').count()) {
            await shot(page, 'chat-mencionar', { dir: treinamentoDir })
          }
        } catch {
          console.log('  ⚠ Menção no chat global — usando print do painel')
          await shot(page, 'chat-mencionar', { dir: treinamentoDir })
        }
      } else {
        await shot(page, 'chat-mencionar', { dir: treinamentoDir })
      }



      await closeChatPanel(page)

    }



    await goto(page, '/cockpit/crm/conhecimento')

    await shot(page, '07-conhecimento')

    await shot(page, '07-conhecimento', { steps: true })



    await goto(page, '/cockpit/ajuda')

    await shot(page, '08-ajuda-manual')



    await goto(page, '/cockpit')

    const helpBtn = page.locator('button[aria-label="Abrir menu de ajuda"]')

    if (await helpBtn.count()) {

      await helpBtn.click()

      await page.waitForTimeout(500)

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


