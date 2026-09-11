import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

import ManagerDashboard from "./_components/ManagerDashboard"
import OperatorDashboard from "./_components/OperatorDashboard"
import SuperAdminDashboard from "./_components/SuperAdminDashboard"

export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Get Authentication Session
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  // 2. Fetch User Profile & Role from DB
  const { data: profile } = await supabase
    .from("usuarios")
    .select("id, role_global, nome_completo")
    .eq("auth_user_id", user.id)
    .single()

  if (!profile) {
    // Falha grave: usuário autenticado mas sem perfil criado. 
    // Em teoria, triggers ou a action 'createUsuario' já lidaram com isso.
    return (
      <div className="p-8 text-white">
        <h2>Perfil não econtrado no banco de dados. Contate o suporte.</h2>
      </div>
    )
  }

  const role = profile.role_global
  const firstName = profile.nome_completo?.split(" ")[0] || "Equipe"
  const userId = profile.id || ""

  // 3. Server-Side Rendering Switcher Based on Role
  switch (role) {
    case "superadmin":
      return <SuperAdminDashboard userName={firstName} userId={userId} />
    
    case "admin":
      return <ManagerDashboard userName={firstName} userId={userId} />

    case "operador":
    case "visualizador":
    default:
      // Operadores e Visualizadores veem o cockpit operacional por padrão.
      return <OperatorDashboard userName={firstName} userId={userId} />
  }
}
