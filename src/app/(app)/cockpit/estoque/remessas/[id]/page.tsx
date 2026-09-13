import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import {
  Building2,
  Calendar,
  CheckCircle2,
  Lock,
  MapPin,
  Truck,
  XCircle,
  AlertTriangle,
  FileText,
  ArrowDownLeft,
} from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { MOTIVOS_REMESSA } from '@/lib/estoque/operacoes-avancadas'

export const metadata = { title: 'Detalhes da Remessa | HuginFlow' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EstoqueRemessaDetalhesPage({ params }: PageProps) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar detalhes de remessas.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canEdit =
    isSuperAdmin ||
    hasPermission(me, 'estoque_remessas', 'edit') ||
    hasPermission(me, 'estoque', 'edit')

  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  // 1. Carrega Remessa
  let remQuery = supabase
    .from('est_remessa_lotes')
    .select(
      `
      *,
      crm_leads (id, nome, documento, papeis),
      cad_locais_estoque (id, codigo, nome)
    `
    )
    .eq('id', id)

  if (!isSuperAdmin) {
    remQuery = remQuery.eq('empresa_id', empresaId)
  }

  const { data: remessa, error } = await remQuery.maybeSingle()

  if (error) {
    console.error('[estoque/remessas/[id]] falha ao carregar remessa:', error.message)
    notFound()
  }
  if (!remessa) {
    notFound()
  }

  // 2. Carrega Itens da Remessa (local de saída por linha)
  const { data: itens } = await supabase
    .from('est_remessa_itens')
    .select(
      `
      *,
      cad_skus (id, codigo, nome, unidade_estoque),
      local_origem:cad_locais_estoque!est_remessa_itens_local_origem_id_fkey (id, codigo, nome)
    `
    )
    .eq('remessa_id', id)
    .order('created_at', { ascending: true })

  const terceiro = remessa.crm_leads as {
    id?: string
    nome?: string
    documento?: string | null
    papeis?: string[] | null
  } | null
  const local = remessa.cad_locais_estoque as { id?: string; codigo?: string; nome?: string } | null

  const motivoInfo = MOTIVOS_REMESSA.find((m) => m.codigo === remessa.motivo_codigo)
  const motivoLabel = remessa.motivo_codigo === 'outro'
    ? `Outro: ${remessa.motivo_texto}`
    : motivoInfo?.label || remessa.motivo_codigo

  const temEmPoder = (itens || []).some((it) => {
    const emPoder =
      Number(it.quantidade_enviada) -
      Number(it.quantidade_retornada || 0) -
      Number((it as { quantidade_baixada?: number }).quantidade_baixada || 0)
    return emPoder > 1e-9
  })

  const podeRetornar =
    canEdit &&
    remessa.status !== 'fechada' &&
    remessa.status !== 'cancelada' &&
    temEmPoder

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header com Navegação */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs">
            <Link
              href="/cockpit/estoque/remessas"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Remessas
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-400 font-mono">{remessa.numero}</span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Truck className="h-5 w-5 text-purple-400" />
            Remessa: {remessa.numero}
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <StatusBadge status={remessa.status} />
          {podeRetornar && (
            <Link
              href={`/cockpit/estoque/remessas/${id}/retorno`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
            >
              <ArrowDownLeft className="h-4 w-4" />
              Registrar Retorno
            </Link>
          )}
        </div>
      </div>

      {/* Metadados da Remessa */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 shadow-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-gray-500 block mb-1">Destinatário (Pessoa)</span>
          <div className="flex items-center gap-1.5 text-white font-medium">
            <Building2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span className="truncate">{terceiro?.nome || '—'}</span>
          </div>
          {(terceiro?.documento || (terceiro?.papeis && terceiro.papeis.length > 0)) && (
            <span className="text-[10px] text-gray-500 font-mono block mt-0.5">
              {[terceiro.documento, ...(terceiro.papeis || [])].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        <div>
          <span className="text-gray-500 block mb-1">Finalidade / Motivo</span>
          <span className="text-white block font-medium">{motivoLabel}</span>
          {remessa.documento && (
            <span className="text-[10px] text-gray-400 font-mono block mt-0.5">
              Doc/OS: {remessa.documento}
            </span>
          )}
        </div>

        <div>
          <span className="text-gray-500 block mb-1">Envio / Retorno</span>
          <div className="flex items-center gap-1.5 text-white">
            <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{new Date(remessa.enviado_em || remessa.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
          {remessa.previsao_retorno_em && (
            <span className="text-[10px] text-amber-400 font-mono block mt-0.5">
              Previsão: {new Date(remessa.previsao_retorno_em).toLocaleDateString('pt-BR')}
            </span>
          )}
          {local && (
            <span className="text-[10px] text-gray-500 font-mono block mt-0.5">
              Ref. lote: {local.codigo} — {local.nome}
            </span>
          )}
        </div>

        <div>
          <span className="text-gray-500 block mb-1">Observação do lote</span>
          <div className="flex items-start gap-1.5 text-white">
            <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
            <span className="text-xs leading-snug">
              {(remessa as { observacao?: string | null }).observacao?.trim() || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabela de Itens */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-[#ffffff08] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Itens em Poder do Terceiro</h2>
          <span className="text-xs text-gray-400">
            {itens?.length || 0} item(ns)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0e1319] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
              <tr>
                <th className="py-3 px-4 w-12">#</th>
                <th className="py-3 px-4">SKU / Produto</th>
                <th className="py-3 px-4">Local de Saída</th>
                <th className="py-3 px-4 text-center">Enviada</th>
                <th className="py-3 px-4 text-center">Retornada</th>
                <th className="py-3 px-4 text-center">Baixada</th>
                <th className="py-3 px-4 text-center">Em Poder</th>
                <th className="py-3 px-4 text-center">Situação</th>
                <th className="py-3 px-4 text-right">Cardex</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff05]">
              {itens?.map((it, idx) => {
                const sku = it.cad_skus as { id?: string; codigo?: string; nome?: string; unidade_estoque?: string } | null
                const localItem = (
                  it as {
                    local_origem?: { id?: string; codigo?: string; nome?: string } | null
                  }
                ).local_origem
                const baixada = Number((it as { quantidade_baixada?: number }).quantidade_baixada || 0)
                const emPoder =
                  Number(it.quantidade_enviada) - Number(it.quantidade_retornada || 0) - baixada

                return (
                  <tr key={it.id} className="hover:bg-[#ffffff03] transition-colors">
                    <td className="py-3.5 px-4 font-mono text-gray-500">{idx + 1}</td>
                    <td className="py-3.5 px-4">
                      {sku ? (
                        <div>
                          <span className="font-mono font-bold text-white block">
                            {sku.codigo}
                          </span>
                          <span className="text-[11px] text-gray-400 block truncate max-w-xs">
                            {sku.nome}
                          </span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-white font-mono text-[11px]">
                        <MapPin className="h-3 w-3 text-gray-500 shrink-0" />
                        <span>
                          {localItem
                            ? `${localItem.codigo} — ${localItem.nome}`
                            : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-white">
                      {it.quantidade_enviada} {sku?.unidade_estoque || 'UN'}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-400">
                      {it.quantidade_retornada} {sku?.unidade_estoque || 'UN'}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-amber-400">
                      {baixada} {sku?.unidade_estoque || 'UN'}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-purple-400 text-sm">
                      {emPoder} {sku?.unidade_estoque || 'UN'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {it.status_item === 'retornado' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" />
                          Retornado
                        </span>
                      ) : it.status_item === 'parcial' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Retorno Parcial
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Em Poder do Terceiro
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {it.movimento_saida_id ? (
                        <Link
                          href={`/cockpit/estoque/cardex?movimento_id=${it.movimento_saida_id}`}
                          className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline font-mono"
                        >
                          Ver no Cardex
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {podeRetornar && (
          <div className="p-4 bg-[#0d1218] border-t border-[#ffffff08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-xs text-gray-400">
              Há material ainda em poder do terceiro. Registre o retorno físico para os depósitos da empresa.
            </span>
            <Link
              href={`/cockpit/estoque/remessas/${id}/retorno`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all"
            >
              <ArrowDownLeft className="h-3.5 w-3.5" />
              Abrir tela de retorno
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'fechada') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Fechada / Totalmente Retornada
      </span>
    )
  }
  if (status === 'parcial') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <AlertTriangle className="h-3.5 w-3.5" />
        Retorno Parcial
      </span>
    )
  }
  if (status === 'cancelada') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
        <XCircle className="h-3.5 w-3.5" />
        Cancelada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
      <Truck className="h-3.5 w-3.5" />
      Em Aberto (Em Poder)
    </span>
  )
}
