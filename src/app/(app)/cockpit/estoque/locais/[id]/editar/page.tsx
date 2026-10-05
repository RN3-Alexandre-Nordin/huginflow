import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import LocalForm from '../../LocalForm'
import { updateLocal } from '../../actions'

export const metadata = { title: 'Editar Local de Estoque | HuginFlow' }

export default async function EditarLocalPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canEdit = isSuperAdmin || hasPermission(me, 'estoque_locais', 'edit') || hasPermission(me, 'estoque', 'edit')
  if (!canEdit) {
    redirect('/cockpit/acesso-negado')
  }

  const supabase = await createClient()

  let localQuery = supabase
    .from('cad_locais_estoque')
    .select('*')
    .eq('id', id)

  if (!isSuperAdmin) {
    localQuery = localQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { data: local } = await localQuery.single()
  if (!local) {
    notFound()
  }

  let deptsQuery = supabase
    .from('departamentos')
    .select('id, nome')
    .eq('empresa_id', local.empresa_id)
    .order('nome')

  const { data: departamentos } = await deptsQuery

  const { data: empresas } = isSuperAdmin
    ? await supabase.from('empresas').select('id, nome').order('nome')
    : { data: [] }

  const updateActionWithId = updateLocal.bind(null, id)

  return (
    <LocalForm
      title="Editar Local de Estoque"
      subtitle={`Alterando configurações e dados do local ${local.codigo}.`}
      initialData={local}
      departamentos={departamentos || []}
      empresas={empresas || []}
      isSuperAdmin={isSuperAdmin}
      currentEmpresaId={local.empresa_id}
      onSubmitAction={updateActionWithId}
    />
  )
}
