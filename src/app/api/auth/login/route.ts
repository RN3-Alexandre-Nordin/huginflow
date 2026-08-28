import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { PASSWORD_CHANGE_PATH } from '@/lib/auth/password-change'
import { fetchUsuarioLoginProfile } from '@/lib/auth/usuario-profile'
import { getServerSupabaseAnonKey, getServerSupabaseUrl } from '@/lib/supabase/env'

function redirectWithCookies(path: string, cookiePairs: Array<{ name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }>) {
  const response = NextResponse.redirect(path)
  for (const { name, value, options } of cookiePairs) {
    response.cookies.set(name, value, options)
  }
  return response
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = ((formData.get('email') as string) ?? '').trim().toLowerCase()
  const password = ((formData.get('password') as string) ?? '').trim()
  const origin = new URL(request.url).origin

  if (!email || !password) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Preencha e-mail e senha.')}`,
    )
  }

  const cookieStore = await cookies()
  const pendingCookies: Array<{ name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }> = []

  const supabase = createServerClient(getServerSupabaseUrl(), getServerSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
          pendingCookies.push({ name, value, options })
        })
      },
    },
  })

  const { error, data } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const message =
      error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : error.message
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`)
  }

  let destination = `${origin}/cockpit`
  const userId = data.session?.user?.id

  if (userId) {
    const usuarioData = await fetchUsuarioLoginProfile(supabase, userId)

    if (usuarioData?.empresa_id) {
      const { data: empresaData } = await supabase
        .from('empresas')
        .select('ativo')
        .eq('id', usuarioData.empresa_id)
        .single()

      if (empresaData && !empresaData.ativo) {
        await supabase.auth.signOut()
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent('Acesso suspenso. Entre em contato com a RN3.')}`,
        )
      }
    }

    if (usuarioData?.must_change_password) {
      destination = `${origin}${PASSWORD_CHANGE_PATH}?required=1`
    }
  }

  return redirectWithCookies(destination, pendingCookies)
}
