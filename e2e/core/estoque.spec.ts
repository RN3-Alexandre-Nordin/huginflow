import { createClient } from '@supabase/supabase-js'
import type { Browser } from '@playwright/test'
import { expect, resetUi, test } from '../fixtures'
import { ensureAuthenticated, loginAsTestUser } from '../helpers/auth'
import {
  assertDevTestTarget,
  getTestEmail,
  getTestPassword,
  getTestTenantId,
} from '../helpers/env'
import { hideDevOverlays } from '../helpers/overlays'

test.describe.configure({ mode: 'serial' })

function adminClient() {
  if (process.env.TEST_ALLOW_MUTATIONS !== '1') {
    throw new Error('Estoque E2E mutável exige TEST_ALLOW_MUTATIONS=1')
  }
  assertDevTestTarget()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin env ausente')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function setEstoqueEnabled(enabled: boolean) {
  const admin = adminClient()
  const { error } = await admin
    .from('empresa_addons')
    .update({
      enabled,
      commercial_status: enabled ? 'active' : 'ended',
      updated_at: new Date().toISOString(),
    })
    .eq('empresa_id', getTestTenantId())
    .eq('addon_codigo', 'estoque')
  if (error) throw new Error(`setEstoqueEnabled: ${error.message}`)
}

async function assertBloqueioSemPermissao(browser: Browser) {
  const semEmail = process.env.TEST_EMAIL_SEM_APROVACAO
  const semSenha = process.env.TEST_PASSWORD_SEM_APROVACAO
  if (!semEmail || !semSenha) {
    test.info().annotations.push({
      type: 'bloqueado',
      description:
        'Bloqueio de usuário sem permissão: TEST_EMAIL_SEM_APROVACAO e TEST_PASSWORD_SEM_APROVACAO ausentes. Nenhuma conta foi criada.',
    })
    return
  }
  const ctx = await browser.newContext()
  const outro = await ctx.newPage()
  try {
    await loginAsTestUser(outro, { email: semEmail, password: semSenha })
    await outro.goto('/cockpit/estoque/requisicoes/aprovacao', { waitUntil: 'domcontentloaded' })
    await expect(outro.getByRole('heading', { name: 'Acesso Interditado' })).toBeVisible()
    await expect(outro.getByText(/aprovador configurado/i)).toBeVisible()
  } finally {
    await ctx.close()
  }
}

async function readEstoqueEnabled() {
  const admin = adminClient()
  const { data, error } = await admin
    .from('empresa_addons')
    .select('enabled')
    .eq('empresa_id', getTestTenantId())
    .eq('addon_codigo', 'estoque')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data?.enabled)
}

test.describe('Estoque', () => {
  test('[UI-EST-ADDON-01] Sem addon estoque oculta menu e bloqueia URL', async ({ page }) => {
    const prev = await readEstoqueEnabled()
    try {
      await setEstoqueEnabled(false)
      await loginAsTestUser(page, {
        email: getTestEmail(),
        password: getTestPassword(),
      })
      await page.goto('/cockpit', { waitUntil: 'domcontentloaded' })
      await hideDevOverlays(page)
      await expect(page.getByTestId('nav-estoque')).toHaveCount(0)

      await page.goto('/cockpit/estoque', { waitUntil: 'domcontentloaded' })
      if ((await page.url()).includes('acesso-negado')) {
        await expect(page).toHaveURL(/acesso-negado/)
      } else {
        await expect(page.getByTestId('hub-card-locais')).toHaveCount(0)
      }
    } finally {
      await setEstoqueEnabled(prev)
    }
  })

  test('[UI-EST-NAV-01] Hub Estoque mostra cards e listas operacionais abrem', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)

    await expect(page.getByTestId('estoque-hub')).toBeVisible()
    const cards = [
      'hub-card-locais',
      'hub-card-estoque-config',
      'hub-card-entradas',
      'hub-card-retiradas',
      'hub-card-transferencias',
      'hub-card-ajustes',
      'hub-card-remessas',
      'hub-card-requisicoes',
      'hub-card-saldos',
      'hub-card-cardex',
      'hub-card-estoque-relatorios',
    ]
    for (const id of cards) {
      await expect(page.getByTestId(id)).toBeVisible()
    }

    await page.getByTestId('hub-card-entradas').click()
    await expect(page).toHaveURL(/\/cockpit\/estoque\/entradas/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-EST-LOC-01] Locais de estoque carrega', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/locais', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/locais/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-EST-CFG-01] Configuração do estoque carrega', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/configuracao', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/configuracao/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-EST-SAL-01] Consulta Saldos carrega', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/saldos', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/saldos/)
  })

  test('[UI-EST-CAR-01] Cardex carrega sem erro e com painel', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/cardex', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/cardex/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
    await expect(page.getByTestId('estoque-cardex-panel')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('estoque-cardex-error')).toHaveCount(0)
    await expect(page.getByText(/statement timeout/i)).toHaveCount(0)
  })

  test('[UI-EST-CAR-02] Cardex busca por código SKU com hífen (sem timeout)', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)

    const admin = adminClient()
    const tenantId = getTestTenantId()
    const { data: skuRow } = await admin
      .from('cad_skus')
      .select('codigo')
      .eq('empresa_id', tenantId)
      .eq('controla_estoque', true)
      .not('codigo', 'is', null)
      .limit(1)
      .maybeSingle()

    // Preferir código com hífen (regressão DEST-011); senão qualquer SKU do tenant
    let codigo = skuRow?.codigo as string | undefined
    const { data: hyphenSku } = await admin
      .from('cad_skus')
      .select('codigo')
      .eq('empresa_id', tenantId)
      .eq('controla_estoque', true)
      .like('codigo', '%-%')
      .limit(1)
      .maybeSingle()
    if (hyphenSku?.codigo) codigo = hyphenSku.codigo as string

    test.skip(!codigo, 'Tenant sem SKU para busca no Cardex')

    await page.goto(`/cockpit/estoque/cardex?q=${encodeURIComponent(codigo!)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    await hideDevOverlays(page)
    await expect(page.getByTestId('estoque-cardex-panel')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('estoque-cardex-error')).toHaveCount(0)
    await expect(page.getByText(/Erro ao carregar Cardex/i)).toHaveCount(0)
    await expect(page.getByText(/statement timeout/i)).toHaveCount(0)
    // Tabela ou empty — ambos OK; o bug era timeout/erro
    const table = page.getByTestId('estoque-cardex-table')
    const empty = page.getByTestId('estoque-cardex-empty')
    await expect(table.or(empty)).toBeVisible()
  })

  test('[UI-EST-REL-01] Hub Relatórios de estoque carrega', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)
    await page.goto('/cockpit/estoque/relatorios', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/cockpit\/estoque\/relatorios/)
  })

  test('[UI-EST-LOTE-01] Config FEFO, saldos validade e relatório de lotes', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)

    await page.goto('/cockpit/estoque/configuracao', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
    const loteTab = page.getByRole('tab', { name: /Lote e validade/i })
    if ((await loteTab.count()) > 0) {
      await loteTab.click()
      await expect(page.getByText(/Sugerir FEFO nas saídas/i)).toBeVisible()
    }

    await page.goto('/cockpit/estoque/saldos?validade=a_vencer', {
      waitUntil: 'domcontentloaded',
    })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/validade=a_vencer/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)

    await page.goto('/cockpit/estoque/relatorios/validade-lotes', {
      waitUntil: 'domcontentloaded',
    })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/validade-lotes/)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })

  test('[UI-EST-LOTE-02] Rotas operacionais com LotePicker carregam', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)

    const routes = [
      '/cockpit/estoque/retiradas/novo',
      '/cockpit/estoque/ajustes/novo',
      '/cockpit/estoque/transferencias/novo',
      '/cockpit/estoque/remessas/novo',
    ]
    for (const path of routes) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await hideDevOverlays(page)
      await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
    }
  })

  test('[UI-EST-REQ-01] Requisição manual persiste número, solicitante e item', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)

    const marca = `HF-P51-${Date.now()}`
    await page.goto('/cockpit/estoque/requisicoes/novo', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
    await expect(page.getByText('Requisitante (Pessoa)')).toBeVisible()
    await expect(page.getByRole('button', { name: /Buscar SKU/i })).toBeVisible()
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.textContent || '').includes('Buscar SKU'),
      )
      return !!btn && Object.getOwnPropertyNames(btn).some((k) => k.startsWith('__react'))
    })

    const pessoa = page.locator('select').filter({ has: page.locator('option', { hasText: 'Selecione o Requisitante' }) })
    const pessoaValor = await pessoa.locator('option').nth(1).getAttribute('value')
    const pessoaNome = (await pessoa.locator('option').nth(1).textContent())?.trim() || ''
    test.skip(!pessoaValor, 'Tenant sem pessoa com papel Funcionário')
    await pessoa.selectOption(pessoaValor!)

    const sku = page.getByRole('button', { name: /Buscar SKU/i })
    await sku.dispatchEvent('click')
    const lista = page.getByRole('listbox')
    await expect(lista).toBeVisible()
    const opcaoSku = lista.getByRole('option').first()
    await expect(opcaoSku).toBeVisible()
    const skuLabel = (await opcaoSku.textContent()) || ''
    const skuCodigo = skuLabel.split(' - ')[0]?.trim()
    await opcaoSku.click()

    await page.getByPlaceholder('1').fill('1')
    await page.getByPlaceholder(/Manutenção preventiva/i).fill(marca)
    await page.getByRole('button', { name: 'Salvar como Rascunho' }).click()

    await page.waitForURL(/\/cockpit\/estoque\/requisicoes\/[0-9a-f-]{36}/i, { timeout: 45_000 })
    await hideDevOverlays(page)
    const numero = page.getByRole('heading', { name: /Requisição: REQ-\d{8}-\d{4}/ })
    await expect(numero).toBeVisible()
    const statusRequisicao = numero.locator(
      'xpath=ancestor::div[contains(@class,"justify-between")][1]',
    )
    await expect(statusRequisicao.getByText('Rascunho', { exact: true })).toBeVisible()
    await expect(page.getByText('Digitação Manual')).toBeVisible()
    const nomeRequisitante = pessoaNome.split(' (')[0]
    await expect(
      page.getByText('Requisitante', { exact: true }).locator('xpath=following-sibling::div[1]'),
    ).toContainText(nomeRequisitante)
    await expect(page.getByText('Solicitante (Auditoria)', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Solicitante (Auditoria)', { exact: true }).locator('xpath=following-sibling::div[1]'),
    ).toContainText('Admin Monte Sinai')
    await expect(
      page.getByText('Workflow / Observação', { exact: true }).locator('xpath=..'),
    ).toContainText(marca)
    if (skuCodigo) {
      await expect(page.getByRole('cell', { name: new RegExp(skuCodigo) })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Enviar para aprovação' })).toBeVisible()
  })

  test('[UI-EST-REQ-03] Envio, fila, aprovação, bloqueio e rejeição', async ({ page, browser }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)

    const marcaAprovar = `HF-P51-APR-${Date.now()}`
    const marcaRejeitar = `HF-P51-REJ-${Date.now()}`

    async function criarRascunho(marca: string) {
      await page.goto('/cockpit/estoque/requisicoes/novo', { waitUntil: 'domcontentloaded' })
      await hideDevOverlays(page)
      await page.waitForFunction(() => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          (b.textContent || '').includes('Buscar SKU'),
        )
        return !!btn && Object.getOwnPropertyNames(btn).some((k) => k.startsWith('__react'))
      })
      const pessoa = page.locator('select').filter({ has: page.locator('option', { hasText: 'Selecione o Requisitante' }) })
      const pessoaValor = await pessoa.locator('option').nth(1).getAttribute('value')
      test.skip(!pessoaValor, 'Tenant sem pessoa com papel Funcionário')
      await pessoa.selectOption(pessoaValor!)
      await page.waitForFunction(() => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          (b.textContent || '').includes('Buscar SKU'),
        )
        return !!btn && Object.getOwnPropertyNames(btn).some((k) => k.startsWith('__react'))
      })
      await page.getByRole('button', { name: /Buscar SKU/i }).dispatchEvent('click')
      await page.getByRole('listbox').getByRole('option').first().click()
      await page.getByPlaceholder('1').fill('1')
      await page.getByPlaceholder(/Manutenção preventiva/i).fill(marca)
      await page.getByRole('button', { name: 'Salvar como Rascunho' }).click()
      await page.waitForURL(/\/cockpit\/estoque\/requisicoes\/[0-9a-f-]{36}/i, { timeout: 45_000 })
      await hideDevOverlays(page)
    }

    await criarRascunho(marcaAprovar)
    await page.getByRole('button', { name: 'Enviar para aprovação' }).click()
    await expect(page.getByText(/Status atualizado para "pendente_aprovacao"/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Aguardando Aprovação').or(page.getByText('Aprovada para Atendimento'))).toBeVisible()

    const statusCabecalho = page
      .getByRole('heading', { name: /Requisição:/ })
      .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
    const foiParaFila = (await statusCabecalho.getByText('Aguardando Aprovação', { exact: true }).count()) > 0
    if (!foiParaFila) {
      test.info().annotations.push(
        {
          type: 'bloqueado',
          description:
            'Fila: req_aprovacao_ativa=false no tenant Monte Sinai Atacado (DEV compartilhado). Configuração não alterada.',
        },
        {
          type: 'bloqueado',
          description: 'Aprovação por usuário autorizado: depende da fila de aprovação interna.',
        },
        {
          type: 'bloqueado',
          description: 'Rejeição por usuário autorizado: o botão só existe em pendente_aprovacao.',
        },
        {
          type: 'bloqueado',
          description: 'Auditoria de aprovador: não há decisão manual enquanto a aprovação interna está desligada.',
        },
      )
      await expect(statusCabecalho.getByText('Aprovada para Atendimento', { exact: true })).toBeVisible()
      await assertBloqueioSemPermissao(browser)
      return
    }

    const numeroAprovar = ((await page.getByRole('heading', { name: /Requisição:/ }).textContent()) || '')
      .replace('Requisição:', '')
      .trim()
    const detalheAprovar = page.url()

    await page.goto('/cockpit/estoque/requisicoes/aprovacao', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
    const linha = page.locator('tr', { hasText: numeroAprovar })
    await expect(linha).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await linha.getByRole('button', { name: 'Aprovar' }).click()
    await expect(page.getByText('Requisição aprovada e liberada para atendimento.')).toBeVisible()

    await page.goto(detalheAprovar, { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page.getByText('Aprovada para Atendimento')).toBeVisible()
    await expect(page.getByText(/Aprovada por /)).toBeVisible()

    await assertBloqueioSemPermissao(browser)

    await criarRascunho(marcaRejeitar)
    await page.getByRole('button', { name: 'Enviar para aprovação' }).click()
    await expect(page.getByText('Aguardando Aprovação')).toBeVisible({ timeout: 30_000 })
    const numeroRejeitar = ((await page.getByRole('heading', { name: /Requisição:/ }).textContent()) || '')
      .replace('Requisição:', '')
      .trim()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Rejeitar' }).click()
    await expect(page.getByText('Rejeitada')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Rejeitada por /)).toBeVisible()
    await expect(page.getByRole('heading', { name: new RegExp(numeroRejeitar) })).toBeVisible()
  })

  test('[UI-EST-SERIE-01] Tela de séries carrega', async ({ page }) => {
    await setEstoqueEnabled(true)
    await resetUi(page)
    await ensureAuthenticated(page)

    await page.goto('/cockpit/estoque/series', { waitUntil: 'domcontentloaded' })
    await hideDevOverlays(page)
    await expect(page).toHaveURL(/\/estoque\/series/)
    await expect(page.getByRole('heading', { name: 'Séries' })).toBeVisible()
    await expect(page.getByText(/Acesso Interditado/i)).toHaveCount(0)
  })
})
