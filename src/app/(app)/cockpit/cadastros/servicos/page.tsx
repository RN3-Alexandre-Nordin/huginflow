import Link from 'next/link'
import { Ban, Briefcase, Edit, Lock, Plus, Power, Trash2 } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { deleteServico, desativarServico, reativarServico } from './actions'

export const metadata = { title: 'Serviços | HuginFlow' }

function sanitize(raw: string) {
  return raw.replace(/[%_,.()]/g, ' ').trim().slice(0, 80)
}

export default async function ServicosPage(props: { searchParams: Promise<{ q?: string }> }) {
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (!!me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'servicos', 'view')))

  if (!permitido || !me?.empresa_id) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <p className="mt-2 max-w-md text-sm text-gray-400">
          Exige addon Compras ativo e permissão de Serviços.
        </p>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const canCreate = isSuper || hasPermission(me, 'servicos', 'create')
  const canEdit = isSuper || hasPermission(me, 'servicos', 'edit')
  const canDelete = isSuper || hasPermission(me, 'servicos', 'delete')
  const searchParams = await props.searchParams
  const q = typeof searchParams.q === 'string' ? searchParams.q : ''
  const term = sanitize(q)

  const supabase = await createClient()
  let query = supabase
    .from('cad_servicos')
    .select('id, codigo, nome, unidade, preco_referencia, ativo')
    .eq('empresa_id', me.empresa_id)
    .order('codigo')
    .limit(200)
  if (term) query = query.or(`codigo.ilike.%${term}%,nome.ilike.%${term}%`)
  const { data, error } = await query

  const ids = (data || []).map((r) => r.id)
  const emUso = new Set<string>()
  if (ids.length) {
    const [{ data: sol }, { data: ped }] = await Promise.all([
      supabase
        .from('com_solicitacao_itens')
        .select('servico_id')
        .eq('empresa_id', me.empresa_id)
        .in('servico_id', ids),
      supabase
        .from('com_pedido_itens')
        .select('servico_id')
        .eq('empresa_id', me.empresa_id)
        .in('servico_id', ids),
    ])
    for (const row of sol || []) {
      if (row.servico_id) emUso.add(row.servico_id)
    }
    for (const row of ped || []) {
      if (row.servico_id) emUso.add(row.servico_id)
    }
  }

  return (
    <div className="space-y-6 pb-20 font-sans">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Serviços</h1>
          <p className="text-sm text-gray-500">
            Catálogo mestre. Com vínculo em solicitação/pedido, só é possível desativar.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/cockpit/cadastros/servicos/novo"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)]"
          >
            <Plus className="h-4 w-4" /> Novo serviço
          </Link>
        ) : null}
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-[#ffffff0a] bg-[#111111] p-4 shadow-lg">
        <DebouncedSearchBox initialQuery={q} placeholder="Buscar código ou nome…" />
        {q ? (
          <Link
            href="/cockpit/cadastros/servicos"
            className="text-xs font-bold uppercase tracking-wider text-[#2BAADF] transition-colors hover:text-white"
          >
            Limpar
          </Link>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        {!data?.length ? (
          <div className="py-24 text-center">
            <Briefcase className="mx-auto mb-6 h-16 w-16 text-gray-700 opacity-20" />
            <p className="text-xl font-bold text-white">
              {q ? 'Nenhum serviço encontrado.' : 'Nenhum serviço cadastrado ainda.'}
            </p>
          </div>
        ) : (
          <div className="min-h-[400px] overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="border-b border-[#ffffff0a] bg-[#ffffff02] text-[10px] font-bold uppercase tracking-widest text-gray-500">
                <tr>
                  <th className="px-6 py-5">Código / Nome</th>
                  <th className="px-6 py-5">UM</th>
                  <th className="px-6 py-5">Preço ref.</th>
                  <th className="px-6 py-5">Status</th>
                  <th className="px-6 py-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff0a]">
                {data.map((row) => {
                  const vinculado = emUso.has(row.id)
                  return (
                    <tr
                      key={row.id}
                      className="group border-l-2 border-transparent transition-all hover:border-[#2BAADF] hover:bg-[#ffffff03]"
                    >
                      <td className="px-6 py-5">
                        <div className="font-mono text-[11px] font-bold text-[#2BAADF]">
                          {row.codigo}
                        </div>
                        <div className="text-[15px] font-bold text-white transition-colors group-hover:text-[#2BAADF]">
                          {row.nome}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-xs text-gray-400">{row.unidade}</td>
                      <td className="px-6 py-5 text-gray-300">
                        {row.preco_referencia != null
                          ? Number(row.preco_referencia).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })
                          : '—'}
                      </td>
                      <td className="px-6 py-5">
                        {row.ativo ? (
                          <span className="text-xs text-[#80B828]">Ativo</span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase text-red-400">
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 transition-all group-hover:opacity-100">
                          {canEdit ? (
                            <Link
                              href={`/cockpit/cadastros/servicos/${row.id}/editar`}
                              className="rounded-xl bg-[#ffffff05] p-2.5 text-gray-400 transition-all hover:bg-[#ffffff10] hover:text-white"
                              title="Editar serviço"
                            >
                              <Edit className="h-4 w-4" />
                            </Link>
                          ) : null}
                          {row.ativo && vinculado && canEdit ? (
                            <form action={desativarServico}>
                              <input type="hidden" name="id" value={row.id} />
                              <button
                                type="submit"
                                title="Desativar (há solicitação ou pedido vinculado)"
                                className="rounded-xl bg-amber-400/5 p-2.5 text-amber-500/70 transition-all hover:bg-amber-400/10 hover:text-amber-400"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            </form>
                          ) : null}
                          {row.ativo && !vinculado && canDelete ? (
                            <form action={deleteServico}>
                              <input type="hidden" name="id" value={row.id} />
                              <button
                                type="submit"
                                title="Excluir serviço"
                                className="rounded-xl bg-red-400/5 p-2.5 text-red-500/60 transition-all hover:bg-red-400/10 hover:text-red-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </form>
                          ) : null}
                          {!row.ativo && canEdit ? (
                            <form action={reativarServico}>
                              <input type="hidden" name="id" value={row.id} />
                              <button
                                type="submit"
                                title="Reativar serviço"
                                className="rounded-xl bg-[#80B828]/10 p-2.5 text-[#80B828]/80 transition-all hover:bg-[#80B828]/20 hover:text-[#80B828]"
                              >
                                <Power className="h-4 w-4" />
                              </button>
                            </form>
                          ) : null}
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
