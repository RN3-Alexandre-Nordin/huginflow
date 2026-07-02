import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { NextResponse } from 'next/server'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const rel = path.join('/')
  if (rel.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const filePath = join(process.cwd(), 'docs', 'manual', 'img', rel)
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = extname(filePath).toLowerCase()
  const body = readFileSync(filePath)

  return new NextResponse(body, {
    headers: {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
