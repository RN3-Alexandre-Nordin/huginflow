import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

function prepareManualHtml(raw: string) {
  return raw
    .replace(/src="manual\/img\//g, 'src="/api/ajuda/img/')
    .replace(/src="manual\/videos\//g, 'src="/api/ajuda/img/videos/')
}

export async function GET() {
  const raw = readFileSync(join(process.cwd(), 'docs/manual-usuario-huginflow.html'), 'utf8')
  const html = prepareManualHtml(raw)
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
