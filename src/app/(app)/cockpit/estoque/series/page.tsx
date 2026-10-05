import Link from 'next/link'
import { Hash, Lock } from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import InventarioSerieForm from './InventarioSerieForm'

export const metadata = { title: 'Séries | HuginFlow' }

const SITUACAO: Record<string, string> = {
  em_estoque: 'No estoque',
  em_terceiro: 'Em terceiro',
  baixada: 'Baixada',
}

export default async function SeriesPage() {
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque', 'view') ||
    hasPermission(me, 'estoque_ajustes', 'view') ||
    hasPermission(me, 'estoque_entradas', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-bold text-white">Acesso interditado</h2>
        <p className="mt-2 text-gray-400">Seu grupo não pode ver as séries do estoque.</p>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  let bloqueadosQuery = supabase
    .from('est_saldos')
    .select('quantidade, sku_id, local_id, cad_skus!inner(codigo, nome, controla_serie), cad_locais_estoque(codigo, nome)')
    .is('serie_id', null)
    .is('lote_produto_id', null)
    .gt('quantidade', 0)
    .eq('cad_skus.controla_serie', true)
    .order('sku_id')
    .limit(50)
  let seriesQuery = supabase
    .from('est_series')
    .select('id, numero, situacao, cad_skus(codigo, nome), cad_locais_estoque(codigo, nome)')
    .order('numero')
    .limit(50)
  if (!isSuperAdmin) {
    bloqueadosQuery = bloqueadosQuery.eq('empresa_id', empresaId)
    seriesQuery = seriesQuery.eq('empresa_id', empresaId)
  }

  const [{ data: bloqueados }, { data: series }] = await Promise.all([bloqueadosQuery, seriesQuery])

  const opcoes = (bloqueados || []).map((row) => {
    const sku = Array.isArray(row.cad_skus) ? row.cad_skus[0] : row.cad_skus
    const local = Array.isArray(row.cad_locais_estoque) ? row.cad_locais_estoque[0] : row.cad_locais_estoque
    return {
      skuId: row.sku_id as string,
      localId: row.local_id as string,
      quantidade: Number(row.quantidade),
      rotulo: `${sku?.codigo || 'SKU'} ${sku?.nome || ''} · ${local?.codigo || 'local'}`,
    }
  })

  return (
    <div className="space-y-6">
      <EstoqueAreaNav />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Hash className="h-6 w-6 text-[#2BAADF]" />
            Séries
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Cada série é uma unidade. O saldo antigo, sem número, não sai, não transfere e não vai a
            terceiro até esta tela dar uma série a cada peça.
          </p>
        </div>
        <Link href="/cockpit/estoque/saldos" className="text-sm text-[#2BAADF]">
          Ver saldos
        </Link>
      </div>

      <section className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5">
        <h2 className="text-base font-semibold text-white">Inventário do saldo sem série</h2>
        <p className="mb-4 mt-1 text-xs text-gray-500">Uma unidade por número. A quantidade do local não muda.</p>
        <InventarioSerieForm opcoes={opcoes} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111]">
        <div className="border-b border-[#ffffff08] px-5 py-3">
          <h2 className="text-base font-semibold text-white">Peças identificadas</h2>
        </div>
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-2">Série</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Onde está</th>
              <th className="px-5 py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {(series || []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-gray-500">
                  Nenhuma série gravada.
                </td>
              </tr>
            ) : (
              (series || []).map((serie) => {
                const sku = Array.isArray(serie.cad_skus) ? serie.cad_skus[0] : serie.cad_skus
                const local = Array.isArray(serie.cad_locais_estoque)
                  ? serie.cad_locais_estoque[0]
                  : serie.cad_locais_estoque
                return (
                  <tr key={serie.id} className="border-t border-[#ffffff08]">
                    <td className="px-5 py-2 font-mono text-white">{serie.numero}</td>
                    <td className="px-3 py-2">
                      {sku?.codigo} {sku?.nome}
                    </td>
                    <td className="px-3 py-2">{local?.codigo || '—'}</td>
                    <td className="px-5 py-2">{SITUACAO[serie.situacao] || serie.situacao}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
