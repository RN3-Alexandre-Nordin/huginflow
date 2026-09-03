import { createClient } from '@/utils/supabase/server'
import { isRn3SuperAdmin } from '@/utils/permissions'

export async function requireTestesSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const, status: 401 as const }

  const { data: me } = await supabase
    .from('usuarios')
    .select('id, role_global, nome_completo, email')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!isRn3SuperAdmin(me)) {
    return { error: 'Apenas superadmin RN3' as const, status: 403 as const }
  }

  return { supabase, me: me!, user }
}

export function isTestRunnerEnabled() {
  return process.env.TEST_RUNNER_ENABLED === 'true' || process.env.TEST_RUNNER_ENABLED === '1'
}
