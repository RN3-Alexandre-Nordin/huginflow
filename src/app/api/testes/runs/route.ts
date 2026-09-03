import { NextResponse } from 'next/server'
import { execSync } from 'node:child_process'
import { isTestRunnerEnabled, requireTestesSuperAdmin } from '@/lib/testes/auth'
import { hasActiveRun, reconcileStaleRuns, startPlaywrightCoreRun } from '@/lib/testes/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tryGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export async function GET() {
  const auth = await requireTestesSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  await reconcileStaleRuns()

  const { data, error } = await auth.supabase
    .from('test_runs')
    .select(
      'id, started_at, finished_at, status, suite, headed, base_url, commit_sha, passed, failed, skipped, triggered_by, error_message, created_at',
    )
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    runnerEnabled: isTestRunnerEnabled(),
    active: hasActiveRun(),
    runs: data ?? [],
  })
}

export async function POST(req: Request) {
  const auth = await requireTestesSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!isTestRunnerEnabled()) {
    return NextResponse.json(
      {
        error:
          'Runner desabilitado. Defina TEST_RUNNER_ENABLED=true no ambiente local/self-hosted.',
      },
      { status: 503 },
    )
  }

  if (hasActiveRun()) {
    return NextResponse.json({ error: 'Já existe uma execução em andamento.' }, { status: 409 })
  }

  await reconcileStaleRuns()

  const body = (await req.json().catch(() => ({}))) as { headed?: boolean; suite?: string }
  const headed = Boolean(body.headed)
  const suite = body.suite || 'agent-dev'
  if (suite !== 'e2e-core' && suite !== 'agent-dev') {
    return NextResponse.json({ error: 'Suite não suportada ainda.' }, { status: 400 })
  }

  const baseUrl =
    process.env.TEST_BASE_URL ||
    process.env.MANUAL_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'

  const { data: row, error } = await auth.supabase
    .from('test_runs')
    .insert({
      status: 'queued',
      suite,
      headed,
      base_url: baseUrl,
      commit_sha: tryGitSha(),
      triggered_by: auth.me.id,
    })
    .select('id')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: error?.message || 'Falha ao criar run' }, { status: 500 })
  }

  try {
    await startPlaywrightCoreRun({
      runId: row.id,
      headed,
      baseUrl,
      commitSha: tryGitSha(),
      suite,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao iniciar Playwright'
    await auth.supabase
      .from('test_runs')
      .update({ status: 'error', finished_at: new Date().toISOString(), error_message: msg })
      .eq('id', row.id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ id: row.id, status: 'running' })
}
