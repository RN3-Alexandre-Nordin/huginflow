import Link from "next/link"
import { redirect } from "next/navigation"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { isRn3SuperAdmin } from "@/utils/permissions"
import { Wallet, ArrowRight, Plus, List, FileText } from "lucide-react"
import { getFinanceDashboard } from "./actions"
import { formatBRL } from "@/lib/finance/format"
import { createClient } from "@/utils/supabase/server"
import EmpresaSearchSelect from "@/components/EmpresaSearchSelect"

export const metadata = { title: "Financeiro | HuginFlow" }

export default async function FinanceiroPage(props: {
  searchParams: Promise<{ empresa?: string }>
}) {
  const me = await getMyProfile()
  const searchParams = await props.searchParams

  if (!isRn3SuperAdmin(me)) redirect("/cockpit/acesso-negado")

  const canCreate = true
  const canViewContratos = true
  const canCreateContrato = true
  const isSuperAdmin = true
  const empresaFilter = isSuperAdmin ? searchParams.empresa : undefined

  const supabase = await createClient()
  const { data: empresas } = isSuperAdmin
    ? await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome")
    : { data: null }

  const dashboard =
    !isSuperAdmin || empresaFilter
      ? await getFinanceDashboard(empresaFilter)
      : null

  const cards = [
    { label: "Total em aberto", value: dashboard?.total_aberto ?? 0, accent: "#2BAADF" },
    { label: "Vencido", value: dashboard?.total_vencido ?? 0, accent: "#ef4444" },
    { label: "A vencer (7 dias)", value: dashboard?.total_a_vencer_7_dias ?? 0, accent: "#E8A317" },
    { label: "Recebido (30 dias)", value: dashboard?.total_recebido_periodo ?? 0, accent: "#80B828" },
  ]

  const contasHref = empresaFilter
    ? `/cockpit/financeiro/contas?empresa=${empresaFilter}`
    : "/cockpit/financeiro/contas"

  return (
    <div className="space-y-8 pb-20 font-sans">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Wallet className="w-7 h-7 text-[#E8A317]" />
            Financeiro — Contas a Receber
          </h2>
          <p className="text-sm text-gray-400 mt-1 font-medium">
            Visão consolidada de recebíveis, vencimentos e baixas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate && (
            <Link
              href="/cockpit/financeiro/contas/nova"
              className="bg-gradient-to-r from-[#E8A317] to-[#C48A10] hover:shadow-[0_4px_24px_rgba(232,163,23,0.35)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" /> Nova conta
            </Link>
          )}
          <Link
            href={contasHref}
            className="bg-[#ffffff05] hover:bg-[#ffffff0a] border border-[#ffffff10] text-white px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-all"
          >
            <List className="w-4 h-4" /> Contas a receber
          </Link>
          {canViewContratos && (
            <Link
              href="/cockpit/financeiro/contratos"
              className="bg-[#ffffff05] hover:bg-[#ffffff0a] border border-[#ffffff10] text-white px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-all"
            >
              <FileText className="w-4 h-4" /> Contratos
            </Link>
          )}
          {canCreateContrato && (
            <Link
              href="/cockpit/financeiro/contratos/novo"
              className="bg-[#ffffff08] hover:bg-[#ffffff12] border border-[#E8A317]/30 text-[#E8A317] px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" /> Novo contrato
            </Link>
          )}
        </div>
      </div>

      {isSuperAdmin && !empresaFilter && (
        <div className="bg-[#E8A317]/10 border border-[#E8A317]/30 rounded-xl px-4 py-3 text-sm text-[#E8A317]">
          Selecione uma empresa abaixo para carregar os indicadores do dashboard.
        </div>
      )}

      {isSuperAdmin && empresas && empresas.length > 0 && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest shrink-0">Empresa:</span>
          <div className="flex-1 min-w-[280px] max-w-lg">
            <EmpresaSearchSelect empresas={empresas} value={empresaFilter ?? ""} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 relative overflow-hidden group hover:border-[#ffffff15] transition-all"
          >
            <div
              className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.06] pointer-events-none"
              style={{ background: `radial-gradient(circle, ${card.accent} 0%, transparent 70%)` }}
            />
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">{card.label}</p>
            <p className="text-2xl font-extrabold text-white tracking-tight">{formatBRL(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Contas abertas</p>
          <p className="text-3xl font-bold text-white">{dashboard?.qtd_contas_abertas ?? 0}</p>
        </div>
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Vencidas</p>
          <p className="text-3xl font-bold text-red-400">{dashboard?.qtd_contas_vencidas ?? 0}</p>
        </div>
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Quitadas</p>
          <p className="text-3xl font-bold text-[#80B828]">{dashboard?.qtd_contas_pagas ?? 0}</p>
        </div>
      </div>

      {dashboard?.por_tipo && Object.keys(dashboard.por_tipo).length > 0 && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            Saldo em aberto por tipo
            <ArrowRight className="w-4 h-4 text-gray-600" />
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(dashboard.por_tipo).map(([tipo, valor]) => (
              <div key={tipo} className="bg-[#0A0A0A] border border-[#ffffff08] rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-gray-400 capitalize">{tipo}</span>
                <span className="text-sm font-bold text-white">{formatBRL(valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
