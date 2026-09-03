import { NextResponse } from 'next/server'
import { requireTestesSuperAdmin } from '@/lib/testes/auth'
import { cancelPlaywrightRun } from '@/lib/testes/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireTestesSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await ctx.params
  const result = await cancelPlaywrightRun(id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }
  return NextResponse.json(result)
}
