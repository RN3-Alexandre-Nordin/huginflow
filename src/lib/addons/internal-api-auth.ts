import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

export function extractBearerOrHeaderSecret(request: Request): string | null {
  const headerSecret = request.headers.get('x-huginflow-secret')?.trim()
  if (headerSecret) return headerSecret
  const auth = request.headers.get('authorization') ?? ''
  const bearer = auth.match(/^Bearer\s+(.+)$/i)
  return bearer?.[1]?.trim() || null
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Autenticação de API interna de addons (Bifrost / sistemas RN3). */
export function assertAddonsInternalSecret(request: Request): NextResponse | null {
  const expected = process.env.HUGIN_ADDONS_INTERNAL_SECRET?.trim()
  if (!expected) {
    return NextResponse.json(
      { error: 'HUGIN_ADDONS_INTERNAL_SECRET não configurado no servidor.' },
      { status: 503 },
    )
  }

  const provided = extractBearerOrHeaderSecret(request)
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
