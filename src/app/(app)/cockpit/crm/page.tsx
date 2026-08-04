export const metadata = { title: "CRM Hub | HuginFlow CRM" }
import Link from 'next/link'
import { LayoutTemplate, Inbox, Share2, LineChart, MoveRight } from 'lucide-react'

export default function CrmHubPage() {
  const modules = [
    {
       id: 'funis',
       name: 'Funis',
       description: 'Gerencie pipelines, ordene colunas e movimente cards num painel Kanban altamente visual.',
       icon: LayoutTemplate,
       href: '/cockpit/crm/funis',
       color: '#2BAADF',
       features: ['Múltiplos Pipelines', 'Cards Kanbans', 'Controle Acesso'],
       active: true
    },
    {
       id: 'leads',
       name: 'Caixa de Leads',
       description: 'Acesse conversas, converta chamadas em oportunidades e nutra o seu funil de clientes qualificados.',
       icon: Inbox,
       href: '/cockpit/crm/leads',
       color: '#80B828',
       features: ['Inbox Unificado', 'Histórico Vendas', 'WhatsApp'],
       active: true
    },
    {
       id: 'canais',
       name: 'Canais e Origens',
       description: 'Configure Landing Pages, integrações e de onde os seus contatos estão sendo importados.',
       icon: Share2,
       href: '/cockpit/crm/canais',
       color: '#9333EA',
       features: ['Webhooks', 'Instagram', 'Indicações'],
       active: true
    },
    {
       id: 'relatorios',
       name: 'Relatórios & Analytics',
       description: 'Monitore as taxas de conversão de estágios, os gargalos de vendas e a meta de faturamento.',
       icon: LineChart,
       href: '/cockpit/crm/relatorios',
       color: '#F97316',
       features: ['Taxa de Conversão', 'Previsão Fatura', 'Velocidade Média'],
       active: false
    }
  ]

  return (
    <div className="space-y-8 pb-20 max-w-7xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
             <div className="p-2 bg-[#ffffff10] rounded-xl border border-[#ffffff20]">
                <LayoutTemplate className="w-6 h-6 text-[#2BAADF]" />
             </div>
             CRM Workspace
          </h1>
          <p className="text-gray-400 mt-2 text-lg">
            A central de inteligência para suas vendas, contatos e conversões.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {modules.map(mod => (
            <Link 
              key={mod.id} 
              href={mod.active ? mod.href : '#'}
              className={`relative overflow-hidden group border rounded-3xl p-8 transition-all duration-500 hover:-translate-y-1 block ${
                 mod.active 
                    ? 'bg-[#111111]/80 border-[#ffffff10] hover:border-[#2BAADF]/50 shadow-2xl hover:shadow-[#2BAADF]/10 cursor-pointer' 
                    : 'bg-[#111111]/40 border-[#ffffff05] opacity-60 cursor-not-allowed grayscale-[30%]'
              }`}
            >
               {/* Ambient Glow */}
               <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full blur-[100px] opacity-20 pointer-events-none transition-all duration-700 group-hover:scale-150 group-hover:opacity-40" 
                    style={{ background: mod.color }} />

               {/* Badge Em Construção */}
               {!mod.active && (
                  <div className="absolute top-6 right-6">
                     <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full">Em Breve</span>
                  </div>
               )}

               {/* Content */}
               <div className="relative z-10 flex flex-col h-full justify-between">
                  <div>
                     <div 
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-inner"
                        style={{ backgroundColor: `${mod.color}15`, border: `1px solid ${mod.color}30` }}
                     >
                        <mod.icon className="w-7 h-7" style={{ color: mod.color }} />
                     </div>
                     <h2 className="text-2xl font-bold text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text transition-all"
                         style={{ backgroundImage: `linear-gradient(to right, white, ${mod.color})` }}>
                        {mod.name}
                     </h2>
                     <p className="text-gray-400 leading-relaxed mb-8 max-w-sm">
                        {mod.description}
                     </p>
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                     <div className="flex items-center gap-2 flex-wrap">
                        {mod.features.map(f => (
                           <span key={f} className="text-[11px] font-medium text-gray-500 bg-[#ffffff05] border border-[#ffffff10] px-3 py-1.5 rounded-lg">
                              {f}
                           </span>
                        ))}
                     </div>
                     
                     {mod.active && (
                        <div className="w-10 h-10 rounded-full bg-[#ffffff05] group-hover:bg-white flex items-center justify-center transition-colors shrink-0">
                           <MoveRight className="w-5 h-5 text-gray-500 group-hover:text-black transition-colors" />
                        </div>
                     )}
                  </div>
               </div>
            </Link>
         ))}
      </div>
    </div>
  )
}
