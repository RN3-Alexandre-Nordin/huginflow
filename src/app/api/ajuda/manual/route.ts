import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { prepareHelpHtml } from '@/lib/ajuda-html'
import { getMyProfile } from '@/lib/auth/getMyProfile'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getMyProfile()
  if (!me) {
    return new NextResponse('Não autenticado.', { status: 401 })
  }
  const isAdmin =
    me.role_global === 'admin' || me.role_global === 'superadmin'
  if (!isAdmin) {
    return new NextResponse('Acesso restrito a administradores.', { status: 403 })
  }

  const raw = readFileSync(
    join(process.cwd(), 'docs/manuais/manual-administrador.html'),
    'utf8',
  )
  const html = prepareHelpHtml(raw)
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
