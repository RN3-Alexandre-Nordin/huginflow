import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isPasswordChangePath, PASSWORD_CHANGE_PATH } from '@/lib/auth/password-change'

/**
 * PROXY - Next.js 16 (substitui o middleware.ts depreciado)
 *
 * Arquitetura de intercepção:
 * 1. Rotas internas do Next.js (_next/*) → SEMPRE passam direto (sem auth)
 * 2. Webhooks da Evolution API → passam direto (sem auth, sem CSRF)
 * 3. Rotas públicas (/, /login) → passam direto
 * 4. Todas as demais rotas → verificam sessão Supabase
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ─── BYPASS IMEDIATO (sem tocar em cookies ou Supabase) ───────────────────
  // Qualquer coisa relacionada ao Next.js internamente (HMR, assets, chunks)
  if (
    pathname.startsWith('/_next') ||           // HMR, webpack, chunks
    pathname.startsWith('/api/webhooks') ||     // Evolution API webhooks (sem auth)
    pathname.startsWith('/api/health') ||       // Diagnóstico omnichannel (sem auth)
    pathname.startsWith('/api/inbound') ||      // Inbound leads public API (sem auth)
    pathname.startsWith('/favicon') ||          // favicon
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|map)$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  // Normalizar pathname para remover prefixo de locale (ex: /pt/login → /login)
  const segments = pathname.split('/').filter(Boolean)
  const normalizedPathname =
    segments.length > 0 && segments[0].length === 2
      ? '/' + (segments.slice(1).join('/') || '')
      : pathname

  const publicRoutes = ['/', '/login', '/privacidade', '/termos']
  const isPublicRoute = publicRoutes.includes(normalizedPathname)

  // NEXT_PUBLIC_* é embutido no build da imagem. Sem secrets no CI → string vazia
  // e o createServerClient quebra com 500. Fallback para SUPABASE_* (também no build).
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    if (isPublicRoute) {
      return NextResponse.next()
    }
    return new NextResponse(
      'Configuração incompleta: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no build (GitHub Secrets) e gere a imagem de novo.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }

  // ─── ROTAS DE AUTENTICAÇÃO (Supabase Session) ────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // Rotas públicas: se logado na raiz, vai ao cockpit
  if (isPublicRoute) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user && normalizedPathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/cockpit'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Rotas protegidas: verificar sessão
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (normalizedPathname.startsWith('/cockpit')) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('must_change_password')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (usuario?.must_change_password && !isPasswordChangePath(normalizedPathname)) {
      const url = request.nextUrl.clone()
      url.pathname = PASSWORD_CHANGE_PATH
      url.search = 'required=1'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Intercepta todas as rotas EXCETO:
     * - _next/* (recursos internos do Next.js)
     * - arquivos estáticos
     * Nota: /api/webhooks é tratado internamente no proxy acima
     */
    '/((?!_next|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
