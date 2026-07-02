'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { isRn3SuperAdmin } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'

export async function deleteContrato(id: string): Promise<{ error?: string }> {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) {
    return { error: 'Acesso restrito ao Super Admin RN3.' }
  }

  const supabase = await createClient()
  let query = supabase.from('finance_contratos').delete().eq('id', id)
  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) return { error: error.message }

  revalidatePath('/cockpit/financeiro/contratos')
  return {}
}
