import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { Plus, Tags, Edit, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import DebouncedSearchBox from '@/components/DebouncedSearchBox'
import SkuAreaNav from '@/components/skus/SkuAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import DeleteFamiliaButton from './DeleteFamiliaButton'

export const metadata = { title: 'Famílias de SKU | HuginFlow' }

function sanitizeSearchTerm(raw: string) {
  return raw.replace(/[%_,.()]/g, ' ').trim().slice(0, 80)
}

export default async function SkuFamiliasPage(props: {
  searchParams: Promise<{ q?: string }>
}) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'skus', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <p className="text-white font-bold text-xl">Sem permissão para famílias de SKU.</p>
        <BackTextButton className="mt-6 text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'skus', 'create') || hasPermission(me, 'skus', 'edit')
  const canEdit = hasPermission(me, 'skus', 'edit')
  const canDelete = hasPermission(me, 'skus', 'delete') || canEdit

  const searchParams = await props.searchParams
  const q = typeof searchParams.q === 'string' ? searchParams.q : ''
  const term = sanitizeSearchTerm(q).toLowerCase()

  const supabase = await createClient()
  let query = supabase
    .from('cad_sku_familias')
    .select('id, codigo, nome, descricao, ordem, ativo')
    .order('ordem')
    .order('nome')

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { data: allRows } = await query
  const rows =
    term && allRows
      ? allRows.filter((row) => {
          const hay = [row.codigo, row.nome, row.descricao].filter(Boolean).join(' ').toLowerCase()
          return hay.includes(term)
        })
      : allRows

  return (
    <div className="space-y-6 pb-20">
      <SkuAreaNav />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-400">
          Agrupe SKUs por família (ex.: Cervejas, Destilados) para filtros e relatórios.
        </p>
        {canCreate && (
          <Link
            href="/cockpit/cadastros/sku-familias/novo"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2BAADF]/20"
          >
            <Plus className="h-4 w-4" />
            Nova família
          </Link>
        )}
      </div>

      <DebouncedSearchBox
        placeholder="Buscar código ou nome…"
        initialQuery={q}
      />

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#ffffff08] bg-[#0A0A0A] text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Ordem</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ffffff06]">
            {(rows || []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  <Tags className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Nenhuma família cadastrada.
                </td>
              </tr>
            ) : (
              (rows || []).map((row) => (
                <tr key={row.id} className="hover:bg-[#ffffff04]">
                  <td className="px-4 py-3 font-mono text-xs text-[#2BAADF]">{row.codigo}</td>
                  <td className="px-4 py-3 text-white">
                    <div className="font-medium">{row.nome}</div>
                    {row.descricao && (
                      <div className="text-[11px] text-gray-500 line-clamp-1">{row.descricao}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{row.ordem}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        row.ativo
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-gray-500/15 text-gray-400'
                      }`}
                    >
                      {row.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canEdit && (
                        <Link
                          href={`/cockpit/cadastros/sku-familias/${row.id}/editar`}
                          className="rounded-lg p-2 text-gray-400 hover:bg-[#ffffff08] hover:text-white"
                        >
                          <Edit className="h-4 w-4" />
                        </Link>
                      )}
                      {canDelete && <DeleteFamiliaButton id={row.id} nome={row.nome} />}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
