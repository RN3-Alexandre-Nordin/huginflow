import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import { getEmpresaAddons } from "@/lib/addons/entitlements"
import EditForm from "./EditForm"

export default async function EditarGrupoPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()

  // Fetch group with company info
  const { data: group } = await supabase
    .from("grupos_acesso")
    .select("*, empresas(id, nome)")
    .eq("id", params.id)
    .single()

  if (!group) {
    notFound()
  }

  // Get current user role — filter by auth_user_id to avoid .single() failing for superadmins
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: userData } = await supabase
    .from('usuarios')
    .select('role_global')
    .eq('auth_user_id', authUser?.id ?? '')
    .single()
  const isSuperAdmin = userData?.role_global === 'superadmin'

  const { data: companies } = await supabase
    .from('empresas')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')

  const empresaAddons = group.empresa_id
    ? await getEmpresaAddons(group.empresa_id, supabase)
    : null

  return (
    <div className="space-y-6">
      <EditForm
        group={group}
        companies={companies || []}
        isSuperAdmin={isSuperAdmin}
        initialEmpresaAddons={empresaAddons}
      />
    </div>
  )
}
