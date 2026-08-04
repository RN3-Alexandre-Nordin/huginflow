import { createClient } from "@/utils/supabase/server"
import Link from "next/link"
import { Search, Plus, Target, ArrowLeft, MoreHorizontal, Edit, Trash2, Lock } from "lucide-react"
import { deleteCanal } from "./actions"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"

export const metadata = { title: "Canais de Aquisição | HuginFlow CRM" }

export default async function CanaisPage() {
  const me = await getMyProfile()
  
  if (!hasPermission(me, 'canais', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar os Canais de Aquisição.
        </p>
        <Link href="/cockpit" className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </Link>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'canais', 'create')
  const canEdit = hasPermission(me, 'canais', 'edit')
  const canDelete = hasPermission(me, 'canais', 'delete')

  const supabase = await createClient()
  const query = supabase
    .from("crm_canais")
    .select(`*`)
    .order("created_at", { ascending: false })

  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { data: canais } = await query

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/cockpit/crm" className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <Target className="w-6 h-6 text-[#2BAADF]" />
              Canais de Aquisição
            </h2>
            <p className="text-sm text-gray-400 mt-1">Configure suas UTMs, Parcerias e fontes de tráfego.</p>
          </div>
        </div>
        {canCreate && (
          <Link href="/cockpit/crm/canais/novo" className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] transition-all text-white px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Canal
          </Link>
        )}
      </div>

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl">
        {canais?.length === 0 ? (
          <div className="py-24 text-center">
             <Target className="w-16 h-16 text-gray-700 mx-auto mb-6 opacity-20" />
             <p className="text-white font-bold text-xl">Nenhum canal rastreado.</p>
             <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto font-medium">
               Crie canais como "Instagram ADS", "Indicação" ou "Site" para medir de onde vêm seus leads.
             </p>
             {canCreate && (
               <Link href="/cockpit/crm/canais/novo" className="mt-8 inline-flex items-center gap-2 text-[#2BAADF] hover:text-white font-semibold transition-colors">
                 Crie seu primeiro canal agora <Plus className="w-4 h-4" />
               </Link>
             )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#ffffff02] border-b border-[#ffffff0a] text-gray-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-5">Nome do Canal</th>
                  <th className="px-6 py-5">Tipo Categoria</th>
                  <th className="px-6 py-5">Criado em</th>
                  <th className="px-6 py-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff0a]">
                {canais?.map((canal) => (
                  <tr key={canal.id} className="hover:bg-[#ffffff03] transition-all group border-l-2 border-transparent hover:border-[#2BAADF]">
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="font-bold text-white flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#2BAADF] shadow-[0_0_8px_rgba(43,170,223,0.5)]" />
                        {canal.nome}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                       <span className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest bg-[#ffffff05] text-[#2BAADF] border border-[#2BAADF]/20 rounded-md">
                         {canal.tipo || 'Outros'}
                       </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-gray-500 font-mono text-xs">
                      {new Date(canal.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                        {canEdit && (
                          <Link 
                            href={`/cockpit/crm/canais/${canal.id}/editar`}
                            className="p-2.5 text-gray-400 hover:text-white bg-[#ffffff05] hover:bg-[#ffffff10] rounded-xl transition-all border border-transparent hover:border-[#ffffff10]"
                          >
                            <Edit className="w-4.5 h-4.5" />
                          </Link>
                        )}
                        {canDelete && (
                          <form action={deleteCanal}>
                            <input type="hidden" name="id" value={canal.id} />
                            <button 
                              type="submit"
                              title="Excluir Permanentemente"
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

