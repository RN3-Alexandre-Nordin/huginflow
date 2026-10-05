import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { Plus, ArrowLeftRight, Edit, Trash2, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import SkuAreaNav from '@/components/skus/SkuAreaNav'
import { deleteConversaoUm } from './actions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

export const metadata = { title: 'Conversões UM | HuginFlow' }

export default async function ConversoesUmPage() {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <p className="text-white font-bold text-xl">Sem permissão para conversões de UM.</p>
        <BackTextButton className="mt-6 text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'skus', 'create') || hasPermission(me, 'skus', 'edit')
  const canEdit = hasPermission(me, 'skus', 'edit')
  const canDelete = hasPermission(me, 'skus', 'delete') || canEdit

  const supabase = await createClient()
  let query = supabase
    .from('cad_sku_unidade_conversao')
    .select(
      'id, sku_id, unidade_origem, unidade_destino, fator_conversao, cad_skus(codigo, nome)',
    )
    .order('unidade_origem')

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { data: rows } = await query

  return (
    <div className="space-y-6 pb-20">
      <SkuAreaNav />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-400">
          Genérica (SKU vazio) vale para todos. Específica sobrescreve por item.
        </p>
        {canCreate && (
          <Link
            href="/cockpit/cadastros/conversoes-um/novo"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Nova conversão
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        {!rows?.length ? (
          <div className="py-20 text-center">
            <ArrowLeftRight className="mx-auto mb-4 h-12 w-12 text-gray-700 opacity-30" />
            <p className="text-white font-bold">Nenhuma conversão cadastrada.</p>
            <p className="mt-2 text-sm text-gray-500">Ex.: ML → L com fator 1000 (genérica).</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="border-b border-[#ffffff0a] text-[10px] font-bold uppercase tracking-widest text-gray-500">
              <tr>
                <th className="px-6 py-4">Escopo</th>
                <th className="px-6 py-4">Origem → Destino</th>
                <th className="px-6 py-4">Fator</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff0a]">
              {rows.map((row) => {
                const sku = row.cad_skus as { codigo?: string; nome?: string } | null
                const generica = !row.sku_id
                return (
                  <tr key={row.id} className="group hover:bg-[#ffffff03]">
                    <td className="px-6 py-4">
                      {generica ? (
                        <span className="rounded-md border border-[#2BAADF]/25 bg-[#2BAADF]/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#2BAADF]">
                          Genérica
                        </span>
                      ) : (
                        <div>
                          <span className="rounded-md border border-[#80B828]/25 bg-[#80B828]/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#80B828]">
                            Específica
                          </span>
                          <p className="mt-1 font-mono text-[11px] text-gray-400">
                            {sku?.codigo} · {sku?.nome}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">
                      {row.unidade_origem} → {row.unidade_destino}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{row.fator_conversao}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        {canEdit && (
                          <Link
                            href={`/cockpit/cadastros/conversoes-um/${row.id}/editar`}
                            className="rounded-xl p-2.5 text-gray-400 hover:bg-[#ffffff10] hover:text-white"
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                        )}
                        {canDelete && (
                          <form action={deleteConversaoUm}>
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
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
