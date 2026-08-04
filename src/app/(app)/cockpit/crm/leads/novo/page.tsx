import Link from "next/link"
import { ArrowLeft, Users } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import NewLeadForm from "./NewLeadForm"

export const metadata = { title: "Novo Lead | HuginFlow CRM" }

export default async function NovoLeadPage() {
  const supabase = await createClient()
  const { data: canais } = await supabase.from('crm_canais').select('id, nome').order('nome')

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/cockpit/crm/leads" className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-[#2BAADF]" />
            Adicionar Lead Manualmente
          </h2>
          <p className="text-sm text-gray-400 mt-1">Preencha os dados do prospect. Apenas o NOME é obrigatório.</p>
        </div>
      </div>

      <NewLeadForm canais={canais} />
    </div>
  )
}
