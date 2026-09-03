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

loadEnvLocal()

const BASE =
  process.env.MANUAL_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000'

const EMAIL = process.env.MANUAL_EMAIL || 'vendedor@montesinaiatacado.com.br'

const PASSWORD =
  process.env.MANUAL_PASSWORD ||
  (EMAIL.includes('montesinai') ? 'hugin123@2026' : 'HuginDevTest1!')

const RECORD_VIDEO = process.argv.includes('--video')
const OMNI_ONLY = process.argv.includes('--omni')
const CHAT_BADGE_ONLY = process.argv.includes('--chat-badge')
const TREINAMENTO_ONLY = process.argv.includes('--treinamento')

async function shot(page, name, opts = {}) {
  await hideDevOverlays(page)
  await page.waitForTimeout(opts.delay ?? 250)

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



async function installDevOverlayBlocker(page) {
  await page.addInitScript(() => {
    const hide = () => {
      document
        .querySelectorAll(
          'nextjs-portal, [data-nextjs-toast], #__next-build-watcher, [data-nextjs-dialog-overlay]',
        )
        .forEach((el) => el.remove())

      document.querySelectorAll('body *').forEach((el) => {
        const text = el.textContent?.trim() ?? ''
        if (!/^\d+\s+issue/i.test(text)) return
        const host =
          el.closest('[data-nextjs-issue-button]') ??
          el.closest('[style*="position: fixed"]') ??
          el.closest('[style*="position:fixed"]') ??
          el.parentElement
        if (host) host.remove()
      })
    }

    hide()
    new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true })
  })
}

async function hideDevOverlays(page) {
  await page
    .evaluate(() => {
      document
        .querySelectorAll(
          'nextjs-portal, [data-nextjs-toast], #__next-build-watcher, [data-nextjs-dialog-overlay]',
        )
        .forEach((el) => el.remove())

      document.querySelectorAll('body *').forEach((el) => {
        const text = el.textContent?.trim() ?? ''
        if (!/^\d+\s+issue/i.test(text)) return
        const host =
          el.closest('[data-nextjs-issue-button]') ??
          el.closest('[style*="position: fixed"]') ??
          el.closest('[style*="position:fixed"]') ??
          el.parentElement
        if (host) host.remove()
      })
    })
    .catch(() => {})
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
  await hideDevOverlays(page)
}



async function closeChatPanel(page) {

  const overlay = page.locator('.fixed.inset-0.bg-black\\/70').first()

  if (await overlay.count()) {

    await overlay.click({ position: { x: 8, y: 8 }, force: true })

    await page.waitForTimeout(500)

  }

}



async function closeCardModal(page) {
  const modal = page.locator('div.fixed.inset-0.z-50.bg-black\\/90').last()
  const closeBtn = modal.locator('button').filter({ has: page.locator('svg.lucide-x') }).first()
  if (await closeBtn.count()) {
    await closeBtn.click({ force: true })
    await page.waitForTimeout(400)
  }
}



async function openFirstPipeline(page) {
  await goto(page, '/cockpit/crm/funis')

  const rows = page.locator('div.group.border-l-2').filter({
    has: page.getByRole('link', { name: 'Abrir Kanban' }),
  })
  const count = await rows.count()
  if (count === 0) {
    console.log('  ⚠ Nenhum funil encontrado — pulando capturas de card')
    return false
  }

  let pickedRow = null
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)
    const text = (await row.innerText()).toLowerCase()
    if (/vendas|comercial|financeiro|suporte|pedido/.test(text) && !/reprovad/.test(text)) {
      pickedRow = row
      if (/vendas externas|financeiro/.test(text)) break
    }
  }
  if (!pickedRow) pickedRow = rows.first()

  await pickedRow.hover()
  await page.waitForTimeout(300)
  await pickedRow.getByRole('link', { name: 'Abrir Kanban' }).click({ force: true })
  await page.waitForTimeout(2500)

  await page
    .waitForSelector('button[title="Gestão do Card"], [data-testid="kanban-board"]', {
      timeout: 20000,
    })
    .catch(() => {})

  const meusCards = page.getByRole('button', { name: 'Meus Cards' })
  if (await meusCards.count()) {
    const active = await meusCards.evaluate((el) =>
      el.className.includes('2BAADF'),
    )
    if (!active) {
      await meusCards.click()
      await page.waitForTimeout(2000)
    }
  }

  const hasCards = (await page.locator('button[title="Gestão do Card"]').count()) > 0
  if (!hasCards && (await meusCards.count())) {
    console.log('  ℹ Meus Cards vazio — exibindo todos os cards do funil')
    await meusCards.click()
    await page.waitForTimeout(2000)
  }

  return true
}



/** Aguarda o Chat Omnichannel sair do estado de loading (spinner central). */
async function waitForOmniChatLoaded(page) {
  await page.waitForSelector('input[placeholder*="Buscar lead"]', { timeout: 45000 })
  await page.waitForFunction(
    () => {
      const spinners = [...document.querySelectorAll('.animate-spin')]
      const visible = spinners.some((el) => el.getBoundingClientRect().height > 20)
      if (visible) return false
      const hasList =
        document.body.textContent?.includes('Nenhuma conversa encontrada') ||
        document.querySelector('.custom-scrollbar .cursor-pointer') !== null
      return hasList
    },
    { timeout: 45000 },
  )
  await page.waitForTimeout(800)
}

/** Seleciona conversa na lista (preferAi = status Atendimento Robotizado / ícone verde). */
async function selectOmniConversation(page, preferAi = false) {
  await waitForOmniChatLoaded(page)

  const items = page.locator('.custom-scrollbar > div.cursor-pointer')
  const count = await items.count()
  if (count === 0) {
    console.log('  ⚠ Nenhuma conversa no Chat Omnichannel')
    return false
  }

  if (preferAi) {
    for (let i = 0; i < count; i++) {
      const item = items.nth(i)
      const botIcon = item.locator('svg.lucide-bot')
      if (await botIcon.count()) {
        await item.click()
        break
      }
      if (i === count - 1) await items.first().click()
    }
  } else {
    await items.first().click()
  }

  await page.waitForTimeout(1200)
  await page
    .waitForFunction(
      () =>
        document.querySelector('textarea[placeholder*="Responda"]') !== null ||
        document.body.textContent?.includes('Gestão Humana') ||
        document.body.textContent?.includes('Atendimento Robotizado'),
      { timeout: 20000 },
    )
    .catch(() => {})
  await page.waitForTimeout(600)
  return true
}

async function captureOmniChatTreinamento(page) {
  console.log('\n— Capítulo 7: Chat Omnichannel —')
  await goto(page, '/cockpit/crm/chat')
  const hasConv = await selectOmniConversation(page, false)
  if (hasConv) {
    await page
      .waitForSelector('textarea[placeholder*="Responda"]', { timeout: 15000 })
      .catch(() => {})
  }
  await shot(page, '05-chat-omni')
  if (!TREINAMENTO_ONLY) await shot(page, '04-chat-omni', { steps: true })

  if (hasConv) {
    const ctxBtn = page.locator('button[aria-label="Contexto do cliente"]')
    if (await ctxBtn.count()) {
      await ctxBtn.click()
      await page.waitForTimeout(1000)
      await page
        .waitForSelector('text=Contexto do cliente', { timeout: 12000 })
        .catch(() => {})
      await shot(page, 'omni-contexto-cliente', { dir: treinamentoDir })
    }

    const encBtn = page.getByRole('button', { name: 'Encaminhar' }).first()
    if (await encBtn.count()) {
      await encBtn.click()
      await page.waitForTimeout(1500)
      await page
        .waitForSelector('text=Encaminhar card', { timeout: 12000 })
        .catch(() => {})
      await shot(page, 'omni-encaminhar', { dir: treinamentoDir })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }
  }

  await goto(page, '/cockpit/crm/chat')
  const hasAi = await selectOmniConversation(page, true)
  if (hasAi) {
    await page
      .waitForSelector('textarea[placeholder*="Responda"]', { timeout: 15000 })
      .catch(() => {})
    await page.waitForTimeout(500)
  }
  await shot(page, 'whatsapp-assumir', { dir: treinamentoDir })
}

async function cardModalRoot(page) {
  return page.locator('div.fixed.inset-0.z-50.bg-black\\/90').last()
}

async function backToCardHub(page) {
  const modal = await cardModalRoot(page)
  const back = modal
    .locator('button')
    .filter({ has: page.locator('svg.lucide-arrow-left') })
    .first()
  if (await back.count()) {
    await back.click({ force: true })
    await page.waitForTimeout(600)
    await waitForCardModalHub(page)
  }
}

async function waitForCardModalHub(page) {
  await page.waitForSelector('text=Observações', { timeout: 20000 })
  await page
    .waitForFunction(
      () => {
        const spinners = [...document.querySelectorAll('.animate-spin')]
        const bigSpinner = spinners.some((el) => el.getBoundingClientRect().height > 18)
        if (bigSpinner) return false
        return (
          document.body.textContent?.includes('Timeline') ||
          document.body.textContent?.includes('Sem registros')
        )
      },
      { timeout: 25000 },
    )
    .catch(() => {})
  await page.waitForTimeout(600)
}

async function openFirstCardModal(page) {
  const gestaoBtn = page.locator('button[title="Gestão do Card"]').first()
  if (!(await gestaoBtn.count())) {
    console.log('  ⚠ Nenhum card no funil — pulando modal')
    return false
  }
  await gestaoBtn.click()
  await waitForCardModalHub(page)
  return true
}

async function openChatPanel(page) {
  const chatBtn = page.locator('button.fixed.bottom-8.right-8')
  if (!(await chatBtn.count())) return false
  await chatBtn.click()
  await page
    .waitForSelector('.flex-1.overflow-y-auto.py-2 button', { timeout: 15000 })
    .catch(() => {})
  await page.waitForTimeout(1500)
  return true
}

async function selectCardThreadInChat(page) {
  const cardThread = page
    .locator('.flex-1.overflow-y-auto.py-2 button')
    .filter({ hasText: 'Card' })
    .first()
  if (await cardThread.count()) {
    await cardThread.click()
    await page.waitForTimeout(2000)
    await page
      .waitForSelector('text=Gestão do Card', { timeout: 20000 })
      .catch(() => {})
    await page
      .waitForFunction(
        () => {
          const spinners = [...document.querySelectorAll('.animate-spin')]
          return !spinners.some((el) => el.getBoundingClientRect().height > 24)
        },
        { timeout: 20000 },
      )
      .catch(() => {})
    return true
  }
  console.log('  ⚠ Nenhuma thread de card no chat interno')
  return false
}

async function captureExpandedCardWhatsApp(page) {
  const expandBtns = page
    .locator('button')
    .filter({ has: page.locator('svg.lucide-chevron-down') })
  const n = await expandBtns.count()
  for (let i = 0; i < Math.min(n, 8); i++) {
    const btn = expandBtns.nth(i)
    try {
      await btn.click({ timeout: 5000 })
    } catch {
      continue
    }
    await page.waitForTimeout(700)
    const waBtn = page.getByRole('link', { name: 'WhatsApp' })
    const startBtn = page.getByRole('button', { name: 'Iniciar conversa' })
    if ((await waBtn.count()) || (await startBtn.count())) {
      await shot(page, 'card-atendimento-whatsapp', { dir: treinamentoDir })
      const collapse = page
        .locator('button')
        .filter({ has: page.locator('svg.lucide-chevron-up') })
        .first()
      if (await collapse.count()) await collapse.click({ timeout: 3000 }).catch(() => {})
      return
    }
    const collapse = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-chevron-up') })
      .first()
    if (await collapse.count()) await collapse.click({ timeout: 3000 }).catch(() => {})
  }
  const firstExpand = page
    .locator('button')
    .filter({ has: page.locator('svg.lucide-chevron-down') })
    .first()
  if (await firstExpand.count()) {
    await firstExpand.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(800)
    await shot(page, 'card-atendimento-whatsapp', { dir: treinamentoDir })
  }
}

async function captureCockpitMenu(page) {
  console.log('\n— Treinamento: menu hambúrguer —')
  await goto(page, '/cockpit')
  const toggle = page.locator('[data-testid="cockpit-sidebar-toggle"]')
  if (!(await toggle.count())) return
  const expanded = await toggle.getAttribute('aria-expanded')
  if (expanded === 'true') {
    await toggle.click()
    await page.waitForTimeout(800)
  }
  await shot(page, 'cockpit-menu-hamburguer', { dir: treinamentoDir })
  if (expanded === 'true') {
    await toggle.click()
    await page.waitForTimeout(400)
  }
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
  if (!TREINAMENTO_ONLY) await shot(page, '06-funis', { steps: true })
  await shot(page, 'kanban-tile-acoes', { dir: treinamentoDir })

  await captureExpandedCardWhatsApp(page)

  if (!(await openFirstCardModal(page))) return

  await shot(page, 'card-modal-hub', { dir: treinamentoDir })
  alias(
    resolve(treinamentoDir, 'card-modal-hub.png'),
    resolve(treinamentoDir, 'card-modal-resumo.png'),
  )

  const encHub = (await cardModalRoot(page)).getByRole('button', { name: 'Encaminhar' }).first()
  if (await encHub.count()) {
    await encHub.click({ force: true })
    await page.waitForTimeout(1200)
    await page
      .waitForSelector('text=Departamento destino', { timeout: 12000 })
      .catch(() => {})
    await page
      .waitForFunction(
        () => !document.body.textContent?.includes('Calculando'),
        { timeout: 20000 },
      )
      .catch(() => {})
    await page.waitForTimeout(800)
    await shot(page, 'card-encaminhar-responsavel', { dir: treinamentoDir })
    await shot(page, 'card-transferir-funil', { dir: treinamentoDir })
    await backToCardHub(page)
  }

  const editHub = (await cardModalRoot(page))
    .getByRole('button', { name: /^(Editar|Editar dados)$/ })
    .first()
  if (await editHub.count()) {
    await editHub.click({ force: true })
    await page.waitForTimeout(800)
    await shot(page, 'card-editar-dados', { dir: treinamentoDir })
    await backToCardHub(page)
  }

  // Anexos: strip no hub → tela dedicada
  const verAnexos = (await cardModalRoot(page)).getByRole('button', { name: 'Ver' }).first()
  if (await verAnexos.count()) {
    await verAnexos.click({ force: true })
    await page.waitForTimeout(1000)
    await page.waitForSelector('text=Anexe boletos', { timeout: 10000 }).catch(() => {})
    await shot(page, 'card-anexos', { dir: treinamentoDir })
    await backToCardHub(page)
  }

  const chatHub = (await cardModalRoot(page)).getByRole('button', { name: /^Chat/ }).first()
  if (await chatHub.count()) {
    await chatHub.click({ force: true })
    await page.waitForTimeout(1500)
    await page
      .waitForSelector('text=Todos', { timeout: 20000 })
      .catch(() => {})
    await page
      .waitForFunction(
        () => {
          const spinners = [...document.querySelectorAll('.animate-spin')]
          return !spinners.some((el) => el.getBoundingClientRect().height > 24)
        },
        { timeout: 20000 },
      )
      .catch(() => {})
    await shot(page, 'card-chat-interno', { dir: treinamentoDir })

    const modal = await cardModalRoot(page)
    const target = modal
      .locator(
        'input[placeholder*="Discussão Interna"], textarea[placeholder*="Digite"], input[placeholder*="@"]',
      )
      .first()
    if (await target.count()) {
      await target.click({ force: true })
      await target.fill('@')
      await page.waitForTimeout(1200)
      await shot(page, 'card-mencao-at', { dir: treinamentoDir })
    } else {
      console.log('  ⚠ Campo do chat do card — pulando card-mencao-at')
    }
  }

  await closeCardModal(page)
}

async function captureChatInternoTreinamento(page) {
  console.log('\n— Capítulo 8: Chat interno —')
  await goto(page, '/cockpit')
  if (!(await openChatPanel(page))) {
    console.log('  ⚠ Botão flutuante de chat não encontrado')
    return
  }

  await shot(page, '09-chat-interno')
  if (!TREINAMENTO_ONLY) await shot(page, '08-chat-interno', { steps: true })

  if (await selectCardThreadInChat(page)) {
    await shot(page, 'chat-gestao-card', { dir: treinamentoDir })
  }

  const chatInput = page.locator('textarea[placeholder*="Digite"]').first()
  if (await chatInput.count()) {
    try {
      await chatInput.click({ timeout: 8000 })
      await chatInput.fill('@')
      await page.waitForTimeout(1000)
      if (await page.locator('text=Mencionar Contato').count()) {
        await shot(page, 'chat-mencionar', { dir: treinamentoDir })
      } else {
        await shot(page, 'chat-mencionar', { dir: treinamentoDir })
      }
    } catch {
      console.log('  ⚠ Menção no chat global — print do painel aberto')
      await shot(page, 'chat-mencionar', { dir: treinamentoDir })
    }
  } else {
    await shot(page, 'chat-mencionar', { dir: treinamentoDir })
  }

  await captureChatBadgeTreinamento(page)
}



async function captureChatBadgeTreinamento(page) {
  console.log('\n— Treinamento: badge chat interno —')
  await goto(page, '/cockpit')
  await page.waitForTimeout(1000)

  const chatBtn = page.locator('button.fixed.bottom-8.right-8')
  if (!(await chatBtn.count())) {
    console.log('  ⚠ Botão flutuante de chat não encontrado')
    return
  }

  // Abre painel para carregar conversas (badges reais se existirem)
  await chatBtn.click()
  await page.waitForTimeout(2000)
  await page
    .waitForSelector('.flex-1.overflow-y-auto.py-2 button', { timeout: 15000 })
    .catch(() => {})

  const listUnread = page.locator('.flex-1.overflow-y-auto.py-2 .bg-red-500.rounded-full')
  const btnUnread = chatBtn.locator('.bg-red-500.rounded-full')
  const hasRealBadge =
    (await listUnread.count()) > 0 || (await btnUnread.count()) > 0

  if (!hasRealBadge) {
    console.log('  ℹ Sem não-lidas no dev — aplicando badges de demonstração para o manual')
    await page.evaluate(() => {
      const floatWrap = document.querySelector('button.fixed.bottom-8.right-8 .relative')
      if (floatWrap && !floatWrap.querySelector('.bg-red-500')) {
        const badge = document.createElement('div')
        badge.className =
          'absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full border-2 border-[#2BAADF] flex items-center justify-center'
        badge.innerHTML = '<span class="text-[10px] font-black text-white">2</span>'
        floatWrap.appendChild(badge)
      }
      document.querySelectorAll('.flex-1.overflow-y-auto.py-2 button').forEach((btn, i) => {
        if (i > 1 || btn.querySelector('.bg-red-500')) return
        const row = btn.querySelector('.flex.items-center.justify-between.gap-2')
        if (!row) return
        const badge = document.createElement('div')
        badge.className =
          'shrink-0 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center px-1 shadow-lg shadow-red-500/20'
        badge.innerHTML = `<span class="text-[9px] font-black text-white">${i + 1}</span>`
        row.appendChild(badge)
      })
    })
    await page.waitForTimeout(400)
  }

  // Mantém o botão flutuante visível por cima do drawer (badge + lista na mesma captura)
  await page.evaluate(() => {
    const btn = document.querySelector('button.fixed.bottom-8.right-8')
    if (btn) btn.style.zIndex = '9999'
  })
  await hideDevOverlays(page)
  await page.waitForTimeout(300)

  await shot(page, 'chat-badge-nao-lidas', { dir: treinamentoDir })

  const floatBtn = page.locator('button.fixed.bottom-8.right-8')
  if (await floatBtn.count()) {
    await shot(page, 'chat-badge-botao-flutuante', { dir: treinamentoDir, locator: floatBtn })
  }

  await closeChatPanel(page)
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
  await installDevOverlayBlocker(page)

  try {
    await login(page)

    if (CHAT_BADGE_ONLY) {
      await captureChatBadgeTreinamento(page)
      console.log('\nCaptura chat-badge concluída.')
      return
    }

    if (TREINAMENTO_ONLY) {
      await captureCockpitMenu(page)
      await captureOmniChatTreinamento(page)
      await captureKanbanTreinamento(page)
      await captureChatInternoTreinamento(page)
      alias(resolve(imgDir, '05-chat-omni.png'), resolve(imgDir, '05-chat.png'))
      console.log('\nCapturas de treinamento concluídas.')
      return
    }

    if (!OMNI_ONLY) {
      await shot(page, '03-cockpit-dashboard')
      await shot(page, '03-cockpit', { steps: true })
      await captureCockpitMenu(page)
    }

    await captureOmniChatTreinamento(page)

    if (OMNI_ONLY) {
      alias(resolve(imgDir, '05-chat-omni.png'), resolve(imgDir, '05-chat.png'))
      console.log('\nCapturas do capítulo 7 (omni) concluídas.')
      return
    }

    await goto(page, '/cockpit/configuracoes/canais')

    await shot(page, '04-canais')

    await shot(page, '05-canais', { steps: true })

    await captureKanbanTreinamento(page)

    await captureChatInternoTreinamento(page)



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


