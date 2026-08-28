import { createClient } from '@supabase/supabase-js'
import { getServerSupabaseUrl } from '@/lib/supabase/env'

export function createAdminClient() {
  const supabaseUrl = getServerSupabaseUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente nas variáveis de ambiente.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
