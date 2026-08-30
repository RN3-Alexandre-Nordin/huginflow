import { Users } from "lucide-react"
import BackButton from '@/components/BackButton'
import { createClient } from "@/utils/supabase/server"
import NewLeadForm from "./NewLeadForm"

export const metadata = { title: "Novo Lead | HuginFlow CRM" }

export default async function NovoLeadPage() {
  const supabase = await createClient()
  const { data: canais } = await supabase.from('crm_canais').select('id, nome').order('nome')

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/crm/leads" />
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
