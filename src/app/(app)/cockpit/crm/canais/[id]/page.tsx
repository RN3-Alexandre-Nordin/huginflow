import Link from "next/link"
import { Target, Settings, Database, Code, Globe, ShieldCheck, Edit2 } from "lucide-react"
import BackButton from '@/components/BackButton'
import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"

export const metadata = { title: "Visão Geral do Canal | HuginFlow CRM" }

export default async function ChannelDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()

  const { data: canal } = await supabase
    .from('crm_canais')
    .select('*')
    .eq('id', params.id)
    .single()
  
  if (!canal) {
    notFound()
  }

  const sections = [
    { id: 'settings', label: 'Básico', icon: Settings, desc: 'Nome, descrição e tipo do canal.' },
    { id: 'database', label: 'Dados', icon: Database, desc: 'Campos customizados e mapeamento.' },
    { id: 'code', label: 'API/Webhooks', icon: Code, desc: 'Integrações e endpoints ativos.' },
    { id: 'globe', label: 'Páginas', icon: Globe, desc: 'URL de captura e redirecionamentos.' },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton
            fallbackHref="/cockpit/crm/canais"
            className="p-2 rounded-xl bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-all border border-[#ffffff05]"
          />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <div className="p-2 bg-[#2BAADF10] rounded-xl border border-[#2BAADF20]">
                <Target className="w-6 h-6 text-[#2BAADF]" />
              </div>
              {canal.nome}
            </h2>
            <p className="text-sm text-gray-400 mt-1 font-medium">Configurações de fluxo e origens de captação.</p>
          </div>
        </div>
        
        <Link 
          href={`/cockpit/crm/canais/${params.id}/editar`}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#2BAADF] hover:bg-[#1A8FBF] text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-[#2BAADF]/20"
        >
          <Edit2 className="w-4 h-4" />
          Configurar Canal
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card Principal */}
        <div className="lg:col-span-2 bg-[#111111] border border-[#ffffff0a] rounded-3xl p-8 shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-12 opacity-[0.03]">
              <Target className="w-64 h-64 text-white" />
           </div>

           <div className="relative z-10">
              <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-widest text-[10px] opacity-40">Resumo da Configuração</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                 <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#2BAADF]">Estado Atual</p>
                    <div className="flex items-center gap-3">
                       <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                       <span className="text-xl font-bold text-white">Ativo e Escaneando</span>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#2BAADF]">Origem da Lead</p>
                    <div className="flex items-center gap-3 text-white font-bold">
                       <Globe className="w-4 h-4 text-gray-500" />
                       {canal.slug || "Automática"}
                    </div>
                 </div>
              </div>

              <div className="mt-12 space-y-4">
                 <p className="text-[10px] font-black uppercase tracking-widest text-[#2BAADF]">Componentes do Canal</p>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sections.map(s => (
                       <div key={s.id} className="p-4 rounded-2xl bg-[#ffffff03] border border-[#ffffff05] hover:bg-[#ffffff08] transition-all flex items-start gap-4 group">
                          <div className="w-10 h-10 rounded-xl bg-[#ffffff05] flex items-center justify-center text-gray-500 group-hover:text-white transition-colors">
                             <s.icon className="w-5 h-5" />
                          </div>
                          <div>
                             <h4 className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">{s.label}</h4>
                             <p className="text-[11px] text-gray-500 line-clamp-1">{s.desc}</p>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>

        {/* Sidebar Mini */}
        <div className="space-y-6">
           <div className="bg-[#111111] border border-[#ffffff0a] rounded-3xl p-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-6 flex items-center gap-2">
                 <ShieldCheck className="w-4 h-4 text-[#2BAADF]" />
                 Segurança e Compliance
              </h4>
              <div className="space-y-4">
                 <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Criptografia SSL</span>
                    <span className="text-green-500 font-bold uppercase tracking-tight text-[10px]">Ativa</span>
                 </div>
                 <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Proteção Anti-Spam</span>
                    <span className="text-green-500 font-bold uppercase tracking-tight text-[10px]">Ativa</span>
                 </div>
                 <div className="flex items-center justify-between text-xs">
                   <span className="text-gray-500">Status Gateway</span>
                   <span className="text-[#2BAADF] font-bold uppercase tracking-tight text-[10px]">Conectado</span>
                </div>
              </div>
           </div>

           <div className="p-6 bg-[#2BAADF]/10 border border-[#2BAADF]/20 rounded-3xl">
              <p className="text-xs text-[#2BAADF] font-bold leading-relaxed">
                 Este canal está processando eventos via Webhook. Qualquer alteração nos endpoints de destino pode afetar a recepção de novos leads.
              </p>
           </div>
        </div>
      </div>
    </div>
  )
}
