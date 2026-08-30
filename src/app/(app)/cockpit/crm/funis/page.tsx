import { createClient } from "@/utils/supabase/server"
import Link from "next/link"
import { Search, Plus, Filter, RotateCcw, LayoutTemplate, Briefcase, EyeOff, ShieldCheck, PenSquare, Eye, Lock } from "lucide-react"
import BackButton from '@/components/BackButton'
import BackTextButton from '@/components/BackTextButton'
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"

export const metadata = { title: "Funis | HuginFlow CRM" }

export default async function FunisPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const me = await getMyProfile()

  if (!hasPermission(me, 'funis', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar os Funis de Vendas.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'funis', 'create')
  const canEdit = hasPermission(me, 'funis', 'edit')

  const searchParams = await props.searchParams
  const query = typeof searchParams.q === 'string' ? searchParams.q : ""

  const supabase = await createClient()

  let supabaseQuery = supabase
    .from("pipelines")
    .select(`
       id, 
       nome, 
       descricao, 
       is_public, 
       created_at,
       crm_cards (id),
       pipeline_stages (id)
    `)
    .order("created_at", { ascending: false })

  if (me?.role_global !== 'superadmin') {
    supabaseQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  if (query) {
    supabaseQuery = supabaseQuery.or(`nome.ilike.%${query}%,descricao.ilike.%${query}%`)
  }

  const { data: pipelines, error } = await supabaseQuery

  return (
    <div className="space-y-6 pb-20 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton fallbackHref="/cockpit" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <LayoutTemplate className="w-6 h-6 text-[#2BAADF]" />
              Funis (Kanban)
            </h2>
            <p className="text-sm text-gray-400 mt-1 font-medium">
              Gerencie e crie novos processos de vendas configurando suas etapas.
            </p>
          </div>
        </div>
        {canCreate && (
          <Link
            href="/cockpit/crm/funis/novo"
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo Funil
          </Link>
        )}
      </div>

      {/* Tabela de Pipelines / Board List */}
      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl">
        {/* Filtros Internos Simples */}
        <div className="p-4 border-b border-[#ffffff0a] flex items-center justify-between gap-4">
           <div className="relative w-full max-w-sm">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
               <Search className="h-4 w-4 text-gray-500" />
             </div>
             <form action="/cockpit/crm/funis" method="GET">
                <input
                  type="text"
                  name="q"
                  defaultValue={query}
                  placeholder="Buscar por nome do funil..."
                  className="block w-full pl-10 pr-3 py-2 border border-[#ffffff10] rounded-lg leading-5 bg-[#0A0A0A] text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#2BAADF] focus:ring-1 focus:ring-[#2BAADF] sm:text-sm transition-colors"
                />
             </form>
           </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-400 bg-red-500/10 font-medium">Erro ao carregar pipelines: {error.message}</div>
        )}

        {!pipelines?.length ? (
           <div className="p-24 text-center">
             <div className="w-20 h-20 rounded-full bg-[#ffffff03] border border-[#ffffff05] flex items-center justify-center mx-auto mb-6">
               <LayoutTemplate className="w-10 h-10 text-gray-800 opacity-20" />
             </div>
             <p className="text-white font-bold text-xl">{query ? 'Nenhum funil encontrado.' : 'Sua Organização não possui Funis.'}</p>
             <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto font-medium">
               {query ? 'Utilize outros termos para buscar seu processo comercial.' : 'Comece criando um funil de "Vendas Ativas" ou "Suporte" clicando no botão acima.'}
             </p>
             {query && (
               <Link href="/cockpit/crm/funis" className="text-[#2BAADF] hover:text-white text-sm font-bold mt-4 inline-block transition-colors uppercase tracking-widest">Limpar Busca</Link>
             )}
           </div>
        ) : (
           <div className="divide-y divide-[#ffffff05]">
              {pipelines.map(pipe => {
                 const totalCards = Array.isArray(pipe.crm_cards) ? pipe.crm_cards.length : 0
                 const totalStages = Array.isArray(pipe.pipeline_stages) ? pipe.pipeline_stages.length : 0

                 return (
                    <div key={pipe.id} className="p-6 flex items-center justify-between hover:bg-[#ffffff02] transition-all group border-l-2 border-transparent hover:border-[#2BAADF]">
                       <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-3">
                             <h3 className="text-base font-bold text-white truncate group-hover:text-[#2BAADF] transition-colors">{pipe.nome}</h3>
                             {pipe.is_public ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-green-500/10 text-green-400 border border-green-500/20">
                                   Público
                                </span>
                             ) : (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-[#2BAADF]/10 text-[#2BAADF] border border-[#2BAADF]/20 font-sans">
                                   Restrito
                                </span>
                             )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1 line-clamp-1 font-medium">{pipe.descricao || "Funil sem descrição detalhada."}</p>
                          
                          <div className="mt-3 flex items-center gap-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                             <span className="flex items-center gap-1.5"><RotateCcw className="w-3 h-3 text-[#2BAADF]/50" /> {totalStages} Etapa(s)</span>
                             <span className="opacity-30">|</span>
                             <span className="flex items-center gap-1.5"><Briefcase className="w-3 h-3 text-orange-500/50" /> {totalCards} Card(s) Ativos</span>
                          </div>
                       </div>
                       
                       <div className="flex items-center justify-end gap-3 shrink-0 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                          {canEdit && (
                            <Link 
                              href={`/cockpit/crm/funis/${pipe.id}/editar`}
                              className="p-2.5 text-gray-500 hover:text-white hover:bg-[#ffffff05] rounded-xl transition-all border border-transparent hover:border-[#ffffff10]"
                              title="Configurar Fluxo"
                            >
                               <PenSquare className="w-4.5 h-4.5" />
                            </Link>
                          )}
                          
                          <Link 
                            href={`/cockpit/crm/funis/${pipe.id}`}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-[#ffffff05] text-white border border-[#ffffff10] hover:bg-white hover:text-black transition-all shadow-xl"
                          >
                             Abrir Kanban
                          </Link>
                       </div>
                    </div>
                 )
              })}
           </div>
        )}
      </div>
    </div>
  )
}

