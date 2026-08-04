import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { isRn3SuperAdmin } from "@/utils/permissions"
import { ArrowLeft, FileText, Pencil } from "lucide-react"
import { getContrato, countContasDoContrato } from "../actions"
import GerarContasButton from "./GerarContasButton"
import { formatBRL, formatDateBR, computeMesesVigencia } from "@/lib/finance/format"
import { CONTRATO_STATUS, CONTRATO_STATUS_COLOR, CONTRATO_INDICE_REAJUSTE, CONTRATO_SETUP_MEIOS } from "@/lib/finance/contrato-constants"
import { FINANCE_MEIOS_PAGAMENTO } from "@/lib/finance/constants"
import { createClient } from "@/utils/supabase/server"

export const metadata = { title: "Contrato | HuginFlow" }

export default async function ContratoDetalhePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) redirect("/cockpit/acesso-negado")

  const contrato = await getContrato(id)
  if (!contrato) notFound()

  const canEdit = true
  const canGerarAr = contrato.status !== "cancelado"
  const podeGerarContratoMsa = true

  const contasVinculadas = await countContasDoContrato(id)
  const mensalidadesPadrao =
    contrato.mensalidades_total ?? computeMesesVigencia(contrato.data_inicio, contrato.data_fim)
  const supabase = await createClient()
  const { data: empresa } = await supabase
    .from("empresas")
    .select("nome")
    .eq("id", contrato.empresa_id)
    .maybeSingle()

  const statusLabel = Object.fromEntries(CONTRATO_STATUS.map((s) => [s.value, s.label]))
  const indiceLabel = Object.fromEntries(
    CONTRATO_INDICE_REAJUSTE.filter((i) => i.value).map((i) => [i.value, i.label])
  )
  const badge = CONTRATO_STATUS_COLOR[contrato.status] ?? CONTRATO_STATUS_COLOR.rascunho
  const extras = contrato.finance_contrato_servicos_extra ?? []
  const setupMeioLabel =
    CONTRATO_SETUP_MEIOS.find((m) => m.value === contrato.meio_pagamento_setup)?.label
    ?? FINANCE_MEIOS_PAGAMENTO.find((m) => m.value === contrato.meio_pagamento_setup)?.label
    ?? "—"

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/cockpit/financeiro/contratos" className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileText className="w-6 h-6 text-[#E8A317]" />
              {contrato.titulo || "Contrato comercial"}
            </h2>
            <p className="text-sm text-gray-500 font-mono mt-1">
              {contrato.numero_contrato}
              {contrato.numero_os && (
                <span className="text-gray-600 ml-2">· {contrato.numero_os}</span>
              )}
              {empresa?.nome && <span className="text-gray-600 ml-2">· {empresa.nome}</span>}
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${badge}`}>
          {statusLabel[contrato.status]}
        </span>
      </div>

      {canEdit && (
        <Link
          href={`/cockpit/financeiro/contratos/${id}/editar`}
          className="inline-flex items-center gap-2 text-sm text-[#E8A317] hover:text-white font-semibold"
        >
          <Pencil className="w-4 h-4" /> Editar contrato
        </Link>
      )}

      {canGerarAr && (
        <GerarContasButton
          contratoId={id}
          empresaId={contrato.empresa_id}
          contasExistentes={contasVinculadas}
          jaGerado={!!contrato.contas_ar_geradas_em}
          podeGerar={canGerarAr}
          podeGerarContratoMsa={podeGerarContratoMsa}
          mensalidadesPadrao={mensalidadesPadrao}
        />
      )}

      {contasVinculadas > 0 && (
        <Link
          href={`/cockpit/financeiro/contas?contrato=${id}`}
          className="text-sm text-[#2BAADF] hover:text-white font-semibold"
        >
          Ver {contasVinculadas} conta(s) a receber deste contrato →
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Setup", value: formatBRL(contrato.valor_setup) },
          { label: "Parcelas setup", value: String(contrato.setup_parcelas) },
          { label: "Pagamento setup", value: setupMeioLabel },
          { label: "Mensalidade", value: formatBRL(contrato.valor_mensalidade), highlight: true },
          {
            label: "Mensalidades AR",
            value: contrato.mensalidades_total
              ? String(contrato.mensalidades_total)
              : `${mensalidadesPadrao} (vigência)`,
          },
          { label: "Dia vencimento", value: contrato.dia_vencimento_mensal ? `Dia ${contrato.dia_vencimento_mensal}` : "—" },
          {
            label: "Limite usuários",
            value: contrato.limite_usuarios ? String(contrato.limite_usuarios) : "—",
          },
        ].map((item) => (
          <div key={item.label} className="bg-[#111111] border border-[#ffffff0a] rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">{item.label}</p>
            <p className={`text-lg font-bold ${item.highlight ? "text-[#E8A317]" : "text-white"}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500 text-xs uppercase font-bold">Assinatura</span>
          <p className="text-white mt-1">{formatDateBR(contrato.data_assinatura)}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs uppercase font-bold">Início</span>
          <p className="text-white mt-1">{formatDateBR(contrato.data_inicio)}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs uppercase font-bold">Fim</span>
          <p className="text-white mt-1">{contrato.data_fim ? formatDateBR(contrato.data_fim) : "Indeterminado"}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs uppercase font-bold">Reajuste</span>
          <p className="text-white mt-1">
            {contrato.indice_reajuste ? indiceLabel[contrato.indice_reajuste] ?? contrato.indice_reajuste : "—"}
          </p>
        </div>
        {contrato.observacoes && (
          <div className="md:col-span-2">
            <span className="text-gray-500 text-xs uppercase font-bold">Observações</span>
            <p className="text-white mt-1 whitespace-pre-wrap">{contrato.observacoes}</p>
          </div>
        )}
        {(contrato.testemunha_1_nome || contrato.testemunha_2_nome) && (
          <div className="md:col-span-2">
            <span className="text-gray-500 text-xs uppercase font-bold">Testemunhas</span>
            <ul className="text-white mt-2 space-y-1 text-sm">
              {contrato.testemunha_1_nome && (
                <li>
                  1. {contrato.testemunha_1_nome}
                  {contrato.testemunha_1_cpf && (
                    <span className="text-gray-500"> — CPF {contrato.testemunha_1_cpf}</span>
                  )}
                </li>
              )}
              {contrato.testemunha_2_nome && (
                <li>
                  2. {contrato.testemunha_2_nome}
                  {contrato.testemunha_2_cpf && (
                    <span className="text-gray-500"> — CPF {contrato.testemunha_2_cpf}</span>
                  )}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {extras.length > 0 && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#ffffff0a]">
            <h3 className="text-sm font-bold text-white">Serviços extras</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3 text-left">Descrição</th>
                <th className="px-6 py-3 text-left">Valor</th>
                <th className="px-6 py-3 text-left">Parcelas</th>
                <th className="px-6 py-3 text-left">Recorrente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff0a] text-gray-300">
              {extras.map((e) => (
                <tr key={e.id}>
                  <td className="px-6 py-3">{e.descricao}</td>
                  <td className="px-6 py-3 font-mono">{formatBRL(e.valor)}</td>
                  <td className="px-6 py-3">{e.parcelas}</td>
                  <td className="px-6 py-3">{e.recorrente_mensal ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
