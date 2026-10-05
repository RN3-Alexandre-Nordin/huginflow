import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { Search, Plus, Package, Edit, Trash2, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import SkuAreaNav from '@/components/skus/SkuAreaNav'
import { deleteSku } from './actions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

export const metadata = { title: 'SKUs | HuginFlow' }

export default async function SkusPage(props: { searchParams: Promise<{ q?: string }> }) {
  const me = await getMyProfile()

  if (!hasPermission(me, 'skus', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para acessar SKUs.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'skus', 'create')
  const canEdit = hasPermission(me, 'skus', 'edit')
  const canDelete = hasPermission(me, 'skus', 'delete')

  const searchParams = await props.searchParams
  const q = searchParams.q || ''
  const supabase = await createClient()

  let query = supabase
    .from('cad_skus')
    .select('id, codigo, nome, tipo, unidade_venda, unidade_compra, unidade_estoque, controla_estoque, ponto_reposicao, ativo, created_at')
    .order('codigo', { ascending: true })

  if (me?.role_global !== 'superadmin') {
    query = query.eq('empresa_id', me?.empresa_id ?? '')
  }

  if (q) {
    query = query.or(`codigo.ilike.%${q}%,nome.ilike.%${q}%,codigo_barras.ilike.%${q}%`)
  }

  const { data: skus } = await query

  return (
    <div className="space-y-6 pb-20 font-sans">
      <SkuAreaNav />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-400 font-medium">
          Produtos e serviços com UM de venda/compra/estoque. Conversões e de-para nas abas acima.
        </p>
        {canCreate && (
          <Link
            href="/cockpit/cadastros/skus/novo"
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" /> Novo SKU
          </Link>
        )}
      </div>

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-4 flex gap-4 items-center shadow-lg">
        <form className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por código ou nome..."
            className="w-full bg-[#0A0A0A] border border-[#ffffff10] text-sm text-white rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-[#2BAADF] transition-colors"
          />
        </form>
        {q && (
          <Link
            href="/cockpit/cadastros/skus"
            className="text-xs text-[#2BAADF] hover:text-white transition-colors uppercase font-bold tracking-wider"
          >
            Limpar
          </Link>
        )}
      </div>

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl">
        {skus?.length === 0 ? (
          <div className="py-24 text-center">
            <Package className="w-16 h-16 text-gray-700 mx-auto mb-6 opacity-20" />
            <p className="text-white font-bold text-xl">
              {q ? 'Nenhum SKU encontrado.' : 'Nenhum SKU cadastrado ainda.'}
            </p>
            {canCreate && !q && (
              <Link
                href="/cockpit/cadastros/skus/novo"
                className="mt-8 inline-flex items-center gap-2 text-[#2BAADF] hover:text-white font-semibold transition-colors"
              >
                Cadastrar primeiro SKU <Plus className="w-4 h-4" />
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#ffffff02] border-b border-[#ffffff0a] text-gray-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th className="px-6 py-5">Código / Nome</th>
                  <th className="px-6 py-5">Tipo</th>
                  <th className="px-6 py-5">UMs</th>
                  <th className="px-6 py-5">Estoque</th>
                  <th className="px-6 py-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff0a]">
                {skus?.map((sku) => (
                  <tr
                    key={sku.id}
                    className="hover:bg-[#ffffff03] transition-all group border-l-2 border-transparent hover:border-[#2BAADF]"
                  >
                    <td className="px-6 py-5">
                      <div className="font-mono text-[11px] text-[#2BAADF] font-bold">{sku.codigo}</div>
                      <div className="font-bold text-white text-[15px] group-hover:text-[#2BAADF] transition-colors">
                        {sku.nome}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider rounded-md bg-[#ffffff08] text-gray-300 border border-[#ffffff12]">
                        {sku.tipo}
                      </span>
                      {!sku.ativo && (
                        <span className="ml-2 text-[9px] font-bold uppercase text-red-400">inativo</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-xs text-gray-400">
                      V {sku.unidade_venda} · C {sku.unidade_compra} · E {sku.unidade_estoque}
                    </td>
                    <td className="px-6 py-5 text-xs">
                      {sku.controla_estoque ? (
                        <span className="text-[#80B828]">
                          Rep. {sku.ponto_reposicao ?? '—'}
                        </span>
                      ) : (
                        <span className="text-gray-600">Sem controle</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        {canEdit && (
                          <Link
                            href={`/cockpit/cadastros/skus/${sku.id}/editar`}
                            className="p-2.5 text-gray-400 hover:text-white bg-[#ffffff05] hover:bg-[#ffffff10] rounded-xl transition-all"
                            title="Editar SKU"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                        )}
                        {canDelete && (
                          <form action={deleteSku}>
                            <input type="hidden" name="id" value={sku.id} />
                            <button
                              type="submit"
                              title="Excluir SKU"
                              className="p-2.5 text-red-500/60 hover:text-red-400 bg-red-400/5 hover:bg-red-400/10 rounded-xl transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
