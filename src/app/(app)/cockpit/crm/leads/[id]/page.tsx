import Link from "next/link"
import { ArrowLeft, User, Calendar, Mail, Phone, MapPin, Tag, Edit2 } from "lucide-react"
import BackButton from '@/components/BackButton'
import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"

export const metadata = { title: "Perfil do Lead | HuginFlow CRM" }

export default async function LeadProfilePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()

  const me = await import('@/app/(app)/cockpit/actions').then(m => m.getMyProfile())
  
  let query = supabase
    .from('crm_leads')
    .select(`
       *,
       crm_cards (
         id,
         titulo,
         created_at,
         pipelines (nome),
         pipeline_stages (nome)
       )
    `)
    .eq('id', params.id)
  
  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { data: lead } = await query.single()
  
  if (!lead) {
    notFound()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton
            fallbackHref="/cockpit/crm/leads"
            className="p-2 rounded-xl bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-all border border-[#ffffff05]"
          />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <User className="w-6 h-6 text-[#80B828]" />
              {lead.nome || "Lead sem nome"}
            </h2>
            <p className="text-sm text-gray-400 mt-1">Visão geral e histórico do contato no CRM.</p>
          </div>
        </div>
        
        <Link 
          href={`/cockpit/crm/leads/${params.id}/editar`}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#80B828] hover:bg-[#6a9a20] text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-[#80B828]/20"
        >
          <Edit2 className="w-4 h-4" />
          Editar Perfil
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Dados (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#111111] border border-[#ffffff0a] rounded-3xl p-8 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5">
                <User className="w-32 h-32 text-white" />
             </div>
             
             <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                Informações de Contato
             </h3>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-1">
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">E-mail Principal</p>
                   <div className="flex items-center gap-3 text-gray-300">
                      <Mail className="w-4 h-4 text-[#80B828]" />
                      <span className="font-medium">{lead.email || "Não informado"}</span>
                   </div>
                </div>
                
                <div className="space-y-1">
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Telefone / WhatsApp</p>
                   <div className="flex items-center gap-3 text-gray-300">
                      <Phone className="w-4 h-4 text-[#80B828]" />
                      <span className="font-medium">{lead.telefone || "Não informado"}</span>
                   </div>
                </div>

                <div className="space-y-1">
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Localização</p>
                   <div className="flex items-center gap-3 text-gray-300">
                      <MapPin className="w-4 h-4 text-orange-500" />
                      <span className="font-medium">{lead.cidade || "N/A"} - {lead.estado || "N/A"}</span>
                   </div>
                </div>

                <div className="space-y-1">
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Cadastro em</p>
                   <div className="flex items-center gap-3 text-gray-300">
                      <Calendar className="w-4 h-4 text-indigo-400" />
                      <span className="font-medium">{new Date(lead.created_at).toLocaleDateString('pt-BR')}</span>
                   </div>
                </div>
             </div>
          </div>

          {/* Cards Vinculados */}
          <div className="bg-[#111111] border border-[#ffffff0a] rounded-3xl p-8 shadow-2xl">
             <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                Oportunidades Ativas
             </h3>
             
             {lead.crm_cards?.length > 0 ? (
                <div className="space-y-4">
                   {lead.crm_cards.map((card: any) => (
                      <div key={card.id} className="p-4 rounded-2xl bg-[#ffffff03] border border-[#ffffff05] hover:bg-[#ffffff08] transition-all flex items-center justify-between group">
                         <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                               {card.pipelines?.nome} <span className="mx-1 text-gray-700">›</span> {card.pipeline_stages?.nome}
                            </p>
                            <h4 className="text-sm font-bold text-white mt-1 group-hover:text-[#80B828] transition-colors">{card.titulo}</h4>
                         </div>
                         <Link href={`/cockpit/crm/funis/${card.pipeline_id}?cardId=${card.id}`} className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#80B828] text-gray-400 hover:text-white transition-all">
                            <ArrowLeft className="w-4 h-4 rotate-180" />
                         </Link>
                      </div>
                   ))}
                </div>
             ) : (
                <div className="text-center py-10 opacity-30">
                   <p className="text-sm text-gray-400">Nenhum card vinculado a este lead.</p>
                </div>
             )}
          </div>
        </div>

        {/* Sidebar Mini (1/3) */}
        <div className="space-y-6">
           <div className="bg-gradient-to-br from-[#80B828]/20 to-[#111111] border border-[#80B828]/30 rounded-3xl p-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-[#80B828] mb-4">Status do Lead</h4>
              <div className="flex items-center gap-3">
                 <div className="w-3 h-3 rounded-full bg-[#80B828] animate-pulse" />
                 <span className="text-xl font-black text-white">Qualificado</span>
              </div>
              <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                 Este lead está ativo em sua base e possui interações recentes nos canais de atendimento.
              </p>
           </div>

           <div className="bg-[#111111] border border-[#ffffff0a] rounded-3xl p-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
                 <Tag className="w-3 h-3" />
                 Tags e Segmentos
              </h4>
              <div className="flex flex-wrap gap-2">
                 <span className="px-2 py-1 bg-[#ffffff05] rounded text-[10px] font-bold text-gray-400 border border-[#ffffff10]">Vip</span>
                 <span className="px-2 py-1 bg-[#ffffff05] rounded text-[10px] font-bold text-gray-400 border border-[#ffffff10]">Inbound</span>
                 <span className="px-2 py-1 bg-[#ffffff05] rounded text-[10px] font-bold text-gray-400 border border-[#ffffff10]">Tech</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  )
}
