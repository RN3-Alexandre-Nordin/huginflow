'use client'

import {
  ClipboardCheck,
  PackageCheck,
  ArrowLeftRight,
  Truck,
  Package,
  Activity,
  ArrowUpRight,
  Boxes,
} from 'lucide-react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getDashboardRefetchInterval } from '@/lib/query/polling'
import { getEstoqueCockpitMetrics } from '../estoque-cockpit-actions'
import { useCockpitPageTitle } from './CockpitPageTitleContext'

export default function EstoqueOperatorDashboard({
  userId,
}: {
  userName: string
  userId: string
}) {
  useCockpitPageTitle('Cockpit de Estoque', {
    icon: Boxes,
    iconClassName: 'text-[#2BAADF]',
  })

  const { data: result, isLoading } = useQuery({
    queryKey: ['cockpit-estoque-metrics', userId],
    queryFn: () => getEstoqueCockpitMetrics(),
    refetchInterval: getDashboardRefetchInterval(),
  })

  const metrics = {
    movimentosHoje: 0,
    atendimentosHoje: 0,
    remessasHoje: 0,
    aprovacoesHoje: 0,
    canApprove: false,
    filaPendenciasTitulo: 'Fila de atendimento',
    filaPendenciasHref: '/cockpit/estoque/requisicoes',
    ...(result?.data ?? {}),
    filaPendencias: result?.data?.filaPendencias ?? [],
    remessasPendentes: result?.data?.remessasPendentes ?? [],
  }

  return (
    <div className="h-full flex flex-col min-h-0 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
      <div className="flex-shrink-0 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/cockpit/estoque/cardex"
          className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-cyan-500/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-md flex items-center gap-1">
              Hoje <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
          <div>
            <p className="text-3xl font-black text-white">
              {isLoading ? '—' : metrics.movimentosHoje}
            </p>
            <p className="text-sm font-medium text-gray-500 mt-1">Meus movimentos</p>
          </div>
        </Link>

        <Link
          href="/cockpit/estoque/requisicoes"
          className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-amber-500/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <PackageCheck className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md flex items-center gap-1">
              Atendi <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
          <div>
            <p className="text-3xl font-black text-white">
              {isLoading ? '—' : metrics.atendimentosHoje}
            </p>
            <p className="text-sm font-medium text-gray-500 mt-1">Baixas de requisição</p>
          </div>
        </Link>

        <Link
          href="/cockpit/estoque/remessas"
          className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-orange-500/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform">
              <Truck className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-orange-400 bg-orange-500/10 px-2 py-1 rounded-md flex items-center gap-1">
              Remessas <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
          <div>
            <p className="text-3xl font-black text-white">
              {isLoading ? '—' : metrics.remessasHoje}
            </p>
            <p className="text-sm font-medium text-gray-500 mt-1">Mov. de remessa hoje</p>
          </div>
        </Link>

        <Link
          href={
            metrics.canApprove
              ? '/cockpit/estoque/requisicoes/aprovacao'
              : '/cockpit/estoque/requisicoes'
          }
          className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-purple-500/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 px-2 py-1 rounded-md flex items-center gap-1">
              Decidi <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
          <div>
            <p className="text-3xl font-black text-white">
              {isLoading ? '—' : metrics.aprovacoesHoje}
            </p>
            <p className="text-sm font-medium text-gray-500 mt-1">Aprovações / rejeições</p>
          </div>
        </Link>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-2">
        <div className="flex flex-col bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 relative overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-[#2BAADF]" />
              {metrics.filaPendenciasTitulo}
            </h3>
            <Link
              href={metrics.filaPendenciasHref}
              className="text-xs text-[#2BAADF] hover:underline font-medium"
            >
              Ver Todos
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar-sidebar pr-1">
            {isLoading ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 bg-[#ffffff05] rounded-xl border border-[#ffffff0a]"
                  />
                ))}
              </div>
            ) : metrics.filaPendencias.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-[#ffffff0a] rounded-xl">
                <Package className="w-8 h-8 text-gray-600 mb-3" />
                <p className="text-sm font-bold text-gray-400">Nada pendente</p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Sem requisições na sua fila agora.
                </p>
              </div>
            ) : (
              metrics.filaPendencias.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-4 p-3 rounded-xl hover:bg-[#ffffff05] transition-colors border border-transparent hover:border-[#ffffff0a]"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#2BAADF]/10 flex items-center justify-center text-[#2BAADF] text-xs font-black">
                    {item.numero.replace(/\D/g, '').slice(-3) || 'RQ'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5 gap-2">
                      <p className="text-sm font-semibold text-white truncate">
                        {item.numero}
                      </p>
                      <span className="text-[10px] text-gray-500 shrink-0">
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {item.label}
                      {item.pessoa ? ` · ${item.pessoa}` : ''}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 relative overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              Remessas pendentes
            </h3>
            <Link
              href="/cockpit/estoque/remessas?status=aberta"
              className="text-xs text-emerald-400 hover:underline font-medium"
            >
              Ver Todas
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar-sidebar pr-1">
            {isLoading ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 bg-[#ffffff05] rounded-xl border border-[#ffffff0a]"
                  />
                ))}
              </div>
            ) : metrics.remessasPendentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-[#ffffff0a] rounded-xl">
                <Truck className="w-8 h-8 text-gray-600 mb-3" />
                <p className="text-sm font-bold text-gray-400">Nenhuma remessa aberta</p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Envios aguardando retorno ou baixa aparecem aqui.
                </p>
              </div>
            ) : (
              metrics.remessasPendentes.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-4 p-3 rounded-xl hover:bg-[#ffffff05] transition-colors border border-transparent hover:border-[#ffffff0a]"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5 gap-2">
                      <p className="text-sm font-semibold text-white truncate">
                        {item.numero}
                      </p>
                      <span className="text-[10px] text-gray-500 shrink-0">
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {item.label}
                      {item.pessoa ? ` · ${item.pessoa}` : ''}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
