import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Lock, Pencil } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import AbrirCotacaoButton from '@/app/(app)/cockpit/compras/cotacoes/AbrirCotacaoButton'
import ExcluirSolicitacaoButton from '../ExcluirSolicitacaoButton'
import { TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

export const metadata = { title: 'Solicitação | HuginFlow' }

export default async function SolicitacaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_solicitacoes', 'view')))

  if (!permitido) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-500" />
        <h2 className="text-2xl font-semibold text-white">Acesso interditado</h2>
        <BackTextButton className="mt-6 text-sm text-[#2BAADF]">Voltar</BackTextButton>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: sol } = await supabase
    .from('com_solicitacoes')
    .select(
      'id, numero, tipo, status, data_necessidade, observacao, created_at, solicitante:crm_leads!solicitante_pessoa_id(nome)',
    )
    .eq('id', id)
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()

  if (!sol) {
    return <p className="text-sm text-gray-400">Solicitação não encontrada.</p>
  }

  if (sol.status === 'rascunho') {
    redirect('/cockpit/compras/solicitacoes')
  }

  const [{ data: itens }, { count: cotCount }] = await Promise.all([
    supabase
      .from('com_solicitacao_itens')
      .select('descricao, quantidade, unidade, sku_id')
      .eq('solicitacao_id', sol.id)
      .eq('empresa_id', me!.empresa_id),
    supabase
      .from('com_cotacoes')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', me!.empresa_id)
      .eq('solicitacao_id', sol.id),
  ])

  const temCotacao = (cotCount || 0) > 0
  const solicitanteRaw = sol.solicitante as
    | { nome?: string | null }
    | { nome?: string | null }[]
    | null
  const solicitante = Array.isArray(solicitanteRaw) ? solicitanteRaw[0] : solicitanteRaw
  const solicitanteNome = solicitante?.nome?.trim() || '—'
  const podeCotacao =
    sol.status === 'registrada' &&
    !temCotacao &&
    (isSuper || hasPermission(me, 'compras_cotacoes', 'create'))
  const podeEditar =
    !temCotacao && (isSuper || hasPermission(me, 'compras_solicitacoes', 'edit'))
  const podeExcluir =
    !temCotacao && (isSuper || hasPermission(me, 'compras_solicitacoes', 'delete'))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Solicitação</p>
          <h1 className="text-xl font-semibold text-white">{sol.numero}</h1>
          <p className="text-sm text-gray-500">
            {TIPO_COMPRA_LABEL[sol.tipo as TipoCompra]} · {sol.status}
            {temCotacao ? ' · com cotação' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {podeCotacao ? <AbrirCotacaoButton solicitacaoId={sol.id} /> : null}
          {podeEditar ? (
            <Link
              href={`/cockpit/compras/solicitacoes/${sol.id}/editar`}
              className="inline-flex items-center gap-2 rounded-xl border border-[#ffffff14] px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-[#ffffff08]"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
          ) : null}
          {podeExcluir ? (
            <ExcluirSolicitacaoButton solicitacaoId={sol.id} numero={sol.numero} />
          ) : null}
          <Link href="/cockpit/compras/solicitacoes" className="text-sm text-[#2BAADF]">
            Voltar à lista
          </Link>
        </div>
      </div>
      {temCotacao ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-200/90">
          Com cotação vinculada: edição e exclusão ficam bloqueadas.
        </p>
      ) : null}
      <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 text-sm text-gray-300">
        <p>Solicitante: {solicitanteNome}</p>
        <p className="mt-2">Necessidade: {sol.data_necessidade || '—'}</p>
        <p className="mt-2">Observação: {sol.observacao || '—'}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Qtd</th>
              <th className="px-4 py-3">UM</th>
            </tr>
          </thead>
          <tbody>
            {(itens || []).map((item, i) => (
              <tr key={i} className="border-t border-[#ffffff08]">
                <td className="px-4 py-3 text-white">{item.descricao}</td>
                <td className="px-4 py-3 text-gray-300">{item.quantidade}</td>
                <td className="px-4 py-3 text-gray-400">{item.unidade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
