import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import {
  ArrowDownToLine,
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  Lock,
  MapPin,
  User,
  XCircle,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
} from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

export const metadata = { title: 'Detalhes da Entrada | HuginFlow' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EstoqueEntradaDetalhesPage({ params }: PageProps) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_entradas', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar detalhes de entradas.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  // 1. Carrega cabeçalho do lote
  let loteQuery = supabase
    .from('est_entrada_lotes')
    .select(
      `
      *,
      crm_leads (id, nome, documento),
      cad_locais_estoque (id, codigo, nome),
      usuarios (id, nome_completo, email)
    `
    )
    .eq('id', id)

  if (!isSuperAdmin) {
    loteQuery = loteQuery.eq('empresa_id', empresaId)
  }

  const { data: lote, error } = await loteQuery.maybeSingle()

  if (error) {
    console.error('[estoque/entradas/[id]] falha ao carregar lote:', error.message)
    notFound()
  }
  if (!lote) {
    notFound()
  }

  // 2. Carrega itens do lote
  const { data: itens } = await supabase
    .from('est_entrada_itens')
    .select(
      `
      *,
      cad_skus (id, codigo, nome, unidade_estoque)
    `
    )
    .eq('lote_id', id)
    .order('linha', { ascending: true })

  const fornecedor = lote.crm_leads as { id?: string; nome?: string; documento?: string } | null
  const local = lote.cad_locais_estoque as { id?: string; codigo?: string; nome?: string } | null
  const usuario = lote.usuarios as { id?: string; nome_completo?: string; email?: string } | null

  const totalItens = itens?.length || 0
  const itensOk = itens?.filter((i) => i.status === 'ok').length || 0
  const itensErro = itens?.filter((i) => i.status === 'erro').length || 0

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header com Navegação */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs">
            <Link
              href="/cockpit/estoque/entradas"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Entradas
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-400 font-mono">{lote.numero}</span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-400" />
            Lote de Entrada: {lote.numero}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={lote.status} />
        </div>
      </div>

      {/* Banner de erro geral se houver */}
      {lote.erro_resumo && (
        <div className="p-4 rounded-xl text-xs flex items-start gap-3 bg-red-500/10 border border-red-500/20 text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-0.5">Diagnóstico do Lote:</div>
            <div>{lote.erro_resumo}</div>
          </div>
        </div>
      )}

      {/* Metadados do Lote */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 shadow-xl grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-gray-500 block mb-1">Fornecedor</span>
          <div className="flex items-center gap-1.5 text-white font-medium">
            <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">{fornecedor?.nome || '—'}</span>
          </div>
          {fornecedor?.documento && (
            <span className="text-[10px] text-gray-500 font-mono block mt-0.5">
              {fornecedor.documento}
            </span>
          )}
        </div>

        <div>
          <span className="text-gray-500 block mb-1">Local de Destino</span>
          <div className="flex items-center gap-1.5 text-white font-mono">
            <MapPin className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span>{local ? `${local.codigo} - ${local.nome}` : '—'}</span>
          </div>
        </div>

        <div>
          <span className="text-gray-500 block mb-1">Documento / NF</span>
          <div className="flex items-center gap-1.5 text-white font-mono">
            <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{lote.documento || 'Sem documento'}</span>
          </div>
          {lote.nfe_chave && (
            <span className="text-[10px] text-gray-500 font-mono block truncate mt-0.5" title={lote.nfe_chave}>
              Chave: {lote.nfe_chave}
            </span>
          )}
        </div>

        <div>
          <span className="text-gray-500 block mb-1">Data / Usuário</span>
          <div className="flex items-center gap-1.5 text-white">
            <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{new Date(lote.movimento_em || lote.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
          {usuario && (
            <span className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
              <User className="h-3 w-3" />
              {usuario.nome_completo || usuario.email}
            </span>
          )}
        </div>
      </div>

      {/* Itens do Lote */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-[#ffffff08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Itens da Entrada</h2>
            <span className="text-xs text-gray-400 font-normal">
              ({totalItens} linhas: {itensOk} efetivadas{itensErro > 0 ? `, ${itensErro} com erro` : ''})
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0e1319] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#ffffff08]">
              <tr>
                <th className="py-3 px-4 w-12">#</th>
                <th className="py-3 px-4">SKU / Produto</th>
                <th className="py-3 px-4">Cód. Parceiro</th>
                <th className="py-3 px-4">Qtd Origem</th>
                <th className="py-3 px-4">Conversão</th>
                <th className="py-3 px-4">Qtd Estoque</th>
                <th className="py-3 px-4">Justificativa</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Cardex</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff05]">
              {itens?.map((it) => {
                const sku = it.cad_skus as { id?: string; codigo?: string; nome?: string; unidade_estoque?: string } | null
                const isOk = it.status === 'ok'

                return (
                  <tr
                    key={it.id}
                    className={`hover:bg-[#ffffff03] transition-colors ${
                      !isOk ? 'bg-red-500/5' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono text-gray-500">{it.linha}</td>
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
                        <span className="text-red-400 font-mono">Não resolvido</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-400">
                      {it.codigo_parceiro || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-300">
                      {it.quantidade_origem} {it.unidade_origem}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-400 text-[11px]">
                      {it.fator_conversao ? (
                        <span>× {it.fator_conversao}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      {it.quantidade_estoque != null ? (
                        <span className="text-emerald-400">
                          +{it.quantidade_estoque} {it.unidade_estoque}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-gray-300">
                      <div>{it.justificativa || '—'}</div>
                      {!isOk && it.erro_mensagem && (
                        <div className="text-[10px] text-red-400 mt-1 flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          <span>{it.erro_mensagem}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {isOk ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" />
                          OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          <XCircle className="h-3 w-3" />
                          {it.erro_codigo || 'Erro'}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {it.movimento_id ? (
                        <Link
                          href={`/cockpit/estoque/cardex?movimento_id=${it.movimento_id}`}
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline font-mono"
                        >
                          Ver no Cardex
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-gray-500 text-[10px]">Não gerado</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'concluido') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Lote Concluído
      </span>
    )
  }
  if (status === 'parcial') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <AlertTriangle className="h-3.5 w-3.5" />
        Entrada Parcial
      </span>
    )
  }
  if (status === 'erro') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
        <XCircle className="h-3.5 w-3.5" />
        Lote com Erro
      </span>
    )
  }
  if (status === 'processando') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <Clock className="h-3.5 w-3.5 animate-spin" />
        Processando
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
      Rascunho
    </span>
  )
}
