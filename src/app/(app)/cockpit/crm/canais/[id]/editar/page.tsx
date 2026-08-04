import Link from "next/link"
import { ArrowLeft, Target } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import ChannelEditor from "../../_editar/ChannelEditor"

export const metadata = { title: "Configurar Canal | HuginFlow CRM" }

export default async function EditarCanalPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()

  const { data: canal } = await supabase.from('crm_canais').select('*').eq('id', params.id).single()
  
  if (!canal) {
    notFound()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Link href="/cockpit/crm/canais" className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Target className="w-6 h-6 text-[#2BAADF]" />
            Configurações do Canal
          </h2>
          <p className="text-sm text-gray-400 mt-1">Configure APIs, Webhooks e integrações de {canal.nome}.</p>
        </div>
      </div>

      <ChannelEditor canal={canal} />
    </div>
  )
}
