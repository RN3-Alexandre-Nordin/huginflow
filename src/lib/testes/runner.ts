import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAdminClient } from '@/utils/supabase/admin'
import { isRunStale, staleRunMessage } from '@/lib/testes/stale'
import { runDir, runEventsPath, runReportPath, runSummaryPath } from './paths'

type ActiveRun = {
  runId: string
  child: ChildProcess
  startedAt: number
}

const globalStore = globalThis as unknown as {
  __huginTestRuns?: Map<string, ActiveRun>
}

function activeMap() {
  if (!globalStore.__huginTestRuns) globalStore.__huginTestRuns = new Map()
  return globalStore.__huginTestRuns
}

export function getActiveRunIds() {
  return [...activeMap().keys()]
}

export function hasActiveRun() {
  return activeMap().size > 0
}

/** Runs órfãos no banco (running sem processo) ou muito antigos → error. */
export async function reconcileStaleRuns() {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('test_runs')
    .select('id, status, started_at')
    .in('status', ['running', 'queued'])

  if (!rows?.length) return

  const active = new Set(getActiveRunIds())
  const now = Date.now()

  for (const row of rows) {
    const inMemory = active.has(row.id)
    const startedMs = row.started_at ? new Date(row.started_at).getTime() : 0
    const orphan = !inMemory && startedMs > 0 && now - startedMs > 3 * 60 * 1000
    const tooOld = isRunStale(row.started_at, row.status)

    if (orphan || tooOld) {
      await admin
        .from('test_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error_message: staleRunMessage(),
        })
        .eq('id', row.id)
    }
  }
}

export function readEvents(runId: string, afterLine = 0) {
  const path = runEventsPath(runId)
  if (!existsSync(path)) return { lines: [] as string[], total: 0 }
  const raw = readFileSync(path, 'utf8')
  const all = raw.split('\n').filter(Boolean)
  return { lines: all.slice(afterLine), total: all.length }
}

export function readSummary(runId: string) {
  const path = runSummaryPath(runId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

async function finalizeRun(
  runId: string,
  status: 'passed' | 'failed' | 'error' | 'cancelled',
  errorMessage?: string,
) {
  activeMap().delete(runId)
  const summary = readSummary(runId)
  const admin = createAdminClient()
  const patch: Record<string, unknown> = {
    status,
    finished_at: new Date().toISOString(),
    report_path: existsSync(runReportPath(runId)) ? runReportPath(runId) : null,
    error_message: errorMessage ?? null,
  }
  if (summary?.summary) {
    patch.passed = summary.summary.passed ?? 0
    patch.failed = summary.summary.failed ?? 0
    patch.skipped = summary.summary.skipped ?? 0
    patch.summary_json = summary
  }
  await admin.from('test_runs').update(patch).eq('id', runId)
}

export async function cancelPlaywrightRun(runId: string) {
  const active = activeMap().get(runId)
  if (active) {
    try {
      if (process.platform === 'win32' && active.child.pid) {
        spawn('taskkill', ['/pid', String(active.child.pid), '/T', '/F'], {
          shell: true,
          windowsHide: true,
        })
      } else {
        active.child.kill('SIGTERM')
        setTimeout(() => {
          try {
            active.child.kill('SIGKILL')
          } catch {
            /* ignore */
          }
        }, 2000)
      }
    } catch {
      /* ignore */
    }
    activeMap().delete(runId)
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('test_runs')
    .select('id, status')
    .eq('id', runId)
    .maybeSingle()

  if (!row) return { ok: false as const, error: 'Run não encontrado' }
  if (['passed', 'failed', 'cancelled', 'error'].includes(row.status)) {
    return { ok: true as const, alreadyDone: true as const, status: row.status }
  }

  await finalizeRun(runId, 'cancelled', 'Cancelado pelo superadmin')
  return { ok: true as const, alreadyDone: false as const, status: 'cancelled' as const }
}

export async function startPlaywrightCoreRun(opts: {
  runId: string
  headed: boolean
  baseUrl: string
  commitSha?: string | null
  suite?: string
}) {
  const dir = runDir(opts.runId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(runEventsPath(opts.runId), '', 'utf8')

  const suite = opts.suite || 'e2e-core'
  const admin = createAdminClient()
  await admin
    .from('test_runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      events_path: runEventsPath(opts.runId),
      report_path: runReportPath(opts.runId),
      base_url: opts.baseUrl,
      commit_sha: opts.commitSha ?? null,
      headed: opts.headed,
      suite,
    })
    .eq('id', opts.runId)

  const isWin = process.platform === 'win32'
  const useAgent = suite === 'agent-dev'
  const child = useAgent
    ? spawn(process.execPath, [resolve(process.cwd(), 'scripts/agent/run-agent-dev.mjs')], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TEST_RUN_ID: opts.runId,
          TEST_RUN_DIR: dir,
          TEST_RUN_EVENTS_PATH: runEventsPath(opts.runId),
          TEST_HEADED: opts.headed ? '1' : '0',
          TEST_BASE_URL: opts.baseUrl,
          FORCE_COLOR: '0',
        },
        shell: false,
        windowsHide: isWin ? !opts.headed : true,
      })
    : spawn('npx', ['playwright', 'test', 'e2e/core'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TEST_RUN_ID: opts.runId,
          TEST_RUN_DIR: dir,
          TEST_RUN_EVENTS_PATH: runEventsPath(opts.runId),
          TEST_HEADED: opts.headed ? '1' : '0',
          TEST_BASE_URL: opts.baseUrl,
          FORCE_COLOR: '0',
        },
        shell: true,
        windowsHide: isWin ? !opts.headed : true,
      })

  activeMap().set(opts.runId, { runId: opts.runId, child, startedAt: Date.now() })

  let stderrBuf = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8')
    if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000)
  })

  child.on('error', (err) => {
    void finalizeRun(opts.runId, 'error', err.message)
  })

  child.on('close', async (code) => {
    activeMap().delete(opts.runId)
    try {
      const admin = createAdminClient()
      const { data: current } = await admin
        .from('test_runs')
        .select('status')
        .eq('id', opts.runId)
        .maybeSingle()
      if (current && !['running', 'queued'].includes(current.status)) {
        return
      }
    } catch {
      /* continue finalize */
    }

    const summary = readSummary(opts.runId)
    if (summary?.result === 'PASS') {
      void finalizeRun(opts.runId, 'passed')
      return
    }
    if (summary?.result === 'FAIL' || code !== 0) {
      void finalizeRun(
        opts.runId,
        'failed',
        code !== 0 && !summary ? `Playwright exit ${code}. ${stderrBuf.slice(-500)}` : undefined,
      )
      return
    }
    void finalizeRun(opts.runId, code === 0 ? 'passed' : 'failed', stderrBuf.slice(-500) || undefined)
  })

  // Timeout de segurança (20 min)
  setTimeout(() => {
    const active = activeMap().get(opts.runId)
    if (!active) return
    try {
      active.child.kill()
    } catch {
      /* ignore */
    }
    void finalizeRun(opts.runId, 'error', 'Timeout: execução excedeu 20 minutos')
  }, 20 * 60 * 1000)

  return { pid: child.pid }
}

export function projectRootResolve(...parts: string[]) {
  return resolve(process.cwd(), ...parts)
}
