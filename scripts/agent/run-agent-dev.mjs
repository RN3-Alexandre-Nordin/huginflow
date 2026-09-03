/**
 * Agente DEV Fase 1: scripts SCR-* + Playwright e2e-core → relatório unificado.
 *
 * Env: TEST_RUN_ID, TEST_RUN_DIR, TEST_RUN_EVENTS_PATH, TEST_BASE_URL, TEST_HEADED
 *
 * Uso:
 *   npm run test:agent:dev
 *   node scripts/agent/run-agent-dev.mjs
 */
import { spawn } from 'child_process'
import { execSync } from 'child_process'
import { config as loadDotenv } from 'dotenv'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs'
import { basename, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

for (const f of ['.env.local', '.env']) {
  const p = resolve(root, f)
  if (existsSync(p)) loadDotenv({ path: p, override: false })
}

const runId = process.env.TEST_RUN_ID || randomUUID()
const runDir =
  process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes', runId)
const eventsPath = process.env.TEST_RUN_EVENTS_PATH || resolve(runDir, 'events.ndjson')
const baseUrl = (
  process.env.TEST_BASE_URL ||
  process.env.MANUAL_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000'
).replace(/\/$/, '')

mkdirSync(runDir, { recursive: true })
writeFileSync(eventsPath, '', 'utf8')

process.env.TEST_RUN_ID = runId
process.env.TEST_RUN_DIR = runDir
process.env.TEST_RUN_EVENTS_PATH = eventsPath
process.env.TEST_BASE_URL = baseUrl

function appendEvent(ev) {
  writeFileSync(eventsPath, `${JSON.stringify(ev)}\n`, { flag: 'a' })
}

function tryGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: root }).trim()
  } catch {
    return 'unknown'
  }
}

function runNode(script) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [resolve(root, script)], {
      cwd: root,
      env: { ...process.env },
      stdio: 'inherit',
    })
    child.on('close', (code) => resolvePromise(code ?? 1))
  })
}

function runPlaywright() {
  return new Promise((resolvePromise) => {
    const args = ['playwright', 'test', 'e2e/core']
    const child = spawn('npx', args, {
      cwd: root,
      env: {
        ...process.env,
        TEST_RUN_ID: runId,
        TEST_RUN_DIR: runDir,
        TEST_RUN_EVENTS_PATH: eventsPath,
        TEST_BASE_URL: baseUrl,
        // Não zerar events no início do reporter — agent já escreveu scripts
        TEST_RUN_KEEP_EVENTS: '1',
        FORCE_COLOR: '0',
      },
      shell: true,
      stdio: 'inherit',
      windowsHide: process.env.TEST_HEADED !== '1',
    })
    child.on('close', (code) => resolvePromise(code ?? 1))
  })
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(payload) {
  const ok = payload.result === 'PASS'
  const cases = payload.cases || []
  const failRows = cases.filter((c) => c.status === 'failed' || c.status === 'timedOut')
  const caseRows = cases
    .map((c) => {
      const icon = c.status === 'passed' ? '✅' : c.status === 'skipped' ? '⏭' : '❌'
      const label = c.expectation || c.title
      const detail = c.passos ? `<div class="passos">${escapeHtml(c.passos)}</div>` : ''
      const area = c.area ? `<span class="area">${escapeHtml(c.area)}</span>` : ''
      return `<tr>
        <td><code>${escapeHtml(c.id)}</code>${area}</td>
        <td>${icon} ${escapeHtml(c.status)}</td>
        <td><div class="exp">${escapeHtml(label)}</div>${detail}</td>
        <td>${((c.durationMs || 0) / 1000).toFixed(1)}s</td>
      </tr>`
    })
    .join('\n')

  const failBlocks = failRows
    .map(
      (f, i) => `<section class="fail">
      <h3>${i + 1}. ${escapeHtml(f.id)} — ${escapeHtml(f.expectation || f.title)}</h3>
      ${f.passos ? `<p class="passos">${escapeHtml(f.passos)}</p>` : ''}
      <p class="err">${escapeHtml(f.error || 'Falha sem mensagem')}</p>
    </section>`,
    )
    .join('\n')

  const { passed, failed, skipped } = payload.summary
  const durationSec = payload.durationSec || 0

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório agente — ${ok ? 'PASSOU' : 'FALHOU'}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0a0a0a; color: #e8e8e8; line-height: 1.5; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 1.5rem; margin: 0 0 8px; }
    .meta { color: #9ca3af; font-size: 0.875rem; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 6px 12px; border-radius: 8px; font-weight: 800; font-size: 0.75rem; }
    .ok { background: rgba(128,184,40,0.15); color: #80B828; border: 1px solid rgba(128,184,40,0.35); }
    .bad { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; font-size: 0.875rem; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #ffffff12; vertical-align: top; }
    th { color: #9ca3af; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; }
    code { font-size: 0.8rem; color: #2BAADF; }
    .area { display: block; margin-top: 4px; font-size: 0.7rem; color: #6b7280; text-transform: uppercase; }
    .exp { color: #f3f4f6; font-weight: 600; }
    .passos { margin-top: 6px; color: #9ca3af; font-size: 0.8rem; }
    .fail { margin: 16px 0; padding: 16px; border: 1px solid #ffffff12; border-radius: 12px; background: #111; }
    .err { color: #fca5a5; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
    .card { background: #111; border: 1px solid #ffffff10; border-radius: 12px; padding: 14px; }
    .card b { display: block; font-size: 1.4rem; }
    .card span { color: #9ca3af; font-size: 0.75rem; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Relatório do agente de testes (Fase 1)</h1>
    <p class="meta">${escapeHtml(new Date().toLocaleString('pt-BR'))}<br/>
      Ambiente: DEV · Base: ${escapeHtml(payload.baseUrl || '')}<br/>
      Commit: ${escapeHtml(payload.commit || '')} · Duração: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s
    </p>
    <span class="badge ${ok ? 'ok' : 'bad'}">${ok ? 'PASSOU' : `FALHOU (${failed})`}</span>
    <div class="summary">
      <div class="card"><span>Passou</span><b>${passed}</b></div>
      <div class="card"><span>Falhou</span><b>${failed}</b></div>
      <div class="card"><span>Pulou</span><b>${skipped}</b></div>
    </div>
    <h2>O que foi testado</h2>
    <table>
      <thead><tr><th>ID / Área</th><th>Status</th><th>Expectativa e passos</th><th>Tempo</th></tr></thead>
      <tbody>${caseRows}</tbody>
    </table>
    ${failRows.length ? `<h2>O que quebrou</h2>${failBlocks}` : '<p class="meta">Núcleo Fase 1 verde.</p>'}
  </div>
</body>
</html>`
}

function mergeReports(startedAt) {
  const scriptsPath = resolve(runDir, 'scripts-summary.json')
  const uiPath = resolve(runDir, 'summary.json')
  const scriptCases = existsSync(scriptsPath)
    ? JSON.parse(readFileSync(scriptsPath, 'utf8')).cases || []
    : []
  const uiPayload = existsSync(uiPath) ? JSON.parse(readFileSync(uiPath, 'utf8')) : null
  const uiCases = uiPayload?.cases || []

  const cases = [...scriptCases, ...uiCases]
  const passed = cases.filter((c) => c.status === 'passed').length
  const failed = cases.filter((c) => c.status === 'failed' || c.status === 'timedOut').length
  const skipped = cases.filter((c) => c.status === 'skipped').length
  const durationSec = Math.round((Date.now() - startedAt) / 1000)

  const payload = {
    ambiente: 'DEV',
    baseUrl: baseUrl,
    commit: tryGitSha(),
    startedAt: new Date(startedAt).toISOString(),
    durationSec,
    result: failed === 0 ? 'PASS' : 'FAIL',
    suite: 'agent-dev',
    summary: { passed, failed, skipped, total: cases.length },
    cases,
  }

  writeFileSync(resolve(runDir, 'summary.json'), JSON.stringify(payload, null, 2), 'utf8')
  const html = buildHtml(payload)
  writeFileSync(resolve(runDir, 'report.html'), html, 'utf8')

  const legacy = resolve(root, 'docs/homologacao/execucoes')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(resolve(legacy, 'agente-latest.json'), JSON.stringify(payload, null, 2), 'utf8')
  writeFileSync(resolve(legacy, 'agente-latest.html'), html, 'utf8')

  return payload
}

const startedAt = Date.now()
appendEvent({
  ts: new Date().toISOString(),
  type: 'run_start',
  message: `Agente DEV Fase 1 · ${baseUrl}`,
})

console.log(`\n🚀 Agente DEV · run ${runId}\n   Base: ${baseUrl}\n`)

const scriptCode = await runNode('scripts/agent/phase1-scripts.mjs')
appendEvent({
  ts: new Date().toISOString(),
  type: 'log',
  message: 'Iniciando suíte UI (Playwright)…',
})
const uiCode = await runPlaywright()

const payload = mergeReports(startedAt)
appendEvent({
  ts: new Date().toISOString(),
  type: 'run_end',
  status: payload.result === 'PASS' ? 'passed' : 'failed',
  passed: payload.summary.passed,
  failed: payload.summary.failed,
  skipped: payload.summary.skipped,
  message:
    payload.result === 'PASS'
      ? 'Fase 1 concluída com sucesso'
      : `Fase 1 falhou (${payload.summary.failed} caso(s))`,
})

console.log(`\n📄 Relatório: ${resolve(runDir, 'report.html')}`)
console.log(
  `   ${payload.summary.passed} passou · ${payload.summary.failed} falhou · ${payload.summary.skipped} pulou\n`,
)

if (scriptCode !== 0 || uiCode !== 0 || payload.result !== 'PASS') {
  process.exit(1)
}
