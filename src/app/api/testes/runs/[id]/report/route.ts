import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import { requireTestesSuperAdmin } from '@/lib/testes/auth'
import { runReportPath } from '@/lib/testes/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireTestesSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await ctx.params
  const { data: run } = await auth.supabase
    .from('test_runs')
    .select('id, report_path, status')
    .eq('id', id)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run não encontrado' }, { status: 404 })

  const path = run.report_path || runReportPath(id)
  if (!existsSync(path)) {
    return NextResponse.json({ error: 'Relatório ainda não disponível' }, { status: 404 })
  }

  const html = readFileSync(path, 'utf8')
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
