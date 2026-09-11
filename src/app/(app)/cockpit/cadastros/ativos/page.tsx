import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { Plus, Landmark, Edit, Trash2, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import { deleteAtivo } from './actions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { ATIVO_STATUS } from '@/lib/ativos/constants'

export const metadata = { title: 'Ativos | HuginFlow' }

export default async function AtivosPage(props: { searchParams: Promise<{ q?: string }> }) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'ativos', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <p className="text-xl font-bold text-white">Sem permissão para ativos.</p>
        <BackTextButton className="mt-6 text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'ativos', 'create')
  const canEdit = hasPermission(me, 'ativos', 'edit')
  const canDelete = hasPermission(me, 'ativos', 'delete')
  const q = (await props.searchParams).q || ''

  const supabase = await createClient()
  let query = supabase
    .from('cad_ativos')
    .select('id, codigo, nome, status, numero_patrimonio, valor_aquisicao, ativo, formula_depreciacao_id')
    .order('codigo')

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }
  if (q) {
    query = query.or(
      `codigo.ilike.%${q}%,nome.ilike.%${q}%,numero_patrimonio.ilike.%${q}%`,
    )
  }

  const { data: rows } = await query

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-400">
          Patrimônio / ativo fixo. Depreciação vinculada à fórmula (módulo Ativo futuro).
        </p>
        {canCreate && (
          <Link
            href="/cockpit/cadastros/ativos/novo"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Novo ativo
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        {!rows?.length ? (
          <div className="py-20 text-center">
            <Landmark className="mx-auto mb-4 h-12 w-12 text-gray-700 opacity-30" />
            <p className="font-bold text-white">Nenhum ativo cadastrado.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="border-b border-[#ffffff0a] text-[10px] font-bold uppercase tracking-widest text-gray-500">
              <tr>
                <th className="px-6 py-4">Código / Nome</th>
                <th className="px-6 py-4">Patrimônio</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Depreciação</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff0a]">
              {rows.map((row) => (
                <tr key={row.id} className="group hover:bg-[#ffffff03]">
                  <td className="px-6 py-4">
                    <div className="font-mono text-[11px] font-bold text-[#2BAADF]">{row.codigo}</div>
                    <div className="font-semibold text-white">{row.nome}</div>
                  </td>
                  <td className="px-6 py-4 text-xs">{row.numero_patrimonio || '—'}</td>
                  <td className="px-6 py-4">
                    <span className="rounded-md border border-[#ffffff12] bg-[#ffffff08] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider">
                      {ATIVO_STATUS.find((s) => s.value === row.status)?.label || row.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {row.formula_depreciacao_id ? 'Fórmula vinculada' : 'Sem fórmula'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      {canEdit && (
                        <Link
                          href={`/cockpit/cadastros/ativos/${row.id}/editar`}
                          className="rounded-xl p-2.5 text-gray-400 hover:bg-[#ffffff10] hover:text-white"
                        >
                          <Edit className="h-4 w-4" />
                        </Link>
                      )}
                      {canDelete && (
                        <form action={deleteAtivo}>
                          <input type="hidden" name="id" value={row.id} />
                          <button
                            type="submit"
                            className="rounded-xl p-2.5 text-red-500/60 hover:bg-red-400/10 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
