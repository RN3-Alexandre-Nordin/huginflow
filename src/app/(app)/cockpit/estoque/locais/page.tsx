import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { Plus, Warehouse, Edit, Lock, Sparkles, Building2 } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import DeleteLocalButton from './DeleteLocalButton'
import CriarBrancoButton from './CriarBrancoButton'

export const metadata = { title: 'Locais de Estoque | HuginFlow' }

function sanitizeSearchTerm(raw: string) {
  return raw.replace(/[%_,.()]/g, ' ').trim().slice(0, 80)
}

export default async function LocaisEstoquePage(props: {
  searchParams: Promise<{ q?: string }>
}) {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView = isSuperAdmin || hasPermission(me, 'estoque_locais', 'view') || hasPermission(me, 'estoque', 'view')
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar locais de estoque.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate = isSuperAdmin || hasPermission(me, 'estoque_locais', 'create') || hasPermission(me, 'estoque', 'create')
  const canEdit = isSuperAdmin || hasPermission(me, 'estoque_locais', 'edit') || hasPermission(me, 'estoque', 'edit')
  const canDelete = isSuperAdmin || hasPermission(me, 'estoque_locais', 'delete') || hasPermission(me, 'estoque', 'delete')

  const searchParams = await props.searchParams
  const q = typeof searchParams.q === 'string' ? searchParams.q : ''
  const term = sanitizeSearchTerm(q)
  const supabase = await createClient()

  let query = supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome, tipo, eh_principal, departamento_id, ativo, created_at, departamentos(id, nome)')
    .order('eh_principal', { ascending: false })
    .order('codigo', { ascending: true })

  if (!isSuperAdmin) {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  if (term) {
    query = query.or(`codigo.ilike.%${term}%,nome.ilike.%${term}%`)
  }

  const { data: locais } = await query

  const hasBranco = locais?.some((l) => l.codigo === 'BRANCO')
  const hasPrincipal = locais?.some((l) => l.eh_principal)

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-[#2BAADF]" />
            Locais de Estoque
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Locais físicos de armazenagem de materiais. Entrada e movimentação sem local informado usam o local principal.
          </p>
        </div>

        {canCreate && (
          <Link
            href="/cockpit/estoque/locais/novo"
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-all shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Novo Local
          </Link>
        )}
      </div>

      {/* Banner de sugestão BRANCO se não houver nenhum local cadastrado */}
      {locais && locais.length === 0 && !q && canCreate && (
        <div className="rounded-2xl border border-[#2BAADF]/30 bg-[#2BAADF]/5 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[#2BAADF] font-bold text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Nenhum local cadastrado para esta empresa</span>
            </div>
            <p className="text-xs text-gray-400 max-w-xl leading-relaxed">
              Se você opera com um único estoque geral ou está começando a configurar o módulo, crie o local padrão <strong>BRANCO</strong> agora. Ele será o local principal automático para entradas e saídas.
            </p>
          </div>
          <CriarBrancoButton />
        </div>
      )}

      {/* Barra de Busca */}
      <div className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-4 flex gap-4 items-center shadow-lg">
        <DebouncedSearchBox
          initialQuery={q}
          placeholder="Buscar por código ou nome..."
        />
        {q && (
          <Link
            href="/cockpit/estoque/locais"
            className="text-xs font-bold uppercase tracking-wider text-[#2BAADF] transition-colors hover:text-white"
          >
            Limpar
          </Link>
        )}

        {locais && locais.length > 0 && !hasPrincipal && (
          <div className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg">
            Atenção: Nenhum local está marcado como Principal.
          </div>
        )}
      </div>

      {/* Tabela de Locais */}
      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl">
        {locais?.length === 0 ? (
          <div className="py-24 text-center">
            <Warehouse className="w-16 h-16 text-gray-700 mx-auto mb-6 opacity-20" />
            <p className="text-white font-bold text-xl">
              {q ? 'Nenhum local encontrado com estes termos.' : 'Nenhum local cadastrado ainda.'}
            </p>
            {canCreate && !q && (
              <div className="mt-6 flex justify-center gap-3">
                <CriarBrancoButton />
                <Link
                  href="/cockpit/estoque/locais/novo"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#ffffff10] bg-[#ffffff05] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ffffff10] transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Outro local
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#ffffff02] border-b border-[#ffffff0a] text-gray-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-4">Código / Nome</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Departamento</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff0a]">
                {locais?.map((local) => {
                  const dept = Array.isArray(local.departamentos)
                    ? local.departamentos[0]
                    : local.departamentos

                  return (
                    <tr
                      key={local.id}
                      className="hover:bg-[#ffffff03] transition-all group border-l-2 border-transparent hover:border-[#2BAADF]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#2BAADF]">
                            {local.codigo}
                          </span>
                          {local.eh_principal && (
                            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                              Principal
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-white text-sm group-hover:text-[#2BAADF] transition-colors mt-0.5">
                          {local.nome}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[#ffffff08] text-gray-300 border border-[#ffffff10] capitalize">
                          {local.tipo}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-xs text-gray-400">
                        {dept?.nome ? (
                          <span className="inline-flex items-center gap-1.5 text-gray-300">
                            <Building2 className="w-3.5 h-3.5 text-gray-500" />
                            {dept.nome}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {local.ativo ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                            Inativo
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-all">
                          {canEdit && (
                            <Link
                              href={`/cockpit/estoque/locais/${local.id}/editar`}
                              className="p-2 text-gray-400 hover:text-white bg-[#ffffff05] hover:bg-[#ffffff10] rounded-xl transition-all"
                              title="Editar Local"
                            >
                              <Edit className="w-4 h-4" />
                            </Link>
                          )}
                          {canDelete && <DeleteLocalButton id={local.id} nome={local.nome} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
