import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

import ManagerDashboard from "./_components/ManagerDashboard"
import OperatorDashboard from "./_components/OperatorDashboard"
import EstoqueOperatorDashboard from "./_components/EstoqueOperatorDashboard"
import SuperAdminDashboard from "./_components/SuperAdminDashboard"
import PlatformEmptyState from "./_components/PlatformEmptyState"
import { getEmpresaAddons } from "@/lib/addons/entitlements"
import {
  empresaHasOperationalHome,
  parseCockpitTemplate,
  resolveCockpitTemplate,
} from "@/lib/cockpit/templates"
import type { PermissionData } from "@/utils/permissions"

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("usuarios")
    .select("id, role_global, nome_completo, empresa_id, empresas(nome), grupos_acesso(is_admin, permissoes, cockpit_template)")
    .eq("auth_user_id", user.id)
    .single()

  if (!profile) {
    return (
      <div className="p-8 text-white">
        <h2>Perfil não econtrado no banco de dados. Contate o suporte.</h2>
      </div>
    )
  }

  const role = profile.role_global
  const firstName = profile.nome_completo?.split(" ")[0] || "Equipe"
  const userId = profile.id || ""

  const addons = profile.empresa_id
    ? await getEmpresaAddons(profile.empresa_id)
    : null

  if (role !== "superadmin" && profile.empresa_id) {
    if (!empresaHasOperationalHome(addons)) {
      const empresaRel = profile.empresas as { nome?: string } | { nome?: string }[] | null
      const empresaNome = Array.isArray(empresaRel)
        ? empresaRel[0]?.nome
        : empresaRel?.nome
      return <PlatformEmptyState empresaNome={empresaNome} />
    }
  }

  if (role === "superadmin") {
    return <SuperAdminDashboard userName={firstName} userId={userId} />
  }

  if (role === "admin") {
    return <ManagerDashboard userName={firstName} userId={userId} />
  }

  const grupo = profile.grupos_acesso as
    | { is_admin?: boolean; permissoes?: unknown; cockpit_template?: string }
    | { is_admin?: boolean; permissoes?: unknown; cockpit_template?: string }[]
    | null

  const grupoRow = Array.isArray(grupo) ? grupo[0] : grupo
  const preferred = parseCockpitTemplate(grupoRow?.cockpit_template)

  const permissionUser: PermissionData = {
    role_global: profile.role_global,
    grupos_acesso: grupoRow
      ? {
          is_admin: grupoRow.is_admin ?? null,
          permissoes: grupoRow.permissoes,
        }
      : null,
  }

  const template = resolveCockpitTemplate({
    preferred,
    addons,
    user: permissionUser,
  })

  if (template === "operador_estoque") {
    return <EstoqueOperatorDashboard userName={firstName} userId={userId} />
  }

  return <OperatorDashboard userName={firstName} userId={userId} />
}
