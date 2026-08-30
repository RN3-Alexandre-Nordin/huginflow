import { FileText } from "lucide-react"
import BackButton from '@/components/BackButton'
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { isRn3SuperAdmin } from "@/utils/permissions"
import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import ContratoForm from "../ContratoForm"

export const metadata = { title: "Novo Contrato | HuginFlow" }

export default async function NovoContratoPage() {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) redirect("/cockpit/acesso-negado")

  const isSuperAdmin = true
  const supabase = await createClient()
  const { data: empresas } = isSuperAdmin
    ? await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome")
    : { data: null }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/financeiro/contratos" />
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-6 h-6 text-[#E8A317]" />
            Novo contrato comercial
          </h2>
          <p className="text-sm text-gray-400 mt-1">Vigência, setup, mensalidade e serviços extras.</p>
        </div>
      </div>

      <ContratoForm
        empresas={empresas}
        isSuperAdmin={isSuperAdmin}
        defaultEmpresaId={me?.empresa_id ?? undefined}
        submitLabel="Salvar contrato"
        cancelHref="/cockpit/financeiro/contratos"
      />
    </div>
  )
}
