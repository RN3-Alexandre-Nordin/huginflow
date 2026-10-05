import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import LocalForm from '../LocalForm'
import { createLocal } from '../actions'

export const metadata = { title: 'Novo Local de Estoque | HuginFlow' }

export default async function NovoLocalPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canCreate = isSuperAdmin || hasPermission(me, 'estoque_locais', 'create') || hasPermission(me, 'estoque', 'create')
  if (!canCreate) {
    redirect('/cockpit/acesso-negado')
  }

  const supabase = await createClient()

  let deptsQuery = supabase
    .from('departamentos')
    .select('id, nome')
    .order('nome')

  if (!isSuperAdmin) {
    deptsQuery = deptsQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { data: departamentos } = await deptsQuery

  const { data: empresas } = isSuperAdmin
    ? await supabase.from('empresas').select('id, nome').order('nome')
    : { data: [] }

  return (
    <LocalForm
      title="Novo Local de Estoque"
      subtitle="Cadastre um novo almoxarifado, depósito ou local de armazenagem física."
      departamentos={departamentos || []}
      empresas={empresas || []}
      isSuperAdmin={isSuperAdmin}
      currentEmpresaId={me?.empresa_id ?? ''}
      onSubmitAction={createLocal}
    />
  )
}
