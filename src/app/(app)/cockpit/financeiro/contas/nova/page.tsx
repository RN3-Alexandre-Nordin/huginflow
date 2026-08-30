import { Wallet } from "lucide-react"
import BackButton from '@/components/BackButton'
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { isRn3SuperAdmin } from "@/utils/permissions"
import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import NovaContaForm from "./NovaContaForm"

export const metadata = { title: "Nova Conta a Receber | HuginFlow" }

export default async function NovaContaPage() {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) redirect("/cockpit/acesso-negado")

  const isSuperAdmin = true
  const supabase = await createClient()
  const { data: empresas } = isSuperAdmin
    ? await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome")
    : { data: null }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/financeiro/contas" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Wallet className="w-6 h-6 text-[#E8A317]" />
            Nova conta a receber
          </h2>
          <p className="text-sm text-gray-400 mt-1">Lançamento manual via RPC segura.</p>
        </div>
      </div>

      <NovaContaForm
        empresas={empresas}
        isSuperAdmin={isSuperAdmin}
        defaultEmpresaId={me?.empresa_id ?? undefined}
      />
    </div>
  )
}
