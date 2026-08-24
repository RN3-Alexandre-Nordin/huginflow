import { createClient } from "@/utils/supabase/server"
import Link from "next/link"
import { Building2, Plus, Phone, Mail, User, Globe, CheckCircle2, XCircle, Pencil, Search, Filter, RotateCcw } from "lucide-react"
import SearchFilters from "./SearchFilters"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"
import { redirect } from "next/navigation"

export default async function EmpresasPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const me = await getMyProfile()
  
  // Guard: Apenas SuperAdmin ou quem tem permissão explícita de ver empresas
  if (!me || (me.role_global !== 'superadmin' && !hasPermission(me, 'empresas', 'view'))) {
    redirect('/cockpit/acesso-negado')
  }

  const searchParams = await props.searchParams
  const query = typeof searchParams.q === 'string' ? searchParams.q : ""
  const statusFilter = typeof searchParams.status === 'string' ? searchParams.status : "all"

  const supabase = await createClient()

  const isSuperAdmin = me.role_global === 'superadmin'
  const canCreate = hasPermission(me, 'empresas', 'create') || isSuperAdmin
  const canEdit = hasPermission(me, 'empresas', 'edit') || isSuperAdmin

  // Base query
  let supabaseQuery = supabase
    .from("empresas")
    .select("*")
    .order("created_at", { ascending: false })

  // Isolamento de Tenant: Se não for SuperAdmin, vê apenas a sua própria empresa
  if (!isSuperAdmin) {
    supabaseQuery = supabaseQuery.eq('id', me.empresa_id)
  }

  // Applying Filters
  if (query) {
    supabaseQuery = supabaseQuery.or(`nome.ilike.%${query}%,cnpj.ilike.%${query}%`)
  }

  if (statusFilter === 'ativo') {
    supabaseQuery = supabaseQuery.eq('ativo', true)
  } else if (statusFilter === 'suspenso') {
    supabaseQuery = supabaseQuery.eq('ativo', false)
  }

  const { data: companies, error } = await supabaseQuery

  // Stats filter logic
  let statsQuery = supabase.from("empresas").select("id, ativo")
  if (!isSuperAdmin) {
    statsQuery = statsQuery.eq('id', me.empresa_id)
  }
  const { data: allCompanies } = await statsQuery

  const totalCount = allCompanies?.length || 0
  const activeCount = allCompanies?.filter(c => c.ativo).length || 0
  const suspendedCount = totalCount - activeCount

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Building2 className="w-6 h-6 text-[#2BAADF]" />
            {isSuperAdmin ? "Empresas Clientes" : "Dados da Empresa"}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {isSuperAdmin 
              ? 'Gerencie os tenants ativos na plataforma Hugin Flow.'
              : 'Visualize as informações cadastrais da sua empresa.'}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/cockpit/empresas/nova"
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Empresa
          </Link>
        )}
      </div>


      {/* Estatísticas rápidas */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total de Clientes", value: totalCount, color: "#2BAADF" },
          { label: "Ativos", value: activeCount, color: "#80B828" },
          { label: "Suspensos", value: suspendedCount, color: "#ef4444" },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Bar de Busca e Filtros */}
      <SearchFilters initialQuery={query} initialStatus={statusFilter} />

      {/* Lista de Empresas */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          Erro ao carregar empresas: {error.message}
        </div>
      )}

      {(!companies || companies.length === 0) ? (
        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#ffffff05] border border-[#ffffff0a] flex items-center justify-center mx-auto mb-2">
            <Search className="w-8 h-8 text-gray-700" />
          </div>
          <div>
            <p className="text-gray-400 font-medium">Nenhum resultado encontrado.</p>
            <p className="text-gray-600 text-sm mt-1">
              {query || statusFilter !== 'all' 
                ? "Tente ajustar seus filtros para encontrar o que procura." 
                : "Clique em 'Nova Empresa' para começar."}
            </p>
          </div>
          {(query || statusFilter !== 'all') && (
            <Link 
              href="/cockpit/empresas"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#2BAADF] hover:text-[#1A8FBF] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar todos os filtros
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((empresa) => (
            <div
              key={empresa.id}
              className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-5 hover:border-[#ffffff14] transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Info principal */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  {/* Avatar da empresa */}
                  <div className="w-11 h-11 rounded-xl bg-[#2BAADF]/10 border border-[#2BAADF]/20 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-[#2BAADF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-white text-base">{empresa.nome}</h3>
                      {empresa.ativo ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#80B828]/10 text-[#80B828] border border-[#80B828]/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                          <XCircle className="w-3 h-3" />
                          Suspenso
                        </span>
                      )}
                      {empresa.ramo_atividade && (
                        <span className="px-2 py-0.5 rounded-full text-xs text-gray-500 border border-[#ffffff0a]">
                          {empresa.ramo_atividade}
                        </span>
                      )}
                    </div>
                    {empresa.cnpj && (
                      <p className="text-xs text-gray-600 font-mono mt-0.5">{empresa.cnpj}</p>
                    )}

                    {/* Contatos */}
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                      {empresa.responsavel_nome && (
                        <span className="flex items-center gap-1.5 text-xs text-gray-400">
                          <User className="w-3.5 h-3.5 text-[#2BAADF]" />
                          <span className="font-medium text-gray-300">{empresa.responsavel_nome}</span>
                          {empresa.responsavel_cargo && (
                            <span className="text-gray-600">· {empresa.responsavel_cargo}</span>
                          )}
                        </span>
                      )}
                      {empresa.responsavel_telefone && (
                        <a
                          href={`https://wa.me/${empresa.responsavel_telefone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#2BAADF] transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {empresa.responsavel_telefone}
                        </a>
                      )}
                      {empresa.responsavel_email && (
                        <a
                          href={`mailto:${empresa.responsavel_email}`}
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#2BAADF] transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {empresa.responsavel_email}
                        </a>
                      )}
                      {empresa.website && (
                        <a
                          href={empresa.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#2BAADF] transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          {empresa.website.replace(/^https?:\/\/(www\.)?/, '')}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canEdit && (
                    <Link
                      href={`/cockpit/empresas/${empresa.id}/editar`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-[#ffffff0a] transition-all border border-transparent hover:border-[#ffffff0a]"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
