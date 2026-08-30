import type { SupabaseClient } from '@supabase/supabase-js'

export type UsuarioLoginProfile = {
  empresa_id: string | null
  must_change_password: boolean
  ativo: boolean
}

/** Busca perfil para login/proxy; tolera coluna must_change_password ainda não migrada. */
export async function fetchUsuarioLoginProfile(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<UsuarioLoginProfile | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('empresa_id, must_change_password, ativo')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (!error) {
    return {
      empresa_id: data?.empresa_id ?? null,
      must_change_password: data?.must_change_password === true,
      ativo: data?.ativo !== false,
    }
  }

  if (!error.message.includes('must_change_password')) {
    console.error('[Auth] Erro ao buscar perfil do usuário:', error.message)
    return null
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from('usuarios')
    .select('empresa_id, ativo')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (fallbackError) {
    console.error('[Auth] Erro ao buscar perfil (fallback):', fallbackError.message)
    return null
  }

  return {
    empresa_id: fallback?.empresa_id ?? null,
    must_change_password: false,
    ativo: fallback?.ativo !== false,
  }
}
