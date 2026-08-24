import { createClient } from "@/utils/supabase/server"
import Link from "next/link"
import { Users, Plus, Building2, Pencil, RotateCcw, ShieldCheck, Mail, Calendar, Lock } from "lucide-react"
import SearchFilters from "./SearchFilters"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"

export default async function UsuariosPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const me = await getMyProfile()

  if (!hasPermission(me, 'admin_usuarios', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Restrito</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para gerenciar a equipe.
        </p>
        <Link href="/cockpit" className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </Link>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'admin_usuarios', 'create')
  const canEdit = hasPermission(me, 'admin_usuarios', 'edit')

  const searchParams = await props.searchParams
  const query = typeof searchParams.q === 'string' ? searchParams.q : ""
  const empresaFilter = typeof searchParams.empresa === 'string' ? searchParams.empresa : "all"

  const supabase = await createClient()

  // Base query with joins
  let supabaseQuery = supabase
    .from("usuarios")
    .select("*, empresas(id, nome), grupos_acesso(id, nome)")
    .order("created_at", { ascending: false })

  // Security isolation
  if (me?.role_global !== 'superadmin') {
    supabaseQuery = supabaseQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  // Filtering
  if (query) {
    supabaseQuery = supabaseQuery.or(`nome_completo.ilike.%${query}%,email.ilike.%${query}%`)
  }

  if (me?.role_global === 'superadmin' && empresaFilter !== 'all') {
    supabaseQuery = supabaseQuery.eq('empresa_id', empresaFilter)
  }

  const { data: users, error } = await supabaseQuery

  const isSuperAdmin = me?.role_global === 'superadmin'

  const { data: companies } = isSuperAdmin 
    ? await supabase.from('empresas').select('id, nome').order('nome')
    : { data: [] }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-[#2BAADF]" />
            Usuários & Equipe
          </h2>
          <p className="text-sm text-gray-400 mt-1 font-medium">
            Gestão de perfis, permissões e acesso de equipe à <span className="text-[#80B828]">Hugin Flow</span>.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/cockpit/usuarios/novo"
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo Usuário
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
          Erro ao carregar usuários: {error.message}
        </div>
      )}

      {(!users || users.length === 0) ? (
        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-24 text-center space-y-4 shadow-xl">
          <div className="w-20 h-20 rounded-full bg-[#ffffff03] border border-[#ffffff05] flex items-center justify-center mx-auto mb-4">
            <Users className="w-10 h-10 text-gray-800 opacity-30" />
          </div>
          <div>
            <p className="text-white font-bold text-xl">{query ? 'Nenhum integrante localizado.' : 'Equipe Vazia.'}</p>
            <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto font-medium">
              {query || empresaFilter !== 'all' 
                ? "Tente ajustar seus filtros para encontrar o que procura." 
                : "Convide o primeiro membro da sua equipe para começar a operar."}
            </p>
          </div>
          {(query || (isSuperAdmin && empresaFilter !== 'all')) && (
            <Link 
              href="/cockpit/usuarios"
              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#2BAADF] hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar Filtros
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 hover:border-[#2BAADF]/30 transition-all group relative overflow-hidden shadow-lg border-l-2 border-l-transparent hover:border-l-[#2BAADF]"
            >
              <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-[#2BAADF]/5 blur-2xl group-hover:bg-[#2BAADF]/10 transition-all pointer-events-none" />
              
              <div className="flex gap-5">
                {/* Avatar / Role Icon */}
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-2xl bg-[#000000] border border-[#ffffff12] flex items-center justify-center text-2xl font-black text-[#2BAADF] group-hover:scale-105 transition-transform shadow-inner">
                    {user.nome_completo?.substring(0, 1).toUpperCase() || "?"}
                  </div>
                  <div className="absolute -bottom-1 -right-1 p-2 rounded-xl bg-[#111111] border border-[#ffffff10] shadow-2xl">
                    {user.role_global === 'superadmin' ? (
                      <span title="SuperAdmin"><ShieldCheck className="w-4 h-4 text-[#80B828]" /></span>
                    ) : user.role_global === 'admin' ? (
                      <span title="Admin"><ShieldCheck className="w-4 h-4 text-[#2BAADF]" /></span>
                    ) : (
                      <span title="Usuário"><Users className="w-4 h-4 text-gray-600" /></span>
                    )}
                  </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="font-bold text-white text-lg group-hover:text-[#2BAADF] transition-colors flex items-center gap-2 truncate pr-8">
                        {user.nome_completo || "Sem nome informado"}
                      </h3>
                      <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5 mt-0.5 truncate">
                        <Mail className="w-3.5 h-3.5" />
                        {user.email}
                      </p>
                    </div>
                    {canEdit && (
                      <Link
                        href={`/cockpit/usuarios/${user.id}/editar`}
                        className="p-2.5 rounded-xl bg-[#ffffff03] hover:bg-[#ffffff0a] text-gray-500 hover:text-white transition-all border border-[#ffffff0a] group-hover:border-[#ffffff20]"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-5">
                    <div className="bg-[#000000]/40 border border-[#ffffff05] rounded-xl p-3 shadow-inner">
                      <p className="text-[9px] uppercase tracking-widest text-gray-600 font-black mb-1.5">Cargo / Grupo</p>
                      <p className="text-xs text-gray-300 font-bold line-clamp-1">
                        {user.grupos_acesso?.nome || "Acesso Básico"}
                      </p>
                    </div>
                    {isSuperAdmin && (
                      <div className="bg-[#000000]/40 border border-[#ffffff05] rounded-xl p-3 shadow-inner">
                        <p className="text-[9px] uppercase tracking-widest text-gray-600 font-black mb-1.5">Organização</p>
                        <p className="text-xs text-white font-black line-clamp-1">
                          {user.empresas?.nome}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-4 border-t border-[#ffffff05] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {user.role_global === 'superadmin' && (
                        <span className="text-[9px] font-black uppercase text-[#80B828]/60 tracking-[0.2em] font-sans">HuginFlow Core</span>
                      )}
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-600 font-bold uppercase tracking-tighter">
                        <Calendar className="w-3.5 h-3.5 opacity-50" />
                        Desde {new Date(user.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <span className="text-[9px] font-black text-gray-800 tracking-widest">#{user.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
