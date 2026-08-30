import Link from "next/link"
import { redirect } from "next/navigation"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { isRn3SuperAdmin } from "@/utils/permissions"
import { FileText, Plus, Eye, Pencil } from "lucide-react"
import BackButton from '@/components/BackButton'
import { listContratos } from "./actions"
import { formatBRL, formatDateBR } from "@/lib/finance/format"
import { CONTRATO_STATUS_COLOR, CONTRATO_STATUS } from "@/lib/finance/contrato-constants"
import { createClient } from "@/utils/supabase/server"
import EmpresaSearchSelect from "@/components/EmpresaSearchSelect"
import ExcluirContratoButton from "./ExcluirContratoButton"

export const metadata = { title: "Contratos | HuginFlow" }

export default async function ContratosPage(props: {
  searchParams: Promise<{ empresa?: string }>
}) {
  const me = await getMyProfile()
  const searchParams = await props.searchParams

  if (!isRn3SuperAdmin(me)) redirect("/cockpit/acesso-negado")

  const canCreate = true
  const canEdit = true
  const canDelete = true
  const isSuperAdmin = true
  const empresaFilter = isSuperAdmin ? searchParams.empresa : undefined

  const contratos = await listContratos(empresaFilter)
  const supabase = await createClient()
  const { data: empresas } = isSuperAdmin
    ? await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome")
    : { data: null }
  const empresaMap = new Map(empresas?.map((e) => [e.id, e.nome]) ?? [])

  const statusLabel = Object.fromEntries(CONTRATO_STATUS.map((s) => [s.value, s.label]))

  return (
    <div className="space-y-6 pb-20 font-sans">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <BackButton fallbackHref="/cockpit/financeiro" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <FileText className="w-6 h-6 text-[#E8A317]" />
              Contratos comerciais
            </h2>
            <p className="text-sm text-gray-400 mt-1">{contratos.length} contrato(s)</p>
          </div>
        </div>
        {canCreate && (
          <Link
            href="/cockpit/financeiro/contratos/novo"
            className="bg-gradient-to-r from-[#E8A317] to-[#C48A10] text-white px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Novo contrato
          </Link>
        )}
      </div>

      {isSuperAdmin && empresas && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest shrink-0">Empresa:</span>
          <div className="flex-1 min-w-[280px] max-w-lg">
            <EmpresaSearchSelect empresas={empresas} value={empresaFilter ?? ""} />
          </div>
        </div>
      )}

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden">
        {contratos.length === 0 ? (
          <div className="py-20 text-center text-gray-500">
            Nenhum contrato cadastrado.
            {canCreate && (
              <Link href="/cockpit/financeiro/contratos/novo" className="block mt-4 text-[#E8A317] font-semibold">
                Cadastrar primeiro contrato
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#ffffff02] border-b border-[#ffffff0a] text-gray-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  {isSuperAdmin && <th className="px-6 py-4">Empresa</th>}
                  <th className="px-6 py-4">Contrato</th>
                  <th className="px-6 py-4">Vigência</th>
                  <th className="px-6 py-4">Setup</th>
                  <th className="px-6 py-4">Mensalidade</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff0a]">
                {contratos.map((c) => {
                  const badge = CONTRATO_STATUS_COLOR[c.status] ?? CONTRATO_STATUS_COLOR.rascunho
                  return (
                    <tr key={c.id} className="hover:bg-[#ffffff03]">
                      {isSuperAdmin && (
                        <td className="px-6 py-4 text-xs text-gray-400">{empresaMap.get(c.empresa_id) ?? "—"}</td>
                      )}
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white">{c.titulo || "Sem título"}</p>
                        <p className="text-[10px] text-gray-600 font-mono">{c.numero_contrato}</p>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {formatDateBR(c.data_inicio)}
                        {c.data_fim ? ` → ${formatDateBR(c.data_fim)}` : " → indeterminado"}
                      </td>
                      <td className="px-6 py-4 font-mono">{formatBRL(c.valor_setup)}</td>
                      <td className="px-6 py-4 font-mono text-[#E8A317]">{formatBRL(c.valor_mensalidade)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${badge}`}>
                          {statusLabel[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Link
                          href={`/cockpit/financeiro/contratos/${c.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white"
                        >
                          <Eye className="w-3.5 h-3.5" /> Ver
                        </Link>
                        {canEdit && (
                          <Link
                            href={`/cockpit/financeiro/contratos/${c.id}/editar`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#E8A317] hover:text-white"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Editar
                          </Link>
                        )}
                        {canDelete && (
                          <ExcluirContratoButton
                            contratoId={c.id}
                            titulo={c.titulo || ""}
                            numeroContrato={c.numero_contrato}
                          />
                        )}
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
