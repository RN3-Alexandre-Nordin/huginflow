import Link from "next/link"
import { redirect } from "next/navigation"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { isRn3SuperAdmin } from "@/utils/permissions"
import { Wallet, ArrowLeft, Plus, Search, Eye } from "lucide-react"
import { listContasReceber } from "../actions"
import { formatBRL, formatDateBR } from "@/lib/finance/format"
import { FINANCE_STATUS_COLOR, FINANCE_STATUS_LABEL, FINANCE_TIPOS } from "@/lib/finance/constants"
import { createClient } from "@/utils/supabase/server"
import EmpresaSearchSelect from "@/components/EmpresaSearchSelect"

export const metadata = { title: "Contas a Receber | HuginFlow" }

export default async function ContasReceberPage(props: {
  searchParams: Promise<{ q?: string; status?: string; tipo?: string; empresa?: string; contrato?: string }>
}) {
  const me = await getMyProfile()
  const searchParams = await props.searchParams

  if (!isRn3SuperAdmin(me)) redirect("/cockpit/acesso-negado")

  const canCreate = true
  const isSuperAdmin = true
  const { q = "", status = "", tipo = "", empresa = "", contrato = "" } = searchParams

  const contas = await listContasReceber({
    q: q || undefined,
    status: status || undefined,
    tipo: tipo || undefined,
    empresaId: isSuperAdmin && empresa ? empresa : undefined,
    contratoId: contrato || undefined,
  })

  const supabase = await createClient()
  const { data: empresas } = isSuperAdmin
    ? await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome")
    : { data: null }

  const empresaMap = new Map(empresas?.map((e) => [e.id, e.nome]) ?? [])

  return (
    <div className="space-y-6 pb-20 font-sans">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/cockpit/financeiro" className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <Wallet className="w-6 h-6 text-[#E8A317]" />
              Contas a Receber
            </h2>
            <p className="text-sm text-gray-400 mt-1">{contas.length} registro(s)</p>
          </div>
        </div>
        {canCreate && (
          <Link
            href="/cockpit/financeiro/contas/nova"
            className="bg-gradient-to-r from-[#E8A317] to-[#C48A10] text-white px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nova conta
          </Link>
        )}
      </div>

      {contrato && (
        <div className="bg-[#2BAADF]/10 border border-[#2BAADF]/30 rounded-xl px-4 py-3 text-sm text-[#2BAADF] flex items-center justify-between">
          <span>Filtrando contas do contrato selecionado.</span>
          <Link href="/cockpit/financeiro/contas" className="text-xs font-bold hover:text-white">Limpar filtro</Link>
        </div>
      )}

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-4 space-y-4">
        <form className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Buscar descrição ou origem..."
              className="w-full bg-[#0A0A0A] border border-[#ffffff10] text-sm text-white rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-[#E8A317]"
            />
          </div>
          <select name="status" defaultValue={status} className="bg-[#0A0A0A] border border-[#ffffff10] text-sm text-white rounded-lg px-3 py-2">
            <option value="">Todos os status</option>
            {Object.entries(FINANCE_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select name="tipo" defaultValue={tipo} className="bg-[#0A0A0A] border border-[#ffffff10] text-sm text-white rounded-lg px-3 py-2">
            <option value="">Todos os tipos</option>
            {FINANCE_TIPOS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {isSuperAdmin && empresas && (
            <div className="w-full sm:w-64">
              <EmpresaSearchSelect
                name="empresa"
                empresas={empresas}
                value={empresa}
                syncToUrl={false}
              />
            </div>
          )}
          {contrato && <input type="hidden" name="contrato" value={contrato} />}
          <button type="submit" className="px-4 py-2 bg-[#E8A317]/20 text-[#E8A317] border border-[#E8A317]/30 rounded-lg text-sm font-semibold hover:bg-[#E8A317]/30 transition-all">
            Filtrar
          </button>
          {(q || status || tipo || empresa || contrato) && (
            <Link href="/cockpit/financeiro/contas" className="text-xs text-gray-400 hover:text-white uppercase font-bold">
              Limpar
            </Link>
          )}
        </form>
      </div>

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl">
        {contas.length === 0 ? (
          <div className="py-20 text-center text-gray-500">
            Nenhuma conta encontrada.
            {canCreate && !q && !status && (
              <Link href="/cockpit/financeiro/contas/nova" className="block mt-4 text-[#E8A317] hover:text-white font-semibold">
                Criar primeira conta
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#ffffff02] border-b border-[#ffffff0a] text-gray-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  {isSuperAdmin && <th className="px-6 py-4">Empresa</th>}
                  <th className="px-6 py-4">Descrição</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Vencimento</th>
                  <th className="px-6 py-4">Parcela</th>
                  <th className="px-6 py-4">Valor</th>
                  <th className="px-6 py-4">Saldo</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff0a]">
                {contas.map((c) => {
                  const statusKey = c.status
                  const badge = FINANCE_STATUS_COLOR[statusKey] ?? FINANCE_STATUS_COLOR.aberta
                  return (
                    <tr key={c.id} className="hover:bg-[#ffffff03] transition-all group">
                      {isSuperAdmin && (
                        <td className="px-6 py-4 text-gray-400 text-xs">{empresaMap.get(c.empresa_id) ?? "—"}</td>
                      )}
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white">{c.descricao || "Sem descrição"}</p>
                        <p className="text-[10px] text-gray-600 uppercase mt-0.5">{c.origem}</p>
                      </td>
                      <td className="px-6 py-4 capitalize text-gray-400">{c.tipo}</td>
                      <td className="px-6 py-4">
                        {formatDateBR(c.vencimento)}
                        {c.dias_atraso > 0 && (
                          <span className="block text-[10px] text-red-400 font-bold">{c.dias_atraso}d atraso</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-xs font-mono">
                        {c.parcelas_total > 1 ? `${c.parcela_numero}/${c.parcelas_total}` : "—"}
                      </td>
                      <td className="px-6 py-4 font-mono">{formatBRL(c.valor_total)}</td>
                      <td className="px-6 py-4 font-mono text-[#E8A317]">{formatBRL(c.saldo)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${badge}`}>
                          {FINANCE_STATUS_LABEL[statusKey] ?? statusKey}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/cockpit/financeiro/contas/${c.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ffffff05] hover:bg-[#E8A317]/10 text-gray-400 hover:text-[#E8A317] text-xs font-semibold transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" /> Detalhes
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
