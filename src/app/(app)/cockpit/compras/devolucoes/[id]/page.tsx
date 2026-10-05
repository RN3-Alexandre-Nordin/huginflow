import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import BackTextButton from '@/components/BackTextButton'
import { DEVOLUCAO_MOTIVO_LABEL, DEVOLUCAO_STATUS_LABEL } from '@/lib/compras/devolucao-status'
import { empresaHasAddon } from '@/lib/addons/entitlements'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import DevolucaoAcoes from './DevolucaoAcoes'

export const metadata = { title: 'Devolução | HuginFlow' }

function nomeEmbed(value: { nome?: string; numero?: string } | { nome?: string; numero?: string }[] | null) {
  if (!value) return ''
  const row = Array.isArray(value) ? value[0] : value
  return row?.nome || row?.numero || ''
}

export default async function DevolucaoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuper = me?.role_global === 'superadmin'
  const permitido =
    !!me &&
    (isSuper ||
      (me.empresa_id &&
        (await empresaHasAddon(me.empresa_id, 'compras')) &&
        hasPermission(me, 'compras_devolucoes', 'view')))

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
  const { data: doc } = await supabase
    .from('com_devolucoes')
    .select(
      'id, numero, status, observacao, pedido_id, pedido:com_pedidos!pedido_id(numero), fornecedor:crm_leads!fornecedor_id(nome)',
    )
    .eq('id', id)
    .eq('empresa_id', me!.empresa_id)
    .maybeSingle()

  if (!doc) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-300">Devolução não encontrada.</p>
        <Link href="/cockpit/compras/devolucoes" className="text-sm text-[#2BAADF]">
          Voltar
        </Link>
      </div>
    )
  }

  const { data: itens } = await supabase
    .from('com_devolucao_itens')
    .select('id, descricao, quantidade, unidade, motivo')
    .eq('devolucao_id', doc.id)
    .eq('empresa_id', me!.empresa_id)

  const podeConfirmar = isSuper || hasPermission(me, 'compras_devolucoes', 'edit')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">Devolução ao fornecedor</p>
          <h1 className="font-mono text-xl font-semibold text-white">{doc.numero}</h1>
          <p className="text-sm text-gray-500">
            {nomeEmbed(doc.fornecedor) || '—'} · pedido {nomeEmbed(doc.pedido) || '—'} ·{' '}
            {DEVOLUCAO_STATUS_LABEL[doc.status] || doc.status}
          </p>
        </div>
        <Link href="/cockpit/compras/devolucoes" className="text-sm text-[#2BAADF]">
          Voltar
        </Link>
      </div>
      {podeConfirmar ? <DevolucaoAcoes id={doc.id} status={doc.status} /> : null}
      <p className="text-xs text-gray-500">Este documento não emite NF-e, não gera título e não movimenta o estoque.</p>
      {doc.observacao ? <p className="text-sm text-gray-300">{doc.observacao}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">Qtd</th>
              <th className="px-4 py-2">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {(itens || []).map((item) => (
              <tr key={item.id} className="border-t border-[#ffffff08]">
                <td className="px-4 py-2 text-white">{item.descricao}</td>
                <td className="px-4 py-2 text-gray-300">
                  {item.quantidade} {item.unidade}
                </td>
                <td className="px-4 py-2 text-gray-300">
                  {DEVOLUCAO_MOTIVO_LABEL[item.motivo] || item.motivo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
