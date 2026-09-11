import { Users } from "lucide-react"
import BackButton from '@/components/BackButton'
import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import EditLeadForm from "./EditLeadForm"

export const metadata = { title: "Editar Lead | HuginFlow CRM" }

export default async function EditarLeadPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  
  const me = await import('@/app/(app)/cockpit/actions').then(m => m.getMyProfile())
  
  const { data: canais } = await supabase.from('crm_canais').select('id, nome').order('nome')
  
  let query = supabase.from('crm_leads').select('*').eq('id', params.id)
  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }
  const { data: lead } = await query.single()

  if (!lead) notFound()

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/crm/leads" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-[#2BAADF]" />
            Editando Cadastro do Lead
          </h2>
          <p className="text-sm text-gray-400 mt-1 font-medium">Alterando informações de {lead.nome}.</p>
        </div>
      </div>

      <EditLeadForm lead={lead} canais={canais} />
    </div>
  )
}
