import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import {
  PEDIDO_STATUS_LABEL,
  pedidoEditavel,
  pedidoRecebivel,
  pedidoTemPdf,
} from '@/lib/compras/pedido-status'
import { observacaoDoPedido } from '@/lib/compras/pedido-observacao'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import AprovarPedidoForm from './AprovarPedidoForm'
import PedidoPdfButton from './PedidoPdfButton'

export const metadata = { title: 'Pedido de compra | HuginFlow' }

export default async function PedidoDetalhePage({
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
        hasPermission(me, 'compras_pedidos', 'view')))

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
  const { data: pedido } = await supabase
    .from('com_pedidos')
    .select(
      'id, numero, tipo, status, valor_total, previsao_chegada, origem, observacao, cotacao_id, cancelamento_motivo, cancelado_em, fornecedor:crm_leads!fornecedor_id(nome)',
    )
    .eq('id', id)
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()

  if (!pedido) {
    return <p className="text-sm text-gray-400">Pedido não encontrado.</p>
  }

  if (pedido.status === 'rascunho') {
    redirect('/cockpit/compras/pedidos')
  }

  const observacao = await observacaoDoPedido(supabase, me!.empresa_id, pedido)

  const { data: itens } = await supabase
    .from('com_pedido_itens')
    .select('id, descricao, quantidade, unidade, preco_unitario')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me!.empresa_id)

  const { data: recebimentos } = await supabase
    .from('com_recebimentos')
    .select(
      'id, created_at, observacao, usuario:usuarios!usuario_id(nome), itens:com_recebimento_itens(pedido_item_id, quantidade, divergencia)',
    )
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me!.empresa_id)
    .order('created_at', { ascending: false })

  const { data: aprovacoes } = await supabase
    .from('com_pedido_aprovacoes')
    .select('nivel, decisao, motivo, decidido_em, aprovador:usuarios!usuario_id(nome)')
    .eq('pedido_id', pedido.id)
    .eq('empresa_id', me!.empresa_id)
    .order('nivel')

  const { data: empresa } = await supabase
    .from('empresas')
    .select('nome')
    .eq('id', me!.empresa_id)
    .maybeSingle()

  const { data: configCaixa } = await supabase
    .from('com_config')
    .select('recebimento_por_caixa')
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()
  const porCaixa = Boolean(configCaixa?.recebimento_por_caixa)

  const podeAprovar =
    pedido.status === 'aguardando_aprovacao' &&
    (isSuper || hasPermission(me, 'compras_aprovacao', 'edit'))

  const temRecebimento = (recebimentos || []).length > 0
  const podeEditar =
    (isSuper || hasPermission(me, 'compras_pedidos', 'edit')) &&
    pedidoEditavel(pedido.status) &&
    !temRecebimento
  const podeReceber =
    (isSuper ||
      hasPermission(me, 'compras_conferencia', 'create') ||
      hasPermission(me, 'compras_conferencia', 'edit')) &&
    pedidoRecebivel(pedido.status)

  const recebidoPorItem = new Map<string, number>()
  for (const rec of recebimentos || []) {
    const linhas = rec.itens as { pedido_item_id: string; quantidade: number }[] | null
    for (const linha of linhas || []) {
      recebidoPorItem.set(
        linha.pedido_item_id,
        (recebidoPorItem.get(linha.pedido_item_id) || 0) + Number(linha.quantidade),
      )
    }
  }

  const lead = pedido.fornecedor as { nome?: string } | { nome?: string }[] | null
  const fornecedor = Array.isArray(lead) ? lead[0]?.nome : lead?.nome
  const empresaNome = empresa?.nome || null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Pedido</p>
          <h1 className="text-xl font-semibold text-white">{pedido.numero}</h1>
          <p className="text-sm text-gray-500">
            {fornecedor || '—'} · {TIPO_COMPRA_LABEL[pedido.tipo as TipoCompra]} ·{' '}
            {PEDIDO_STATUS_LABEL[pedido.status] || pedido.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {podeEditar ? (
            <Link
              href={`/cockpit/compras/pedidos/${pedido.id}/editar`}
              className="rounded-xl border border-[#ffffff14] px-3 py-2 text-sm text-gray-200"
            >
              Editar
            </Link>
          ) : null}
          {podeEditar ? (
            <Link
              href={`/cockpit/compras/pedidos/${pedido.id}/cancelar`}
              className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-300"
            >
              Cancelar
            </Link>
          ) : null}
          {podeReceber && !porCaixa ? (
            <Link
              href={`/cockpit/compras/pedidos/${pedido.id}/receber`}
              className="rounded-xl bg-emerald-600/80 px-3 py-2 text-sm font-semibold text-white"
            >
              Receber
            </Link>
          ) : null}
          {porCaixa && (pedidoRecebivel(pedido.status) || pedido.status === 'recebido') ? (
            <Link
              href={`/cockpit/compras/pedidos/${pedido.id}/caixas`}
              className="rounded-xl bg-emerald-600/80 px-3 py-2 text-sm font-semibold text-white"
            >
              Caixas
            </Link>
          ) : null}
          {pedidoTemPdf(pedido.status) ? (
            <PedidoPdfButton
              pedido={{
                numero: pedido.numero,
                fornecedorNome: fornecedor || '—',
                tipoLabel: TIPO_COMPRA_LABEL[pedido.tipo as TipoCompra],
                previsao: pedido.previsao_chegada,
                observacao,
                valorTotal: Number(pedido.valor_total),
                itens: itens || [],
                empresaNome,
              }}
            />
          ) : null}
          <Link href="/cockpit/compras/pedidos" className="text-sm text-[#2BAADF]">
            Voltar à lista
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 text-sm text-gray-300">
          <p>
            Valor:{' '}
            {Number(pedido.valor_total).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </p>
          <p className="mt-2">Previsão: {pedido.previsao_chegada || '—'}</p>
          <p className="mt-2">Origem: {pedido.origem}</p>
          <p className="mt-2">Observação: {observacao || '—'}</p>
          {pedido.status === 'cancelado' ? (
            <p className="mt-2">
              Cancelado
              {pedido.cancelado_em
                ? ` em ${new Date(pedido.cancelado_em).toLocaleString('pt-BR')}`
                : ''}
              : {pedido.cancelamento_motivo || '—'}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Quem liberou</h3>
          {(aprovacoes || []).length ? (
            <ul className="space-y-2 text-sm text-gray-300">
              {(aprovacoes || []).map((a, i) => {
                const u = a.aprovador as { nome?: string } | { nome?: string }[] | null
                const nome = Array.isArray(u) ? u[0]?.nome : u?.nome
                return (
                  <li key={i}>
                    Nível {a.nivel}: {a.decisao} por {nome || '—'} em{' '}
                    {new Date(a.decidido_em).toLocaleString('pt-BR')}
                    {a.motivo ? ` — ${a.motivo}` : ''}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Ainda sem decisão de alçada.</p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Previsão</th>
              <th className="px-4 py-3">Qtd</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">Preço total</th>
              <th className="px-4 py-3">Recebido</th>
            </tr>
          </thead>
          <tbody>
            {(itens || []).map((item) => {
              const unitario = Number(item.preco_unitario)
              const total = Number(item.quantidade) * unitario
              const previsao = pedido.previsao_chegada
                ? new Date(`${pedido.previsao_chegada}T12:00:00`).toLocaleDateString('pt-BR')
                : '—'
              return (
                <tr key={item.id} className="border-t border-[#ffffff08]">
                  <td className="px-4 py-2 text-white">{item.descricao}</td>
                  <td className="px-4 py-2 text-gray-300">{fornecedor || '—'}</td>
                  <td className="px-4 py-2 text-gray-300">{previsao}</td>
                  <td className="px-4 py-2 text-gray-300">
                    {item.quantidade} {item.unidade}
                  </td>
                  <td className="px-4 py-2 text-gray-300">
                    {unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-2 text-white">
                    {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-2 text-gray-300">
                    {recebidoPorItem.get(item.id) || 0} {item.unidade}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {temRecebimento ? (
        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Recebimentos</h3>
          <ul className="space-y-3 text-sm text-gray-300">
            {(recebimentos || []).map((rec) => {
              const u = rec.usuario as { nome?: string } | { nome?: string }[] | null
              const nome = Array.isArray(u) ? u[0]?.nome : u?.nome
              const linhas = (rec.itens || []) as Array<{
                quantidade: number
                divergencia: string | null
              }>
              return (
                <li key={rec.id}>
                  {new Date(rec.created_at).toLocaleString('pt-BR')} · {nome || '—'} ·{' '}
                  {linhas.length} item(ns)
                  {rec.observacao ? ` — ${rec.observacao}` : ''}
                  {linhas.some((l) => l.divergencia) ? ' · com divergência' : ''}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {podeAprovar ? <AprovarPedidoForm pedidoId={pedido.id} /> : null}
    </div>
  )
}
