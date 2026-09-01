import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'

/** Perfil do usuário logado — deduplicado por request via React cache(). */
export const getMyProfile = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return null

  const { data: me } = await supabase
    .from('usuarios')
    .select('*, grupos_acesso(is_admin, permissoes)')
    .eq('auth_user_id', authUser.id)
    .single()

  return me
})
