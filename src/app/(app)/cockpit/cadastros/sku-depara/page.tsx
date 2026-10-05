import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { Plus, Link2, Edit, Trash2, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import SkuAreaNav from '@/components/skus/SkuAreaNav'
import { deleteSkuDepara } from './actions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

export const metadata = { title: 'De-para SKU | HuginFlow' }

export default async function SkuDeparaPage() {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <p className="text-white font-bold text-xl">Sem permissão para de-para de SKU.</p>
        <BackTextButton className="mt-6 text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'skus', 'create') || hasPermission(me, 'skus', 'edit')
  const canEdit = hasPermission(me, 'skus', 'edit')
  const canDelete = hasPermission(me, 'skus', 'delete') || canEdit

  const supabase = await createClient()
  let query = supabase
    .from('cad_sku_depara')
    .select(
      'id, codigo_parceiro, ativo, observacao, cad_skus(codigo, nome), crm_leads(nome)',
    )
    .order('created_at', { ascending: false })

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { data: rows } = await query

  return (
    <div className="space-y-6 pb-20">
      <SkuAreaNav />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-400">
          Mapeia SKU Hugin ↔ pessoa ↔ código do cliente ou fornecedor.
        </p>
        {canCreate && (
          <Link
            href="/cockpit/cadastros/sku-depara/novo"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Cadastro em lista
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        {!rows?.length ? (
          <div className="py-20 text-center">
            <Link2 className="mx-auto mb-4 h-12 w-12 text-gray-700 opacity-30" />
            <p className="text-white font-bold">Nenhum de-para cadastrado.</p>
            {canCreate && (
              <Link
                href="/cockpit/cadastros/sku-depara/novo"
                className="mt-6 inline-flex items-center gap-2 text-[#2BAADF] hover:text-white font-semibold"
              >
                Abrir cadastro em lista <Plus className="h-4 w-4" />
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="border-b border-[#ffffff0a] text-[10px] font-bold uppercase tracking-widest text-gray-500">
              <tr>
                <th className="px-6 py-4">SKU Hugin</th>
                <th className="px-6 py-4">Pessoa</th>
                <th className="px-6 py-4">Cód. parceiro</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff0a]">
              {rows.map((row) => {
                const sku = row.cad_skus as { codigo?: string; nome?: string } | null
                const pessoa = row.crm_leads as { nome?: string } | null
                return (
                  <tr key={row.id} className="group hover:bg-[#ffffff03]">
                    <td className="px-6 py-4">
                      <div className="font-mono text-[11px] font-bold text-[#2BAADF]">
                        {sku?.codigo}
                      </div>
                      <div className="text-white font-semibold">{sku?.nome}</div>
                    </td>
                    <td className="px-6 py-4">{pessoa?.nome || '—'}</td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs text-white">{row.codigo_parceiro}</span>
                      {!row.ativo && (
                        <span className="ml-2 text-[9px] font-bold uppercase text-red-400">
                          inativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        {canEdit && (
                          <Link
                            href={`/cockpit/cadastros/sku-depara/${row.id}/editar`}
                            className="rounded-xl p-2.5 text-gray-400 hover:bg-[#ffffff10] hover:text-white"
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                        )}
                        {canDelete && (
                          <form action={deleteSkuDepara}>
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
