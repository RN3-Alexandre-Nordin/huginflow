import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { dataFiltroIso, textoFiltro, UUID_FILTRO } from '@/lib/compras/filtros-lista'
import { PRE_TITULO_STATUS_LABEL } from '@/lib/compras/pre-titulo-status'
import { TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import PedidosFiltros from '../pedidos/PedidosFiltros'
import { DispensarPreTituloButton, ExportarPlanilhaButton, TrazerNotasButton } from './PreTituloAcoes'

export const metadata = { title: 'Pré-títulos | HuginFlow' }

function nomeEmbed(value: { nome?: string; numero?: string } | { nome?: string; numero?: string }[] | null) {
  if (!value) return ''
  const row = Array.isArray(value) ? value[0] : value
  return row?.nome || row?.numero || ''
}

function notaRow(value: { id?: string; numero?: string; serie?: string } | { id?: string; numero?: string; serie?: string }[] | null) {
  if (!value) return null
  return Array.isArray(value) ? value[0] : value
}

function notaDoc(value: { numero?: string; serie?: string } | { numero?: string; serie?: string }[] | null) {
  const row = notaRow(value)
  if (!row?.numero) return ''
  return `${row.numero}/${row.serie || '1'}`
}

function notaId(value: { id?: string } | { id?: string }[] | null) {
  return notaRow(value)?.id || ''
}

export default async function PreTitulosPage({
  searchParams,
}: {
  searchParams: Promise<{ fornecedor?: string; data?: string; status?: string; q?: string }>
}) {
  const filtros = await searchParams
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_exportacao', 'view')))

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
  const fornecedorId = UUID_FILTRO.test(filtros.fornecedor || '') ? filtros.fornecedor! : ''
  const statusFiltro = filtros.status && PRE_TITULO_STATUS_LABEL[filtros.status] ? filtros.status : ''
  const dataFiltro = dataFiltroIso(filtros.data)
  const busca = textoFiltro(filtros.q)

  let query = supabase
    .from('com_pre_titulos')
    .select(
      'id, numero, tipo, valor, vencimento, status, created_at, nota:com_notas!nota_id(id, numero, serie), pedido:com_pedidos!pedido_id(numero), fornecedor:crm_leads!fornecedor_id(nome)',
    )
    .eq('empresa_id', me!.empresa_id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (fornecedorId) query = query.eq('fornecedor_id', fornecedorId)
  if (statusFiltro) query = query.eq('status', statusFiltro)
  if (dataFiltro) query = query.eq('vencimento', dataFiltro)
  if (busca) query = query.ilike('numero', `%${busca}%`)
  const { data, error } = await query

  const { data: fornecedores } = await supabase
    .from('crm_leads')
    .select('id, nome')
    .eq('empresa_id', me!.empresa_id)
    .eq('ativo', true)
    .contains('papeis', ['fornecedor'])
    .order('nome')
    .limit(500)

  const podeDispensar = isSuper || hasPermission(me, 'compras_exportacao', 'edit')
  const temFiltro = Boolean(fornecedorId || statusFiltro || dataFiltro || busca)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Pré-títulos</h1>
          <p className="text-sm text-gray-500">
            A nota confirmada fica aguardando o contas a pagar. Esta lista não gera título.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <TrazerNotasButton />
          <ExportarPlanilhaButton
            filtros={{ q: busca, fornecedor: fornecedorId, data: dataFiltro, status: statusFiltro }}
          />
        </div>
      </div>
      <PedidosFiltros
        fornecedores={fornecedores || []}
        statusOpcoes={Object.entries(PRE_TITULO_STATUS_LABEL).map(([id, label]) => ({ id, label }))}
        fornecedor={fornecedorId}
        data={dataFiltro}
        status={statusFiltro}
        busca={busca}
        limparHref="/cockpit/compras/pre-titulos"
        rotuloData="Vencimento"
        rotuloBusca="Pré-título"
      />
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Pré-título</th>
              <th className="px-4 py-3">Nota</th>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row) => (
              <tr key={row.id} className="border-t border-[#ffffff08]">
                <td className="px-4 py-3 font-mono text-[#2BAADF]">{row.numero}</td>
                <td className="px-4 py-3 text-gray-300">
                  {notaDoc(row.nota) ? (
                    <Link className="text-[#2BAADF]" href={`/cockpit/compras/notas/${notaId(row.nota)}`}>
                      {notaDoc(row.nota)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-gray-300">{nomeEmbed(row.pedido) || '—'}</td>
                <td className="px-4 py-3 text-gray-300">{nomeEmbed(row.fornecedor) || '—'}</td>
                <td className="px-4 py-3 text-gray-300">
                  {TIPO_COMPRA_LABEL[row.tipo as TipoCompra] || row.tipo}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {row.vencimento
                    ? new Date(`${row.vencimento}T12:00:00`).toLocaleDateString('pt-BR')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {Number(row.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {PRE_TITULO_STATUS_LABEL[row.status] || row.status}
                </td>
                <td className="px-4 py-3">
                  {podeDispensar && row.status === 'aguardando_ap' ? (
                    <DispensarPreTituloButton id={row.id} />
                  ) : null}
                </td>
              </tr>
            ))}
            {!data?.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  {temFiltro
                    ? 'Nenhum pré-título com esses filtros.'
                    : 'Nenhum pré-título. Confirme uma nota ou traga as notas já confirmadas.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
