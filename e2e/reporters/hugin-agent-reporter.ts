import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  catalogEntry,
  extractTestId,
  humanExpectation,
  humanPassos,
} from '../../src/lib/testes/catalog'

export type CaseRow = {
  id: string
  title: string
  area?: string
  expectation?: string
  passos?: string
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted'
  error?: string
  screenshot?: string
  durationMs: number
}

type RunEvent = {
  ts: string
  type: 'run_start' | 'test_start' | 'test_end' | 'run_end' | 'log'
  id?: string
  title?: string
  area?: string
  expectation?: string
  passos?: string
  status?: string
  error?: string
  message?: string
  passed?: number
  failed?: number
  skipped?: number
}

function enrich(title: string) {
  const id = extractTestId(title) || title.slice(0, 40)
  const entry = catalogEntry(title)
  return {
    id,
    area: entry?.area,
    expectation: entry ? humanExpectation(title) : title,
    passos: entry ? humanPassos(title) : undefined,
  }
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function humanStamp() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function tryGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(opts: {
  baseURL: string
  commit: string
  durationSec: number
  ok: boolean
  passed: number
  failed: number
  skipped: number
  cases: CaseRow[]
  screenshotDataUrls: Record<string, string>
}) {
  const failRows = opts.cases.filter((c) => c.status === 'failed' || c.status === 'timedOut')
  const caseRows = opts.cases
    .map((c) => {
      const icon = c.status === 'passed' ? '✅' : c.status === 'skipped' ? '⏭' : '❌'
      const label = c.expectation || c.title
      const detail = c.passos
        ? `<div class="passos">${escapeHtml(c.passos)}</div>`
        : ''
      const area = c.area ? `<span class="area">${escapeHtml(c.area)}</span>` : ''
      return `<tr>
        <td><code>${escapeHtml(c.id)}</code>${area}</td>
        <td>${icon} ${escapeHtml(c.status)}</td>
        <td><div class="exp">${escapeHtml(label)}</div>${detail}</td>
        <td>${(c.durationMs / 1000).toFixed(1)}s</td>
      </tr>`
    })
    .join('\n')

  const failBlocks = failRows
    .map((f, i) => {
      const img = f.screenshot ? opts.screenshotDataUrls[f.screenshot] : ''
      return `<section class="fail">
        <h3>${i + 1}. ${escapeHtml(f.id)} — ${escapeHtml(f.expectation || f.title)}</h3>
        ${f.passos ? `<p class="passos">${escapeHtml(f.passos)}</p>` : ''}
        <p class="err">${escapeHtml(f.error || 'Falha sem mensagem')}</p>
        ${img ? `<img src="${img}" alt="screenshot ${escapeHtml(f.id)}" />` : ''}
      </section>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório agente — ${opts.ok ? 'PASSOU' : 'FALHOU'}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0a0a0a; color: #e8e8e8; line-height: 1.5; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 1.5rem; margin: 0 0 8px; }
    .meta { color: #9ca3af; font-size: 0.875rem; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 6px 12px; border-radius: 8px; font-weight: 800; letter-spacing: 0.04em; font-size: 0.75rem; }
    .ok { background: rgba(128,184,40,0.15); color: #80B828; border: 1px solid rgba(128,184,40,0.35); }
    .bad { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; font-size: 0.875rem; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #ffffff12; vertical-align: top; }
    th { color: #9ca3af; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; }
    code { font-size: 0.8rem; color: #2BAADF; }
    .area { display: block; margin-top: 4px; font-size: 0.7rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
    .exp { color: #f3f4f6; font-weight: 600; }
    .passos { margin-top: 6px; color: #9ca3af; font-size: 0.8rem; }
    .fail { margin: 16px 0; padding: 16px; border: 1px solid #ffffff12; border-radius: 12px; background: #111; }
    .fail h3 { margin: 0 0 8px; font-size: 1rem; }
    .err { color: #fca5a5; font-size: 0.875rem; }
    .fail img { margin-top: 12px; max-width: 100%; border-radius: 8px; border: 1px solid #ffffff14; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
    .card { background: #111; border: 1px solid #ffffff10; border-radius: 12px; padding: 14px; }
    .card b { display: block; font-size: 1.4rem; color: #fff; }
    .card span { color: #9ca3af; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Relatório do agente de testes</h1>
    <p class="meta">${escapeHtml(humanStamp())}<br/>
      Ambiente: DEV · Base: ${escapeHtml(opts.baseURL || '(não definida)')}<br/>
      Commit: ${escapeHtml(opts.commit)} · Duração: ${Math.floor(opts.durationSec / 60)}m ${opts.durationSec % 60}s
    </p>
    <span class="badge ${opts.ok ? 'ok' : 'bad'}">${opts.ok ? 'PASSOU' : `FALHOU (${opts.failed})`}</span>
    <div class="summary">
      <div class="card"><span>Passou</span><b>${opts.passed}</b></div>
      <div class="card"><span>Falhou</span><b>${opts.failed}</b></div>
      <div class="card"><span>Pulou</span><b>${opts.skipped}</b></div>
    </div>
    <h2>O que foi testado</h2>
    <table>
      <thead><tr><th>ID / Área</th><th>Status</th><th>Expectativa e passos</th><th>Tempo</th></tr></thead>
      <tbody>${caseRows}</tbody>
    </table>
    ${
      failRows.length
        ? `<h2>O que quebrou</h2>${failBlocks}`
        : `<h2>Próximo passo</h2><p class="meta">Núcleo UI verde. Pode avançar para a próxima suite.</p>`
    }
  </div>
</body>
</html>`
}

class HuginAgentReporter implements Reporter {
  private cases: CaseRow[] = []
  private startedAt = Date.now()
  private baseURL = ''
  private eventsPath = process.env.TEST_RUN_EVENTS_PATH || ''
  private reportDir = process.env.TEST_RUN_DIR || ''
  private runId = process.env.TEST_RUN_ID || ''

  private appendEvent(ev: RunEvent) {
    if (!this.eventsPath) return
    try {
      mkdirSync(resolve(this.eventsPath, '..'), { recursive: true })
      writeFileSync(this.eventsPath, `${JSON.stringify(ev)}\n`, { flag: 'a' })
    } catch {
      /* ignore */
    }
  }

  onBegin(config: FullConfig, _suite: Suite) {
    this.startedAt = Date.now()
    this.baseURL = config.projects[0]?.use?.baseURL?.toString() || ''
    if (this.eventsPath && existsSync(this.eventsPath) && process.env.TEST_RUN_KEEP_EVENTS !== '1') {
      writeFileSync(this.eventsPath, '', 'utf8')
    }
    this.appendEvent({
      ts: new Date().toISOString(),
      type: 'run_start',
      message: `Início da suíte núcleo operador · ${this.baseURL}`,
    })
  }

  onTestBegin(test: TestCase) {
    const meta = enrich(test.title)
    if (meta.id.startsWith('_') || test.title.startsWith('_')) {
      this.appendEvent({
        ts: new Date().toISOString(),
        type: 'log',
        message: `Preparação: ${test.title}`,
      })
      return
    }
    this.appendEvent({
      ts: new Date().toISOString(),
      type: 'test_start',
      id: meta.id,
      title: test.title,
      area: meta.area,
      expectation: meta.expectation,
      passos: meta.passos,
      message: meta.expectation,
    })
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (test.title.startsWith('_')) return

    const meta = enrich(test.title)
    const shot = result.attachments.find((a) => a.name === 'screenshot' && a.path)?.path
    const row: CaseRow = {
      id: meta.id,
      title: test.title,
      area: meta.area,
      expectation: meta.expectation,
      passos: meta.passos,
      status: result.status,
      error: result.error?.message?.split('\n')[0],
      screenshot: shot,
      durationMs: result.duration,
    }
    this.cases.push(row)
    this.appendEvent({
      ts: new Date().toISOString(),
      type: 'test_end',
      id: row.id,
      title: row.title,
      area: row.area,
      expectation: row.expectation,
      passos: row.passos,
      status: row.status,
      error: row.error,
      message: row.expectation,
      passed: this.cases.filter((c) => c.status === 'passed').length,
      failed: this.cases.filter((c) => c.status === 'failed' || c.status === 'timedOut').length,
      skipped: this.cases.filter((c) => c.status === 'skipped').length,
    })
  }

  onEnd(result: FullResult) {
    const outRoot = this.reportDir
      ? resolve(this.reportDir)
      : resolve(process.cwd(), 'docs/homologacao/execucoes')
    mkdirSync(outRoot, { recursive: true })

    const passed = this.cases.filter((c) => c.status === 'passed').length
    const failed = this.cases.filter((c) => c.status === 'failed' || c.status === 'timedOut').length
    const skipped = this.cases.filter((c) => c.status === 'skipped').length
    const durationSec = Math.round((Date.now() - this.startedAt) / 1000)
    const ok = result.status === 'passed' && failed === 0
    const fileStamp = this.runId || stamp()
    const commit = tryGitSha()

    const assetsDir = resolve(outRoot, 'assets')
    mkdirSync(assetsDir, { recursive: true })
    const screenshotDataUrls: Record<string, string> = {}

    for (const c of this.cases) {
      if (!c.screenshot || !existsSync(c.screenshot)) continue
      const dest = resolve(assetsDir, `${c.id}-${basename(c.screenshot)}`)
      try {
        copyFileSync(c.screenshot, dest)
        c.screenshot = dest
        const buf = readFileSync(dest)
        screenshotDataUrls[dest] = `data:image/png;base64,${buf.toString('base64')}`
      } catch {
        /* ignore */
      }
    }

    const payload = {
      ambiente: 'DEV',
      baseUrl: this.baseURL,
      commit,
      startedAt: new Date(this.startedAt).toISOString(),
      durationSec,
      result: ok ? 'PASS' : 'FAIL',
      summary: { passed, failed, skipped, total: this.cases.length },
      cases: this.cases,
    }

    writeFileSync(resolve(outRoot, 'summary.json'), JSON.stringify(payload, null, 2), 'utf8')

    const html = buildHtml({
      baseURL: this.baseURL,
      commit,
      durationSec,
      ok,
      passed,
      failed,
      skipped,
      cases: this.cases,
      screenshotDataUrls,
    })
    const htmlPath = resolve(outRoot, 'report.html')
    writeFileSync(htmlPath, html, 'utf8')

    const legacyDir = resolve(process.cwd(), 'docs/homologacao/execucoes')
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(resolve(legacyDir, 'agente-latest.json'), JSON.stringify(payload, null, 2), 'utf8')
    writeFileSync(resolve(legacyDir, 'agente-latest.html'), html, 'utf8')
    writeFileSync(
      resolve(legacyDir, `agente-${fileStamp}.json`),
      JSON.stringify(payload, null, 2),
      'utf8',
    )
    writeFileSync(resolve(legacyDir, `agente-${fileStamp}.html`), html, 'utf8')

    this.appendEvent({
      ts: new Date().toISOString(),
      type: 'run_end',
      status: ok ? 'passed' : 'failed',
      passed,
      failed,
      skipped,
      message: ok ? 'Suite concluída com sucesso' : `Suite falhou (${failed} caso(s))`,
    })

    console.log(`\n📄 Relatório HTML: ${htmlPath}`)
  }
}

export default HuginAgentReporter
