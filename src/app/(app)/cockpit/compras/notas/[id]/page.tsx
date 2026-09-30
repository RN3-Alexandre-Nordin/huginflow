import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { NOTA_STATUS_LABEL } from '@/lib/compras/nota-status'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import NotaAcoes from './NotaAcoes'

export const metadata = { title: 'Nota de entrada | HuginFlow' }

function nomeEmbed(value: { nome?: string; numero?: string } | { nome?: string; numero?: string }[] | null) {
  if (!value) return ''
  const row = Array.isArray(value) ? value[0] : value
  return row?.nome || row?.numero || ''
}

export default async function NotaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_notas', 'view')))

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
  const { data: nota } = await supabase
    .from('com_notas')
    .select(
      'id, numero, serie, chave, data_emissao, valor_total, status, origem, observacao, pedido_id, pedido:com_pedidos!pedido_id(numero), fornecedor:crm_leads!fornecedor_id(nome)',
    )
    .eq('id', id)
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()

  if (!nota) return <p className="text-sm text-gray-400">Nota não encontrada.</p>

  const { data: itens } = await supabase
    .from('com_nota_itens')
    .select('id, descricao, quantidade, unidade, preco_unitario')
    .eq('nota_id', nota.id)
    .eq('empresa_id', me!.empresa_id)

  const podeConfirmar = isSuper || hasPermission(me, 'compras_notas', 'edit')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Nota de entrada</p>
          <h1 className="text-xl font-semibold text-white">
            {nota.numero}/{nota.serie}
          </h1>
          <p className="text-sm text-gray-500">
            {nomeEmbed(nota.fornecedor) || '—'} · pedido {nomeEmbed(nota.pedido) || '—'} ·{' '}
            {NOTA_STATUS_LABEL[nota.status] || nota.status}
          </p>
        </div>
        <Link href="/cockpit/compras/notas" className="text-sm text-[#2BAADF]">
          Voltar
        </Link>
      </div>
      {podeConfirmar ? <NotaAcoes notaId={nota.id} status={nota.status} /> : null}
      <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-4 text-sm">
        <p className="text-gray-400">
          Emissão{' '}
          {nota.data_emissao
            ? new Date(`${nota.data_emissao}T12:00:00`).toLocaleDateString('pt-BR')
            : '—'}
          {' · '}
          {Number(nota.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          {' · '}
          {nota.origem === 'xml' ? 'XML' : 'Manual'}
        </p>
        {nota.chave ? <p className="mt-1 break-all font-mono text-xs text-gray-500">{nota.chave}</p> : null}
        {nota.observacao ? <p className="mt-2 text-gray-300">{nota.observacao}</p> : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">Qtd</th>
              <th className="px-4 py-2">Preço</th>
              <th className="px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {(itens || []).map((item) => {
              const total = Number(item.quantidade) * Number(item.preco_unitario)
              return (
                <tr key={item.id} className="border-t border-[#ffffff08]">
                  <td className="px-4 py-2 text-white">{item.descricao}</td>
                  <td className="px-4 py-2 text-gray-300">
                    {item.quantidade} {item.unidade}
                  </td>
                  <td className="px-4 py-2 text-gray-300">
                    {Number(item.preco_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-2 text-gray-300">
                    {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
