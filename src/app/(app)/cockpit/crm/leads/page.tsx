import { createClient } from "@/utils/supabase/server"
import Link from "next/link"
import { Search, Plus, Users, MoreHorizontal, Edit, Trash2, Lock } from "lucide-react"
import BackTextButton from '@/components/BackTextButton'
import { deleteLead } from "./actions"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"

export const metadata = { title: "Gestão de Leads | HuginFlow CRM" }

export default async function LeadsPage(props: { searchParams: Promise<{ q?: string }> }) {
  const me = await getMyProfile()
  
  if (!hasPermission(me, 'leads', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para acessar a Base de Leads.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'leads', 'create')
  const canEdit = hasPermission(me, 'leads', 'edit')
  const canDelete = hasPermission(me, 'leads', 'delete')

  const searchParams = await props.searchParams
  const q = searchParams.q || ""
  const supabase = await createClient()

  let query = supabase
    .from("crm_leads")
    .select(`*, crm_canais(nome)`)
    .order("created_at", { ascending: false })

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  if (q) {
    query = query.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%,whatsapp.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data: leads } = await query

  return (
    <div className="space-y-6 pb-20 font-sans">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-400 font-medium">Gerencie, pesquise e enriqueça os contatos do funil.</p>
        {canCreate && (
          <Link href="/cockpit/crm/leads/novo" className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-all shrink-0">
            <Plus className="w-4 h-4" /> Novo Lead
          </Link>
        )}
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-4 flex gap-4 items-center shadow-lg">
         <form className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
               type="text"
               name="q"
               defaultValue={q}
               placeholder="Buscar por nome, e-mail ou telefone..."
               className="w-full bg-[#0A0A0A] border border-[#ffffff10] text-sm text-white rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-[#2BAADF] transition-colors"
            />
         </form>
         {q && (
            <Link href="/cockpit/crm/leads" className="text-xs text-[#2BAADF] hover:text-white transition-colors uppercase font-bold tracking-wider">Limpar FIltragem</Link>
         )}
      </div>

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl">
         {leads?.length === 0 ? (
            <div className="py-24 text-center">
               <Users className="w-16 h-16 text-gray-700 mx-auto mb-6 opacity-20" />
               <p className="text-white font-bold text-xl">{q ? 'Nenhum lead encontrado com esse termo.' : 'Sua base de Leads está vazia.'}</p>
               <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto font-medium">
                 {q ? 'Tente utilizar termos mais genéricos para sua busca.' : 'Acrescente leads manualmente ou via integração para iniciar a gestão.'}
               </p>
               {canCreate && !q && (
                 <Link href="/cockpit/crm/leads/novo" className="mt-8 inline-flex items-center gap-2 text-[#2BAADF] hover:text-white font-semibold transition-colors">
                   Crie seu primeiro lead agora <Plus className="w-4 h-4" />
                 </Link>
               )}
            </div>
         ) : (
            <div className="overflow-x-auto min-h-[400px]">
               <table className="w-full text-left text-sm text-gray-300">
                  <thead className="bg-[#ffffff02] border-b border-[#ffffff0a] text-gray-500 uppercase text-[10px] tracking-widest font-bold">
                     <tr>
                        <th className="px-6 py-5">Nome & Contato Base</th>
                        <th className="px-6 py-5">Empresa / Cargo</th>
                        <th className="px-6 py-5">Canal de Origem</th>
                        <th className="px-6 py-5">Data Inclusão</th>
                        <th className="px-6 py-5 text-right">Manutenção</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ffffff0a]">
                     {leads?.map((lead) => (
                        <tr key={lead.id} className="hover:bg-[#ffffff03] transition-all group border-l-2 border-transparent hover:border-[#2BAADF]">
                           <td className="px-6 py-5 whitespace-nowrap">
                              <div className="font-bold text-white text-[15px] group-hover:text-[#2BAADF] transition-colors">{lead.nome}</div>
                              <div className="text-[11px] text-gray-500 flex gap-3 mt-1 font-medium">
                                 {lead.whatsapp && <span className="flex items-center gap-1.5"><b className="text-[#2BAADF] opacity-70">WHATS:</b> {lead.whatsapp}</span>}
                                 {lead.email && <span className="flex items-center gap-1.5"><b className="text-gray-500 opacity-70">EMAIL:</b> {lead.email}</span>}
                              </div>
                           </td>
                           <td className="px-6 py-5 whitespace-nowrap text-xs">
                              <p className="text-gray-200 font-semibold">{lead.empresa_cliente || '-'}</p>
                              <p className="text-gray-500 font-medium">{lead.cargo || '-'}</p>
                           </td>
                           <td className="px-6 py-5 whitespace-nowrap text-xs">
                              {lead.crm_canais?.nome ? (
                                  <span className="px-3 py-1 text-[9px] font-extrabold uppercase tracking-widest bg-[#2BAADF]/10 text-[#2BAADF] border border-[#2BAADF]/20 rounded-md">
                                    {lead.crm_canais.nome}
                                  </span>
                              ) : (
                                  <span className="text-xs text-gray-600 italic font-medium opacity-50">Direto / Orgânico</span>
                              )}
                           </td>
                           <td className="px-6 py-5 whitespace-nowrap text-gray-500 font-mono text-xs">
                              {new Date(lead.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                           </td>
                           <td className="px-6 py-5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                                {canEdit && (
                                  <Link 
                                    href={`/cockpit/crm/leads/${lead.id}/editar`}
                                    className="p-2.5 text-gray-400 hover:text-white bg-[#ffffff05] hover:bg-[#ffffff10] rounded-xl transition-all border border-transparent hover:border-[#ffffff10]"
                                    title="Editar Lead"
                                  >
                                    <Edit className="w-4.5 h-4.5" />
                                  </Link>
                                )}
                                {canDelete && (
                                  <form action={deleteLead}>
                                    <input type="hidden" name="id" value={lead.id} />
                                    <button 
                                      type="submit"
                                      title="Excluir Lead"
                                      className="p-2.5 text-red-500/60 hover:text-red-400 bg-red-400/5 hover:bg-red-400/10 rounded-xl transition-all border border-transparent hover:border-red-400/20"
                                    >
                                      <Trash2 className="w-4.5 h-4.5" />
                                    </button>
                                  </form>
                                )}
                              </div>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         )}
      </div>
    </div>
  )
}

