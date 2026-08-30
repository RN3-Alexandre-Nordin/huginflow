import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import EditForm from "./EditForm"
import { getGruposByEmpresa } from "@/app/(app)/cockpit/actions"

export default async function EditarUsuarioPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()

  // Fetch user data with company and group
  const { data: user } = await supabase
    .from("usuarios")
    .select("*, empresas(id, nome), grupos_acesso(id, nome)")
    .eq("id", params.id)
    .single()

  if (!user) {
    notFound()
  }

  // Get current session user — role and superuser flag
  // Filtra por auth_user_id: superadmin vê todos, então .single() sem filtro falharia
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: userData } = await supabase
    .from('usuarios')
    .select('role_global, is_superuser')
    .eq('auth_user_id', authUser?.id ?? '')
    .single()
  const isSuperAdmin = userData?.role_global === 'superadmin'
  const currentUserIsSuperuser = userData?.is_superuser === true

  // Fetch companies and groups for the select
  const { data: companies } = await supabase.from('empresas').select('id, nome').eq('ativo', true).order('nome')
  
  // For the initial groups, load the user's company's groups
  const groups = await getGruposByEmpresa(user.empresa_id)

  const { count: cardsAsResponsavel } = await supabase
    .from('crm_cards')
    .select('id', { count: 'exact', head: true })
    .eq('responsavel_id', user.id)

  return (
    <div className="space-y-6">
      <EditForm 
        user={user} 
        companies={companies || []} 
        groups={groups || []}
        isSuperAdmin={isSuperAdmin}
        currentUserIsSuperuser={currentUserIsSuperuser}
        cardsAsResponsavel={cardsAsResponsavel ?? 0}
      />
    </div>
  )
}
