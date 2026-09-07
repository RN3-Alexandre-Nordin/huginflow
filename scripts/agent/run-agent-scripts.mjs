/** Executa scripts das Fases 1–5 e consolida scripts-summary.json. */
import { spawn } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const runId = process.env.TEST_RUN_ID || randomUUID()
const runDir =
  process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes', runId)

process.env.TEST_RUN_ID = runId
process.env.TEST_RUN_DIR = runDir

function run(script) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [resolve(root, script)], {
      cwd: root,
      env: { ...process.env },
      stdio: 'inherit',
    })
    child.on('close', (code) => done(code ?? 1))
  })
}

function readCases(file) {
  const path = resolve(runDir, file)
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, 'utf8')).cases || []
}

const phase1Code = await run('scripts/agent/phase1-scripts.mjs')
const phase2Code = await run('scripts/agent/phase2-scripts.mjs')
const phase3Code = await run('scripts/agent/phase3-scripts.mjs')
const phase4Code = await run('scripts/agent/phase4-scripts.mjs')
const phase5Code = await run('scripts/agent/phase5-scripts.mjs')
const cases = [
  ...readCases('scripts-summary.json'),
  ...readCases('phase2-scripts-summary.json'),
  ...readCases('phase3-scripts-summary.json'),
  ...readCases('phase4-scripts-summary.json'),
  ...readCases('phase5-scripts-summary.json'),
]
const passed = cases.filter((item) => item.status === 'passed').length
const failed = cases.filter((item) => item.status === 'failed').length
const skipped = cases.filter((item) => item.status === 'skipped').length
const payload = {
  ambiente: 'DEV',
  result: failed === 0 ? 'PASS' : 'FAIL',
  summary: { passed, failed, skipped, total: cases.length },
  cases,
}

writeFileSync(resolve(runDir, 'scripts-summary.json'), JSON.stringify(payload, null, 2), 'utf8')
if (
  phase1Code !== 0 ||
  phase2Code !== 0 ||
  phase3Code !== 0 ||
  phase4Code !== 0 ||
  phase5Code !== 0 ||
  failed > 0
) {
  process.exit(1)
}
