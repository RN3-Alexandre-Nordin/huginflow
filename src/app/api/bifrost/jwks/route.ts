import { NextResponse } from 'next/server'
import { getBifrostJwks } from '@/lib/bifrost/jwt'

export const dynamic = 'force-dynamic'

/** JWKS público para o Bifrost validar tokens RS256 do Hugin Flow. */
export async function GET() {
  try {
    const jwks = await getBifrostJwks()
    return NextResponse.json(jwks, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JWKS indisponível'
    console.error('[bifrost/jwks]', message)
    return NextResponse.json({ error: message, keys: [] }, { status: 503 })
  }
}
