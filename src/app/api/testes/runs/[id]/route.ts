import { NextResponse } from 'next/server'
import { requireTestesSuperAdmin } from '@/lib/testes/auth'
import { getActiveRunIds, readEvents, readSummary, reconcileStaleRuns } from '@/lib/testes/runner'
import { isRunStale } from '@/lib/testes/stale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireTestesSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await ctx.params
  const url = new URL(req.url)
  const after = Number(url.searchParams.get('after') || '0') || 0

  await reconcileStaleRuns()

  const { data: run, error } = await auth.supabase
    .from('test_runs')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!run) return NextResponse.json({ error: 'Run não encontrado' }, { status: 404 })

  const events = readEvents(id, after)
  const summary = readSummary(id)
  const live = getActiveRunIds().includes(id)
  const stale = isRunStale(run.started_at, run.status)

  return NextResponse.json({
    run,
    live,
    stale,
    events: events.lines.map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { type: 'log', message: line, ts: new Date().toISOString() }
      }
    }),
    eventsTotal: events.total,
    summary,
  })
}
