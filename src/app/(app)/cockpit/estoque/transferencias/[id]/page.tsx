import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import BackTextButton from '@/components/BackTextButton'
import {
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  User,
  ExternalLink,
} from 'lucide-react'

export const metadata = { title: 'Lote de Transferência | HuginFlow' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TransferenciaLoteDetailPage({ params }: PageProps) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'
  const empresaId = me?.empresa_id || ''

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_transferencias', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm">Sem permissão.</div>
    )
  }

  const supabase = await createClient()

  let query = supabase
    .from('est_transferencia_lotes')
    .select(
      `
      id,
      numero,
      documento,
      observacao,
      status,
      erro_resumo,
      movimento_em,
      created_at,
      local_origem:cad_locais_estoque!est_transferencia_lotes_local_origem_id_fkey ( id, codigo, nome ),
      local_destino:cad_locais_estoque!est_transferencia_lotes_local_destino_id_fkey ( id, codigo, nome ),
      usuarios ( id, nome_completo ),
      est_transferencia_itens (
        id,
        linha,
        quantidade,
        observacao,
        status,
        erro_mensagem,
        movimento_id,
        cad_skus ( id, codigo, nome, unidade_estoque )
      )
    `
    )
    .eq('id', id)

  if (!isSuperAdmin) {
    query = query.eq('empresa_id', empresaId)
  }

  const { data: lote, error } = await query.maybeSingle()

  if (error || !lote) {
    notFound()
  }

  const origem = lote.local_origem as { codigo?: string; nome?: string } | null
  const destino = lote.local_destino as { codigo?: string; nome?: string } | null
  const usuario = lote.usuarios as { nome_completo?: string } | null
  const itens = ([...(lote.est_transferencia_itens || [])] as unknown as Array<{
    id: string
    linha: number
    quantidade: number
    observacao: string | null
    status: string
    erro_mensagem: string | null
    movimento_id: string | null
    cad_skus: {
      codigo: string
      nome: string
      unidade_estoque: string
    } | null
  }>).sort((a, b) => a.linha - b.linha)

  return (
    <div className="space-y-4 pb-20 font-sans">
      <EstoqueAreaNav />

      <BackTextButton
        fallbackHref="/cockpit/estoque/transferencias"
        className="text-xs text-gray-400 hover:text-white inline-flex"
      >
        Voltar às transferências
      </BackTextButton>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-cyan-400" />
              {lote.numero}
            </h1>
            {lote.status === 'concluido' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" />
                Concluído
              </span>
            ) : lote.status === 'parcial' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle className="h-3 w-3" />
                Parcial
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                <XCircle className="h-3 w-3" />
                {lote.status}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Lote de transferência física entre locais
          </p>
        </div>

        <Link
          href={`/cockpit/estoque/cardex?q=${encodeURIComponent(lote.numero)}`}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 shrink-0"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ver no Cardex
        </Link>
      </div>

      {lote.erro_resumo && (
        <div className="p-3 rounded-xl text-xs bg-red-500/10 border border-red-500/20 text-red-300">
          {lote.erro_resumo}
        </div>
      )}

      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Rota</p>
          <div className="flex items-center gap-2 text-white font-mono font-semibold">
            <span>{origem?.codigo || '—'}</span>
            <ArrowRight className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-cyan-300">{destino?.codigo || '—'}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {origem?.nome} → {destino?.nome}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
            <FileText className="h-3 w-3" /> Documento
          </p>
          <p className="text-white font-mono">{lote.documento || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
            <User className="h-3 w-3" /> Operador
          </p>
          <p className="text-white">{usuario?.nome_completo || 'Sistema'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Data
          </p>
          <p className="text-white font-mono">
            {new Date(lote.movimento_em || lote.created_at).toLocaleString('pt-BR')}
          </p>
        </div>
        {lote.observacao && (
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Observação
            </p>
            <p className="text-gray-300">{lote.observacao}</p>
          </div>
        )}
      </div>

      <div className="bg-[#0b0f19] border border-[#ffffff10] rounded-2xl overflow-hidden shadow-xl">
        <div className="px-4 py-3 border-b border-[#ffffff08] flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">
            Itens ({itens.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#080c14] text-[10px] uppercase tracking-wider text-gray-400 border-b border-[#ffffff08]">
              <tr>
                <th className="py-2.5 px-4">#</th>
                <th className="py-2.5 px-4">SKU</th>
                <th className="py-2.5 px-4">Quantidade</th>
                <th className="py-2.5 px-4">Obs.</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Cardex</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff05]">
              {itens.map((it) => (
                <tr key={it.id}>
                  <td className="py-3 px-4 font-mono text-gray-500">{it.linha}</td>
                  <td className="py-3 px-4">
                    <div className="font-mono font-semibold text-white">
                      {it.cad_skus?.codigo || '—'}
                    </div>
                    <div className="text-[11px] text-gray-500">{it.cad_skus?.nome}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-cyan-300 font-bold">
                    {Number(it.quantidade).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}{' '}
                    <span className="text-[10px] text-gray-500 font-normal">
                      {it.cad_skus?.unidade_estoque || 'UN'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-400 italic">
                    {it.observacao || '—'}
                  </td>
                  <td className="py-3 px-4">
                    {it.status === 'ok' ? (
                      <span className="text-emerald-400 text-[11px]">OK</span>
                    ) : (
                      <span className="text-red-400 text-[11px]" title={it.erro_mensagem || ''}>
                        Erro
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {it.movimento_id ? (
                      <Link
                        href={`/cockpit/estoque/cardex?movimento_id=${it.movimento_id}`}
                        className="text-[11px] text-amber-400 hover:underline font-mono"
                      >
                        Movimento
                      </Link>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
