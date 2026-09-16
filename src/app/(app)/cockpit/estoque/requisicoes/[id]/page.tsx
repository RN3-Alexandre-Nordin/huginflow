import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Layers,
  Lock,
  MapPin,
  Send,
  User,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import BackTextButton from '@/components/BackTextButton'
import EstoqueAreaNav from '@/components/estoque/EstoqueAreaNav'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { podeAprovarRequisicao } from '@/lib/estoque/aprovacao-requisicao'
import AtendimentoPanel from './AtendimentoPanel'

export const metadata = { title: 'Detalhes da Requisição | HuginFlow' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EstoqueRequisicaoDetalhesPage({ params }: PageProps) {
  const { id } = await params
  const me = await getMyProfile()
  const isSuperAdmin = me?.role_global === 'superadmin'

  const canView =
    isSuperAdmin ||
    hasPermission(me, 'estoque_requisicoes', 'view') ||
    hasPermission(me, 'estoque', 'view')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar detalhes de requisições.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Início
        </BackTextButton>
      </div>
    )
  }

  const canAtender =
    isSuperAdmin ||
    hasPermission(me, 'estoque_atendimento', 'create') ||
    hasPermission(me, 'estoque_atendimento', 'edit') ||
    hasPermission(me, 'estoque', 'edit')

  const empresaId = me?.empresa_id ?? ''
  const supabase = await createClient()

  // 1. Carrega cabeçalho da requisição
  let reqQuery = supabase
    .from('est_requisicoes')
    .select(
      `
      *,
      crm_leads!est_requisicoes_requisitante_pessoa_id_fkey (id, nome, documento),
      usuarios!est_requisicoes_solicitante_usuario_id_fkey (id, nome_completo, email),
      aprovador:usuarios!est_requisicoes_aprovador_usuario_id_fkey (id, nome_completo),
      departamentos (id, nome)
    `
    )
    .eq('id', id)

  if (!isSuperAdmin) {
    reqQuery = reqQuery.eq('empresa_id', empresaId)
  }

  const { data: requisicao, error } = await reqQuery.maybeSingle()

  if (error || !requisicao) {
    notFound()
  }

  // 2. Carrega itens da requisição
  const { data: itens } = await supabase
    .from('est_requisicao_itens')
    .select(
      `
      *,
      cad_skus (id, codigo, nome, unidade_estoque),
      cad_locais_estoque (id, codigo, nome)
    `
    )
    .eq('requisicao_id', id)
    .order('created_at', { ascending: true })

  // 3. Carrega configuração do módulo de estoque
  const { data: config } = await supabase
    .from('est_config')
    .select('*')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  const canApprove = podeAprovarRequisicao(me, config)

  // 4. Carrega locais ativos
  const { data: locais } = await supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome, eh_principal')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('eh_principal', { ascending: false })
    .order('codigo')

  // 5. Carrega saldos atuais dos SKUs envolvidos (por local — atendimento usa o local selecionado)
  const skuIds = (itens || []).map((i) => i.sku_id).filter(Boolean)
  let saldosMap: Record<string, number> = {}
  let saldosRows: Array<{ sku_id: string; local_id: string; quantidade: number }> = []

  if (skuIds.length > 0) {
    const { data: saldosData } = await supabase
      .from('est_saldos')
      .select('sku_id, local_id, quantidade')
      .eq('empresa_id', empresaId)
      .in('sku_id', skuIds)

    saldosRows = (saldosData || []) as Array<{
      sku_id: string
      local_id: string
      quantidade: number
    }>

    saldosMap = saldosRows.reduce((acc: Record<string, number>, curr) => {
      acc[curr.sku_id] = (acc[curr.sku_id] || 0) + Number(curr.quantidade)
      return acc
    }, {})
  }

  const itensUi = (itens || []).map((it) => {
    const sku = it.cad_skus as {
      codigo?: string
      nome?: string
      unidade_estoque?: string
    } | null
    return {
      id: it.id as string,
      sku_id: it.sku_id as string,
      sku_codigo: sku?.codigo || '—',
      sku_nome: sku?.nome || '',
      unidade: sku?.unidade_estoque || 'UN',
      quantidade_pedida: Number(it.quantidade_pedida),
      quantidade_atendida: Number(it.quantidade_atendida),
      quantidade_pendente: Number(it.quantidade_pendente),
      status_item: String(it.status_item || 'pendente'),
      local_id: (it.local_id as string | null) || null,
    }
  })

  const requisitante = requisicao.crm_leads as { id?: string; nome?: string; documento?: string } | null
  const solicitante = requisicao.usuarios as { id?: string; nome_completo?: string; email?: string } | null
  const aprovador = requisicao.aprovador as { id?: string; nome_completo?: string } | null
  const departamento = requisicao.departamentos as { id?: string; nome?: string } | null
  const valorEstimado = Number(requisicao.valor_estimado || 0)
  const aprovacaoAtiva = Boolean(config?.req_aprovacao_ativa)

  return (
    <div className="space-y-6 pb-20 font-sans">
      <EstoqueAreaNav />

      {/* Header com Navegação */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs">
            <Link
              href="/cockpit/estoque/requisicoes"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Requisições
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-400 font-mono">{requisicao.numero}</span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-purple-400" />
            Requisição: {requisicao.numero}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={requisicao.status} />
        </div>
      </div>

      {/* Metadados da Requisição */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 shadow-xl grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-gray-500 block mb-1">Requisitante</span>
          <div className="flex items-center gap-1.5 text-white font-medium">
            <User className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span className="truncate">{requisitante?.nome || '—'}</span>
          </div>
          {(requisitante?.documento) && (
            <span className="text-[10px] text-gray-500 font-mono block mt-0.5">
              {requisitante.documento}
            </span>
          )}
        </div>

        <div>
          <span className="text-gray-500 block mb-1">Solicitante (Auditoria)</span>
          <div className="flex items-center gap-1.5 text-white">
            <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{solicitante?.nome_completo || solicitante?.email || '—'}</span>
          </div>
          {departamento && (
            <span className="text-[10px] text-gray-400 block mt-0.5">
              Setor: {departamento.nome}
            </span>
          )}
        </div>

        <div>
          <span className="text-gray-500 block mb-1">Origem / Data</span>
          <div className="flex items-center gap-1.5 text-white">
            <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{new Date(requisicao.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            Canal: {requisicao.origem === 'planilha' ? 'Planilha CSV' : 'Digitação Manual'}
          </span>
        </div>

        <div>
          <span className="text-gray-500 block mb-1">Workflow / Observação</span>
          {requisicao.workflow_card_id ? (
            <Link
              href={`/cockpit/crm/deals/${requisicao.workflow_card_id}`}
              className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:underline font-medium"
            >
              Card de Aprovação
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <span className="text-gray-400 text-[11px]">Sem card de workflow</span>
          )}
          {requisicao.observacao && (
            <span className="text-[10px] text-gray-400 block truncate mt-0.5" title={requisicao.observacao}>
              {requisicao.observacao}
            </span>
          )}
        </div>
      </div>

      {/* Valor estimado + auditoria de aprovação */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl p-5 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div>
          <span className="text-gray-500 block mb-1">Valor estimado (custo)</span>
          <span className="text-white font-mono font-semibold text-sm">
            {valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            Σ quantidade × preço de custo do SKU
          </span>
        </div>
        <div>
          <span className="text-gray-500 block mb-1">Aprovação interna</span>
          {aprovacaoAtiva ? (
            <span className="text-amber-400 text-[11px] font-medium">
              Exigida conforme parâmetros da empresa
            </span>
          ) : (
            <span className="text-gray-400 text-[11px]">Desligada na configuração</span>
          )}
          {Number(config?.req_aprovacao_valor_minimo || 0) > 0 && (
            <span className="text-[10px] text-gray-500 block mt-0.5">
              Mínimo:{' '}
              {Number(config?.req_aprovacao_valor_minimo || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </span>
          )}
        </div>
        <div>
          <span className="text-gray-500 block mb-1">Decisão registrada</span>
          {aprovador?.nome_completo && requisicao.aprovado_em ? (
            <>
              <div className="flex items-center gap-1.5 text-white">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>
                  {requisicao.aprovacao_resultado === 'rejeitada' ? 'Rejeitada' : 'Aprovada'} por{' '}
                  {aprovador.nome_completo}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 block mt-0.5">
                {new Date(requisicao.aprovado_em).toLocaleString('pt-BR')}
              </span>
            </>
          ) : requisicao.status === 'pendente_aprovacao' ? (
            <span className="text-purple-400 text-[11px]">Aguardando aprovador</span>
          ) : (
            <span className="text-gray-400 text-[11px]">Sem decisão manual (auto ou rascunho)</span>
          )}
        </div>
      </div>

      {/* Painel de Transição e Atendimento */}
      <AtendimentoPanel
        requisicaoId={requisicao.id}
        status={requisicao.status}
        canApprove={canApprove}
        canAtender={canAtender}
        locais={locais || []}
        modoSaldo={config?.req_saldo_insuficiente_modo || 'atende_parcial_pendente'}
        itens={itensUi}
        saldos={saldosRows}
      />

      {/* Tabela de Itens */}
      <div className="bg-[#121820] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-[#ffffff08] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Itens Solicitados</h2>
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
                <th className="py-3 px-4 text-right">Pedida</th>
                <th className="py-3 px-4 text-right">Atendida</th>
                <th className="py-3 px-4 text-right">Pendente</th>
                <th className="py-3 px-4 text-right">Saldo (todos)</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff05]">
              {itens?.map((it, idx) => {
                const sku = it.cad_skus as { id?: string; codigo?: string; nome?: string; unidade_estoque?: string } | null
                const saldoAtual = saldosMap[it.sku_id] || 0
                const isSemSaldo = saldoAtual < Number(it.quantidade_pendente)
                const um = sku?.unidade_estoque || 'UN'

                return (
                  <tr key={it.id} className="hover:bg-[#ffffff03] transition-colors">
                    <td className="py-3.5 px-4 font-mono text-gray-500">{idx + 1}</td>
                    <td className="py-3.5 px-4 min-w-0">
                      {sku ? (
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-white block">
                            {sku.codigo}
                          </span>
                          <span className="text-[11px] text-gray-400 block truncate max-w-xs">
                            {sku.nome}
                          </span>
                        </div>
                      ) : (
                        <span className="text-red-400 font-mono">Não encontrado</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-white">
                      {it.quantidade_pedida}
                      <span className="ml-1 text-[10px] text-gray-600">{um}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-400">
                      {it.quantidade_atendida}
                      <span className="ml-1 text-[10px] text-gray-600">{um}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-400">
                      {it.quantidade_pendente}
                      <span className="ml-1 text-[10px] text-gray-600">{um}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`inline-flex items-center justify-end gap-1 rounded px-2 py-0.5 font-mono text-[11px] tabular-nums ${
                          isSemSaldo && Number(it.quantidade_pendente) > 0
                            ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                            : 'text-gray-300 bg-[#ffffff05]'
                        }`}
                      >
                        {saldoAtual}
                        <span className="text-gray-600">{um}</span>
                        {isSemSaldo && Number(it.quantidade_pendente) > 0 && (
                          <AlertTriangle className="h-3 w-3 text-red-400" />
                        )}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <ItemStatusBadge status={it.status_item} />
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
  if (status === 'atendida_total' || status === 'atendida') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Totalmente Atendida
      </span>
    )
  }
  if (status === 'atendida_parcial' || status === 'parcialmente_atendida') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <AlertTriangle className="h-3.5 w-3.5" />
        Parcialmente Atendida
      </span>
    )
  }
  if (status === 'aprovada') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Aprovada para Atendimento
      </span>
    )
  }
  if (status === 'pendente_aprovacao' || status === 'enviada') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
        <Send className="h-3.5 w-3.5" />
        Aguardando Aprovação
      </span>
    )
  }
  if (status === 'rejeitada') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
        <XCircle className="h-3.5 w-3.5" />
        Rejeitada
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
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
      Rascunho
    </span>
  )
}

function ItemStatusBadge({ status }: { status: string }) {
  if (status === 'atendido') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        Atendido
      </span>
    )
  }
  if (status === 'parcial') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        Parcial
      </span>
    )
  }
  if (status === 'pulado') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
        Pulado (s/ saldo)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
      Pendente
    </span>
  )
}
