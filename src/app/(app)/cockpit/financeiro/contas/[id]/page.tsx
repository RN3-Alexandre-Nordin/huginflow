import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { isRn3SuperAdmin } from "@/utils/permissions"
import { createClient } from "@/utils/supabase/server"
import { Wallet } from "lucide-react"
import BackButton from '@/components/BackButton'
import { formatBRL, formatDateBR } from "@/lib/finance/format"
import { FINANCE_STATUS_COLOR, FINANCE_STATUS_LABEL, FINANCE_MEIOS_PAGAMENTO } from "@/lib/finance/constants"
import type { ContaReceberBaixa } from "@/lib/finance/types"
import BaixaForm from "./BaixaForm"
import CancelarForm from "./CancelarForm"

export const metadata = { title: "Detalhe da Conta | HuginFlow" }

function meioLabel(value: string | null) {
  if (!value) return "—"
  return FINANCE_MEIOS_PAGAMENTO.find((m) => m.value === value)?.label ?? value
}

export default async function ContaDetalhePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const me = await getMyProfile()

  if (!isRn3SuperAdmin(me)) redirect("/cockpit/acesso-negado")

  const canEdit = true
  const supabase = await createClient()

  const { data: conta } = await supabase
    .from("vw_finance_contas_receber_relatorio")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (!conta) notFound()

  const { data: baixas } = await supabase
    .from("finance_contas_receber_baixas")
    .select("*")
    .eq("conta_receber_id", id)
    .order("data_pagamento", { ascending: false })

  const grupoId = conta.grupo_parcelamento_id as string | null
  const { data: contaExtra } = await supabase
    .from("finance_contas_receber")
    .select("data_pagamento")
    .eq("id", id)
    .maybeSingle()

  const { data: parcelasGrupo } = grupoId
    ? await supabase
        .from("vw_finance_contas_receber_relatorio")
        .select("id, parcela_numero, parcelas_total, vencimento, valor_total, status, saldo")
        .eq("grupo_parcelamento_id", grupoId)
        .order("parcela_numero", { ascending: true })
    : { data: null }

  const statusKey = conta.status as string
  const badge = FINANCE_STATUS_COLOR[statusKey] ?? FINANCE_STATUS_COLOR.aberta
  const saldo = Number(conta.saldo)
  const podeBaixar = canEdit && saldo > 0 && statusKey !== "cancelada"
  const podeCancelar = canEdit && statusKey !== "cancelada" && statusKey !== "paga" && (baixas?.length ?? 0) === 0

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 font-sans">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/financeiro/contas" />
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3 truncate">
            <Wallet className="w-6 h-6 text-[#E8A317] flex-shrink-0" />
            {conta.descricao || "Conta a receber"}
          </h2>
          <p className="text-sm text-gray-500 mt-1 font-mono">
            {conta.numero_documento ?? conta.id.slice(0, 8)}
            {conta.parcelas_total > 1 && (
              <span className="ml-2 text-[#E8A317]">
                · Parcela {conta.parcela_numero}/{conta.parcelas_total}
              </span>
            )}
          </p>
        </div>
        <span className={`inline-flex px-3 py-1.5 rounded-full text-[10px] font-bold uppercase border flex-shrink-0 ${badge}`}>
          {FINANCE_STATUS_LABEL[statusKey] ?? statusKey}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Valor total", value: formatBRL(conta.valor_total) },
          { label: "Pago", value: formatBRL(conta.pago_total) },
          { label: "Saldo", value: formatBRL(conta.saldo), highlight: true },
          { label: "Vencimento", value: formatDateBR(conta.vencimento) },
        ].map((item) => (
          <div key={item.label} className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">{item.label}</p>
            <p className={`text-lg font-bold ${item.highlight ? "text-[#E8A317]" : "text-white"}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500 text-xs uppercase font-bold">Tipo</span>
          <p className="text-white capitalize mt-1">{conta.tipo}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs uppercase font-bold">Origem</span>
          <p className="text-white mt-1">{conta.origem}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs uppercase font-bold">Competência</span>
          <p className="text-white mt-1">{formatDateBR(conta.competencia)}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs uppercase font-bold">Meio previsto</span>
          <p className="text-white mt-1">{meioLabel(conta.meio_pagamento)}</p>
        </div>
        {conta.contrato_id && (
          <div>
            <span className="text-gray-500 text-xs uppercase font-bold">Contrato</span>
            <p className="mt-1">
              <Link href={`/cockpit/financeiro/contratos/${conta.contrato_id}`} className="text-[#E8A317] hover:text-white text-sm font-semibold">
                Ver contrato comercial →
              </Link>
            </p>
          </div>
        )}
        {conta.valor_contrato_original != null && conta.parcelas_total > 1 && (
          <div>
            <span className="text-gray-500 text-xs uppercase font-bold">Valor do contrato</span>
            <p className="text-white mt-1 font-semibold">{formatBRL(conta.valor_contrato_original)}</p>
          </div>
        )}
        {conta.parcelas_total > 1 && (
          <div>
            <span className="text-gray-500 text-xs uppercase font-bold">Parcelamento</span>
            <p className="text-white mt-1">
              {conta.parcela_numero} de {conta.parcelas_total}
            </p>
          </div>
        )}
        {conta.meio_pagamento_detalhe && (
          <div className="md:col-span-2">
            <span className="text-gray-500 text-xs uppercase font-bold">Detalhe do meio</span>
            <p className="text-white mt-1">{conta.meio_pagamento_detalhe}</p>
          </div>
        )}
        {contaExtra?.data_pagamento && (
          <div>
            <span className="text-gray-500 text-xs uppercase font-bold">Data quitação</span>
            <p className="text-[#80B828] mt-1 font-semibold">{formatDateBR(contaExtra.data_pagamento)}</p>
          </div>
        )}
      </div>

      {parcelasGrupo && parcelasGrupo.length > 1 && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#ffffff0a]">
            <h3 className="text-sm font-bold text-white">Parcelas do mesmo lançamento</h3>
          </div>
          <div className="divide-y divide-[#ffffff0a]">
            {parcelasGrupo.map((p) => {
              const isCurrent = p.id === id
              const pBadge = FINANCE_STATUS_COLOR[p.status as string] ?? FINANCE_STATUS_COLOR.aberta
              return (
                <Link
                  key={p.id}
                  href={`/cockpit/financeiro/contas/${p.id}`}
                  className={`flex items-center justify-between px-6 py-3 text-sm transition-all hover:bg-[#ffffff03] ${
                    isCurrent ? "bg-[#E8A317]/5 border-l-2 border-[#E8A317]" : ""
                  }`}
                >
                  <span className="text-white font-mono">
                    {p.parcela_numero}/{p.parcelas_total}
                    <span className="text-gray-500 ml-3 font-sans">{formatDateBR(p.vencimento)}</span>
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-gray-300">{formatBRL(p.valor_total)}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${pBadge}`}>
                      {FINANCE_STATUS_LABEL[p.status as string] ?? p.status}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {(baixas?.length ?? 0) > 0 && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#ffffff0a]">
            <h3 className="text-sm font-bold text-white">Histórico de baixas</h3>
          </div>
          <table className="w-full text-sm text-gray-300">
            <thead className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              <tr>
                <th className="px-6 py-3 text-left">Data</th>
                <th className="px-6 py-3 text-left">Valor</th>
                <th className="px-6 py-3 text-left">Meio</th>
                <th className="px-6 py-3 text-left">Obs.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff0a]">
              {(baixas as ContaReceberBaixa[]).map((b) => (
                <tr key={b.id}>
                  <td className="px-6 py-3">{formatDateBR(b.data_pagamento)}</td>
                  <td className="px-6 py-3 font-mono text-[#80B828]">{formatBRL(b.valor)}</td>
                  <td className="px-6 py-3">{meioLabel(b.meio_pagamento)}</td>
                  <td className="px-6 py-3 text-gray-500">{b.observacao || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {podeBaixar && <BaixaForm contaId={id} saldo={saldo} />}
      {podeCancelar && <CancelarForm contaId={id} />}
    </div>
  )
}
