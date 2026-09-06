import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/lib/auth/getMyProfile'
import { getBifrostOrigin, getBifrostUrl } from '@/lib/bifrost/config'
import { signBifrostEmbedToken } from '@/lib/bifrost/jwt'

export const dynamic = 'force-dynamic'

type EmbedTokenResponse = {
  embedUrl: string
  bifrostOrigin: string
  expiresIn: number
}

/** Só paths de embed Bifrost — evita open redirect. */
function sanitizeEmbedNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const next = raw.trim()
  if (!next.startsWith('/embed/')) return null
  if (next.includes('://') || next.includes('//') || next.includes('\\')) return null
  if (!/^\/embed\/[a-zA-Z0-9/_-]*$/.test(next)) return null
  return next
}

/**
 * Emite JWT curto (RS256) e monta a URL do embed Bifrost.
 * Body opcional: `{ next?: "/embed/chamados" }` para handoff pós-SSO.
 * Autenticado — só usuário logado do tenant.
 */
export async function POST(request: NextRequest) {
  try {
    const me = await getMyProfile()
    if (!me?.id || !me.empresa_id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const email = (me.email as string | null)?.trim()
    const name = (me.nome_completo as string | null)?.trim()
    if (!email) {
      return NextResponse.json({ error: 'Usuário sem e-mail cadastrado.' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json(
        { error: 'Usuário sem nome cadastrado. Atualize o perfil antes de abrir suporte.' },
        { status: 400 },
      )
    }

    let nextPath: string | null = null
    try {
      const body = (await request.json()) as { next?: unknown }
      nextPath = sanitizeEmbedNext(body?.next)
    } catch {
      // body vazio = abrir chamado (fluxo padrão do Bifrost)
    }

    const supabase = await createClient()
    const { data: empresa } = await supabase
      .from('empresas')
      .select('id, nome')
      .eq('id', me.empresa_id)
      .maybeSingle()

    if (!empresa?.id) {
      return NextResponse.json({ error: 'Empresa do usuário não encontrada.' }, { status: 400 })
    }

    const token = await signBifrostEmbedToken({
      userId: me.id,
      email,
      name,
      tenantId: empresa.id,
      empresaNome: empresa.nome || 'Empresa',
    })

    let huginOrigin = request.headers.get('origin')?.trim() || ''
    if (!huginOrigin) {
      const proto = request.headers.get('x-forwarded-proto') || 'http'
      const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
      if (host) huginOrigin = `${proto}://${host.split(',')[0].trim()}`
    }
    if (!huginOrigin) {
      return NextResponse.json({ error: 'Não foi possível determinar o origin do Hugin.' }, { status: 400 })
    }

    const bifrostUrl = getBifrostUrl()
    const params = new URLSearchParams({
      token,
      origin: huginOrigin,
    })
    if (nextPath) params.set('next', nextPath)

    const embedUrl = `${bifrostUrl}/embed/sso?${params.toString()}`

    const body: EmbedTokenResponse = {
      embedUrl,
      bifrostOrigin: getBifrostOrigin(),
      expiresIn: 60,
    }

    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao emitir token Bifrost'
    console.error('[bifrost/embed-token]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
