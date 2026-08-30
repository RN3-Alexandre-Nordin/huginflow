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
  const statusFilter =
    typeof searchParams.status === 'string' && ['ativos', 'inativos', 'todos'].includes(searchParams.status)
      ? searchParams.status
      : 'ativos'

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

  if (statusFilter === 'ativos') {
    supabaseQuery = supabaseQuery.eq('ativo', true)
  } else if (statusFilter === 'inativos') {
    supabaseQuery = supabaseQuery.eq('ativo', false)
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
        initialStatus={statusFilter}
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
            <p className="text-white font-bold text-xl">{query || statusFilter !== 'ativos' ? 'Nenhum integrante localizado.' : 'Equipe Vazia.'}</p>
            <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto font-medium">
              {query || empresaFilter !== 'all' || statusFilter !== 'ativos'
                ? "Tente ajustar seus filtros para encontrar o que procura." 
                : "Convide o primeiro membro da sua equipe para começar a operar."}
            </p>
          </div>
          {(query || (isSuperAdmin && empresaFilter !== 'all') || statusFilter !== 'ativos') && (
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
        <div className="rounded-xl border border-[#ffffff0a] bg-[#111111] overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_auto_auto_auto] gap-3 px-4 py-2.5 border-b border-[#ffffff08] text-[10px] font-black uppercase tracking-widest text-gray-600">
            <span>Usuário</span>
            <span>Grupo</span>
            <span>Status</span>
            <span className="text-right">Desde</span>
            <span className="w-9" />
          </div>
          <ul className="divide-y divide-[#ffffff06]">
            {users.map((user) => {
              const initial = user.nome_completo?.substring(0, 1).toUpperCase() || "?"
              const isAtivo = user.ativo !== false
              const roleTitle =
                user.role_global === "superadmin"
                  ? "SuperAdmin"
                  : user.role_global === "admin"
                    ? "Admin"
                    : user.role_global === "visualizador"
                      ? "Visualizador"
                      : "Operador"
              const RoleIcon =
                user.role_global === "superadmin" || user.role_global === "admin"
                  ? ShieldCheck
                  : Users
              const roleColor =
                user.role_global === "superadmin"
                  ? "text-[#80B828]"
                  : user.role_global === "admin"
                    ? "text-[#2BAADF]"
                    : "text-gray-500"

              return (
                <li
                  key={user.id}
                  className={`group px-3 py-2.5 md:px-4 hover:bg-[#ffffff04] transition-colors ${!isAtivo ? 'opacity-70' : ''}`}
                >
                  <div className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_auto_auto_auto] gap-2 md:gap-3 items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-lg bg-[#0A0A0A] border border-[#ffffff10] flex items-center justify-center text-sm font-bold text-[#2BAADF]">
                          {initial}
                        </div>
                        <span
                          title={roleTitle}
                          className="absolute -bottom-0.5 -right-0.5 p-0.5 rounded bg-[#111111] border border-[#ffffff10]"
                        >
                          <RoleIcon className={`w-2.5 h-2.5 ${roleColor}`} />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-[#2BAADF] transition-colors">
                          {user.nome_completo || "Sem nome informado"}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                          <Mail className="w-3 h-3 shrink-0 opacity-70" />
                          {user.email}
                        </p>
                        {isSuperAdmin && user.empresas?.nome && (
                          <p className="md:hidden text-[10px] text-gray-600 truncate mt-0.5 flex items-center gap-1">
                            <Building2 className="w-3 h-3 shrink-0" />
                            {user.empresas.nome}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="hidden md:block min-w-0">
                      <p className="text-xs text-gray-300 font-medium truncate">
                        {user.grupos_acesso?.nome || "Acesso Básico"}
                      </p>
                      {isSuperAdmin && (
                        <p className="text-[10px] text-gray-600 truncate flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 shrink-0" />
                          {user.empresas?.nome || "—"}
                        </p>
                      )}
                    </div>

                    <div className="hidden md:block">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                          isAtivo
                            ? 'bg-[#80B828]/10 text-[#80B828] border-[#80B828]/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}
                      >
                        {isAtivo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    <div className="hidden md:flex items-center gap-1.5 text-[10px] text-gray-500 font-medium tabular-nums justify-end">
                      <Calendar className="w-3 h-3 opacity-50" />
                      {new Date(user.created_at).toLocaleDateString("pt-BR")}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`md:hidden text-[10px] px-2 py-0.5 rounded-md border font-bold uppercase ${
                          isAtivo
                            ? 'bg-[#80B828]/10 text-[#80B828] border-[#80B828]/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}
                      >
                        {isAtivo ? 'Ativo' : 'Inativo'}
                      </span>
                      <span className="md:hidden text-[10px] px-2 py-0.5 rounded-md bg-[#ffffff06] text-gray-400 truncate max-w-[6rem]">
                        {user.grupos_acesso?.nome || "Básico"}
                      </span>
                      {canEdit ? (
                        <Link
                          href={`/cockpit/usuarios/${user.id}/editar`}
                          title="Editar usuário"
                          className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-[#ffffff0a] border border-transparent hover:border-[#ffffff12] transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="w-9" />
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="px-4 py-2 border-t border-[#ffffff08] text-[10px] text-gray-600 font-medium">
            {users.length} {users.length === 1 ? "usuário" : "usuários"}
            {statusFilter === 'ativos' ? ' ativos' : statusFilter === 'inativos' ? ' inativos' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
