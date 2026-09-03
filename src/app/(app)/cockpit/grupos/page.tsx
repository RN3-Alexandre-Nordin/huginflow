import { createClient } from "@/utils/supabase/server"
import Link from "next/link"
import BackTextButton from '@/components/BackTextButton'
import { ShieldCheck, Plus, Building2, Pencil, RotateCcw, Lock, ShieldAlert } from "lucide-react"
import SearchFilters from "./SearchFilters"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"

export default async function GruposAcessoPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const me = await getMyProfile()

  if (!hasPermission(me, 'admin_grupos', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700 font-sans">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Bloqueado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui autorização para gerenciar perfis de permissão.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'admin_grupos', 'create')
  const canEdit = hasPermission(me, 'admin_grupos', 'edit')

  const searchParams = await props.searchParams
  const query = typeof searchParams.q === 'string' ? searchParams.q : ""
  const empresaFilter = typeof searchParams.empresa === 'string' ? searchParams.empresa : "all"

  const supabase = await createClient()

  // Base query with join
  let supabaseQuery = supabase
    .from("grupos_acesso")
    .select("*, empresas(id, nome)")
    .order("created_at", { ascending: false })

  // Security isolation
  if (me?.role_global !== 'superadmin') {
    supabaseQuery = supabaseQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  if (query) {
    supabaseQuery = supabaseQuery.ilike('nome', `%${query}%`)
  }

  if (me?.role_global === 'superadmin' && empresaFilter !== 'all') {
    supabaseQuery = supabaseQuery.eq('empresa_id', empresaFilter)
  }

  const { data: groups, error } = await supabaseQuery

  const isSuperAdmin = me?.role_global === 'superadmin'

  const { data: companies } = isSuperAdmin 
    ? await supabase.from('empresas').select('id, nome').order('nome')
    : { data: [] }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-400 font-medium">
          Gerencie perfis de permissão personalizados para diferentes níveis de usuários.
        </p>
        {canCreate && (
          <Link
            href="/cockpit/grupos/novo"
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Grupo
          </Link>
        )}
      </div>

      {/* Bar de Busca e Filtros */}
      <SearchFilters 
        initialQuery={query} 
        initialEmpresa={empresaFilter} 
        companies={companies || []}
        showCompanyFilter={isSuperAdmin}
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 font-medium">
          Erro ao carregar grupos: {error.message}
        </div>
      )}

      {(!groups || groups.length === 0) ? (
        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-24 text-center space-y-4 shadow-xl">
          <div className="w-20 h-20 rounded-full bg-[#ffffff03] border border-[#ffffff05] flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-10 h-10 text-gray-800 opacity-30" />
          </div>
          <div>
            <p className="text-white font-bold text-xl">{query ? 'Nenhum grupo localizado.' : 'Nenhum Grupo de Acesso.'}</p>
            <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto font-medium">
              {query || empresaFilter !== 'all' 
                ? "Tente ajustar seus filtros para encontrar o que procura." 
                : "Defina seu primeiro grupo de permissões clicando no botão acima."}
            </p>
          </div>
          {(query || (isSuperAdmin && empresaFilter !== 'all')) && (
            <Link 
              href="/cockpit/grupos"
              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#2BAADF] hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar Filtros
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((group) => (
            <div
              key={group.id}
              className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 hover:border-[#2BAADF]/30 transition-all group relative overflow-hidden shadow-lg border-l-2 border-l-transparent hover:border-l-[#2BAADF]"
            >
              <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-[#2BAADF]/5 blur-2xl group-hover:bg-[#2BAADF]/10 transition-all pointer-events-none" />
              
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-[#2BAADF]/10 border border-[#2BAADF]/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-inner">
                    <ShieldCheck className="w-6 h-6 text-[#2BAADF]" />
                  </div>
                  {canEdit && (
                    <Link
                      href={`/cockpit/grupos/${group.id}/editar`}
                      className="p-2.5 rounded-xl bg-[#ffffff03] hover:bg-[#ffffff0a] text-gray-500 hover:text-white transition-all border border-[#ffffff0a] group-hover:border-[#ffffff20]"
                    >
                      <Pencil className="w-4.5 h-4.5" />
                    </Link>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-lg group-hover:text-[#2BAADF] transition-colors line-clamp-1">
                      {group.nome}
                    </h3>
                    {group.is_admin && (
                      <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest bg-red-500/10 text-red-500 px-2 py-0.5 rounded border border-red-500/20">
                        Admin
                      </span>
                    )}
                  </div>
                  {isSuperAdmin && (
                    <p className="text-[10px] text-[#2BAADF] uppercase tracking-wider font-black mt-2 inline-flex items-center gap-1.5 bg-[#2BAADF]/5 px-2 py-1 rounded-lg border border-[#2BAADF]/10">
                      <Building2 className="w-3 h-3 opacity-50" />
                      {group.empresas?.nome}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 mt-4 font-medium line-clamp-2 min-h-[2.5rem] leading-relaxed">
                    {group.descricao || "Sem descrição disponível."}
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-[#ffffff05] flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-600">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-[#2BAADF]/40" />
                    {Object.keys(group.permissoes || {}).length} Módulos
                  </div>
                  <span className="text-gray-800">#{group.id.slice(0, 8).toUpperCase()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

