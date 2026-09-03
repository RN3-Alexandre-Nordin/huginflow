import { createClient } from "@/utils/supabase/server"
import Link from "next/link"
import { Building2, Plus, Users, Pencil, RotateCcw, Target } from "lucide-react"
import SearchFilters from "./SearchFilters"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"
import { redirect } from "next/navigation"

export default async function DepartamentosPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const me = await getMyProfile()
  
  // Guard: RBAC - View Permission
  if (!me || (me.role_global !== 'superadmin' && !hasPermission(me, 'departamentos', 'view'))) {
    redirect('/cockpit/acesso-negado')
  }

  const searchParams = await props.searchParams
  const query = typeof searchParams.q === 'string' ? searchParams.q : ""
  const empresaFilter = typeof searchParams.empresa === 'string' ? searchParams.empresa : "all"

  const supabase = await createClient()
  const isSuperAdmin = me.role_global === 'superadmin'
  const canCreate = hasPermission(me, 'departamentos', 'create') || isSuperAdmin
  const canEdit = hasPermission(me, 'departamentos', 'edit') || isSuperAdmin

  // Base query with join
  let supabaseQuery = supabase
    .from("departamentos")
    .select("*, empresas(id, nome)")
    .order("created_at", { ascending: false })

  // Isolamento de Tenant (Lei Suprema do HuginFlow)
  if (!isSuperAdmin) {
    supabaseQuery = supabaseQuery.eq('empresa_id', me.empresa_id)
  }

  // Applying Filters
  if (query) {
    supabaseQuery = supabaseQuery.ilike('nome', `%${query}%`)
  }

  // Filtro de empresa adicional (apenas para superadmin)
  if (isSuperAdmin && empresaFilter !== 'all') {
    supabaseQuery = supabaseQuery.eq('empresa_id', empresaFilter)
  }

  const { data: departments, error } = await supabaseQuery

  const { data: companies } = isSuperAdmin 
    ? await supabase.from('empresas').select('id, nome').order('nome')
    : { data: [] }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-400">
          Organize equipes e permissões específicas para os workflows de CRM (Kanban).
        </p>
        {canCreate && (
          <Link
            href="/cockpit/departamentos/novo"
            className="bg-gradient-to-r from-[#80B828] to-[#5A8F1A] hover:shadow-[0_4px_24px_rgba(128,184,40,0.35)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Departamento
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

      {/* Grid de Departamentos */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          Erro ao carregar departamentos: {error.message}
        </div>
      )}

      {(!departments || departments.length === 0) ? (
        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#ffffff05] border border-[#ffffff0a] flex items-center justify-center mx-auto mb-2">
            <Target className="w-8 h-8 text-gray-700" />
          </div>
          <div>
            <p className="text-gray-400 font-medium">Nenhum departamento encontrado.</p>
            <p className="text-gray-600 text-sm mt-1">
              {query || (isSuperAdmin && empresaFilter !== 'all') 
                ? "Tente ajustar seus filtros para encontrar o que procura." 
                : "Clique em 'Novo Departamento' para começar."}
            </p>
          </div>
          {(query || (isSuperAdmin && empresaFilter !== 'all')) && (
            <Link 
              href="/cockpit/departamentos"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#80B828] hover:text-[#5A8F1A] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar todos os filtros
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-5 hover:border-[#ffffff14] transition-all group relative overflow-hidden"
            >
              <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-[#80B828]/5 blur-2xl group-hover:bg-[#80B828]/10 transition-all pointer-events-none" />
              
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[#80B828]/10 border border-[#80B828]/20 flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-[#80B828]" />
                  </div>
                  {canEdit && (
                    <Link
                      href={`/cockpit/departamentos/${dept.id}/editar`}
                      className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-500 hover:text-white transition-all border border-[#ffffff0a] hover:border-[#ffffff14]"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-white text-base group-hover:text-[#80B828] transition-colors line-clamp-1">
                    {dept.nome}
                  </h3>
                  {isSuperAdmin && (
                    <p className="text-[10px] text-[#2BAADF] uppercase tracking-wider font-bold mt-1 inline-flex items-center gap-1 bg-[#2BAADF]/5 px-1.5 py-0.5 rounded-md border border-[#2BAADF]/10">
                      <Building2 className="w-2.5 h-2.5" />
                      {dept.empresas?.nome}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-3 line-clamp-2 min-h-[2rem]">
                    {dept.descricao || "Sem descrição disponível."}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-[#ffffff05] flex items-center justify-between text-[10px] font-medium uppercase tracking-widest text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-gray-500" />
                    Equipe
                  </div>
                  <span>ID: {dept.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
