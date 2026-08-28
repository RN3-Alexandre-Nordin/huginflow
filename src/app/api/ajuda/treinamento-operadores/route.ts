import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { prepareHelpHtml } from '@/lib/ajuda-html'

export async function GET() {
  const raw = readFileSync(
    join(process.cwd(), 'docs/treinamento-operadores.html'),
    'utf8',
  )
  const html = prepareHelpHtml(raw)
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
