"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Save, AlertCircle, Plus, Trash2 } from "lucide-react"
import SearchableSelect from "@/components/SearchableSelect"
import { Building2 } from "lucide-react"
import {
  CONTRATO_INDICE_REAJUSTE,
  CONTRATO_STATUS,
  CONTRATO_SETUP_MEIOS,
} from "@/lib/finance/contrato-constants"
import type { FinanceContrato } from "@/lib/finance/contrato-types"
import { createContrato, updateContrato } from "./actions"

const inputCls =
  "w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E8A317] transition-all text-sm"

type ExtraRow = {
  descricao: string
  valor: string
  parcelas: string
  recorrente_mensal: boolean
  observacao: string
}

interface Props {
  empresas: { id: string; nome: string }[] | null
  isSuperAdmin: boolean
  defaultEmpresaId?: string
  contrato?: FinanceContrato
  submitLabel: string
  cancelHref: string
}

function emptyExtra(): ExtraRow {
  return { descricao: "", valor: "", parcelas: "1", recorrente_mensal: false, observacao: "" }
}

export default function ContratoForm({
  empresas,
  isSuperAdmin,
  defaultEmpresaId,
  contrato,
  submitLabel,
  cancelHref,
}: Props) {
  const [selectedEmpresa, setSelectedEmpresa] = useState(
    contrato?.empresa_id ?? defaultEmpresaId ?? ""
  )
  const [extras, setExtras] = useState<ExtraRow[]>(() => {
    const items = contrato?.finance_contrato_servicos_extra
    if (items?.length) {
      return items.map((e) => ({
        descricao: e.descricao,
        valor: String(e.valor).replace(".", ","),
        parcelas: String(e.parcelas),
        recorrente_mensal: e.recorrente_mensal,
        observacao: e.observacao || "",
      }))
    }
    return [emptyExtra()]
  })

  const [state, formAction, isPending] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      if (contrato?.id) return updateContrato(contrato.id, formData)
      return createContrato(formData)
    },
    null
  )

  const addExtra = () => setExtras((rows) => [...rows, emptyExtra()])
  const removeExtra = (idx: number) =>
    setExtras((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)))

  const updateExtra = (idx: number, field: keyof ExtraRow, value: string | boolean) => {
    setExtras((rows) =>
      rows.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    )
  }

  const setupVal = parseFloat((contrato?.valor_setup ?? 0).toString())
  const mensalVal = parseFloat((contrato?.valor_mensalidade ?? 0).toString())

  return (
    <form action={formAction} className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl relative">
      {isPending && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#E8A317]/20 border-t-[#E8A317] rounded-full animate-spin" />
        </div>
      )}

      <div className="p-8 space-y-8">
        {state?.error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="font-medium">{state.error}</p>
          </div>
        )}

        {isSuperAdmin && empresas && (
          <div className="space-y-2">
            <label className="text-sm font-semibold text-white">
              Empresa <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              name="empresa_id"
              required
              icon={Building2}
              options={empresas}
              value={selectedEmpresa}
              onChange={setSelectedEmpresa}
              placeholder="Selecione a empresa..."
            />
          </div>
        )}

        <div>
          <h3 className="text-xs font-bold text-[#E8A317] uppercase tracking-wider mb-4 border-b border-[#ffffff10] pb-2">
            Identificação
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="titulo" className="text-sm font-semibold text-white">Título / objeto</label>
              <input
                id="titulo"
                name="titulo"
                defaultValue={contrato?.titulo ?? ""}
                placeholder="Ex: Plataforma HuginFlow — plano anual"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="numero_contrato" className="text-sm font-semibold text-white">Nº contrato</label>
              <input
                id="numero_contrato"
                name="numero_contrato"
                defaultValue={contrato?.numero_contrato ?? ""}
                placeholder="Auto se vazio (CTR-2026-0001)"
                className={inputCls}
              />
            </div>
            {contrato?.numero_os && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">Nº OS</label>
                <p className="text-sm font-mono text-[#E8A317] py-3">{contrato.numero_os}</p>
                <p className="text-[11px] text-gray-500">Gerado automaticamente na criação do contrato.</p>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-semibold text-white">Status</label>
              <select id="status" name="status" defaultValue={contrato?.status ?? "rascunho"} className={inputCls}>
                {CONTRATO_STATUS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="indice_reajuste" className="text-sm font-semibold text-white">Índice de reajuste</label>
              <select
                id="indice_reajuste"
                name="indice_reajuste"
                defaultValue={contrato?.indice_reajuste ?? ""}
                className={inputCls}
              >
                {CONTRATO_INDICE_REAJUSTE.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-[#E8A317] uppercase tracking-wider mb-4 border-b border-[#ffffff10] pb-2">
            Vigência
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label htmlFor="data_assinatura" className="text-sm font-semibold text-white">Data assinatura</label>
              <input
                id="data_assinatura"
                name="data_assinatura"
                type="date"
                defaultValue={contrato?.data_assinatura?.slice(0, 10) ?? ""}
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="data_inicio" className="text-sm font-semibold text-white">
                Data início <span className="text-red-500">*</span>
              </label>
              <input
                id="data_inicio"
                name="data_inicio"
                type="date"
                required
                defaultValue={contrato?.data_inicio?.slice(0, 10) ?? ""}
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="data_fim" className="text-sm font-semibold text-white">Data fim</label>
              <input
                id="data_fim"
                name="data_fim"
                type="date"
                defaultValue={contrato?.data_fim?.slice(0, 10) ?? ""}
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="dia_vencimento_mensal" className="text-sm font-semibold text-white">Dia venc. mensal</label>
              <input
                id="dia_vencimento_mensal"
                name="dia_vencimento_mensal"
                type="number"
                min={1}
                max={28}
                defaultValue={contrato?.dia_vencimento_mensal ?? ""}
                placeholder="1–28"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-[#E8A317] uppercase tracking-wider mb-4 border-b border-[#ffffff10] pb-2">
            Valores recorrentes e setup
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label htmlFor="valor_setup" className="text-sm font-semibold text-white">Valor setup (R$)</label>
              <input
                id="valor_setup"
                name="valor_setup"
                defaultValue={contrato ? setupVal.toFixed(2).replace(".", ",") : ""}
                placeholder="0,00"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="setup_parcelas" className="text-sm font-semibold text-white">Parcelas setup</label>
              <input
                id="setup_parcelas"
                name="setup_parcelas"
                type="number"
                min={1}
                max={120}
                defaultValue={contrato?.setup_parcelas ?? 1}
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="meio_pagamento_setup" className="text-sm font-semibold text-white">
                Pagamento setup
              </label>
              <select
                id="meio_pagamento_setup"
                name="meio_pagamento_setup"
                defaultValue={contrato?.meio_pagamento_setup ?? ""}
                className={inputCls}
              >
                <option value="">Selecione...</option>
                {CONTRATO_SETUP_MEIOS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500">Obrigatório quando houver valor de setup.</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="valor_mensalidade" className="text-sm font-semibold text-white">Mensalidade (R$)</label>
              <input
                id="valor_mensalidade"
                name="valor_mensalidade"
                defaultValue={contrato ? mensalVal.toFixed(2).replace(".", ",") : ""}
                placeholder="0,00"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="mensalidades_total" className="text-sm font-semibold text-white">
                Qtd. mensalidades no AR
              </label>
              <input
                id="mensalidades_total"
                name="mensalidades_total"
                type="number"
                min={1}
                max={120}
                defaultValue={contrato?.mensalidades_total ?? ""}
                placeholder="Auto pela vigência"
                className={inputCls}
              />
              <p className="text-[11px] text-gray-500">Deixe vazio para calcular pelas datas de início e fim.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Pagamento mensalidade</label>
              <p className="text-sm text-gray-400 py-2.5">Cartão de crédito (automático no AR)</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="limite_usuarios" className="text-sm font-semibold text-white">
                Limite de usuários
              </label>
              <input
                id="limite_usuarios"
                name="limite_usuarios"
                type="number"
                min={1}
                max={9999}
                defaultValue={contrato?.limite_usuarios ?? ""}
                placeholder="Ex: 5"
                className={inputCls}
              />
              <p className="text-[11px] text-gray-500">Refletido no quadro comercial da OS (PDF).</p>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4 border-b border-[#ffffff10] pb-2">
            <h3 className="text-xs font-bold text-[#E8A317] uppercase tracking-wider">Serviços extras</h3>
            <button
              type="button"
              onClick={addExtra}
              className="text-xs font-semibold text-[#E8A317] hover:text-white inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar item
            </button>
          </div>
          <div className="space-y-4">
            {extras.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 rounded-xl bg-[#0A0A0A] border border-[#ffffff08]">
                <div className="md:col-span-4 space-y-1">
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Descrição</label>
                  <input
                    name="extra_descricao"
                    value={row.descricao}
                    onChange={(e) => updateExtra(idx, "descricao", e.target.value)}
                    placeholder="Ex: Horas consultoria"
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Valor (R$)</label>
                  <input
                    name="extra_valor"
                    value={row.valor}
                    onChange={(e) => updateExtra(idx, "valor", e.target.value)}
                    placeholder="0,00"
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Parcelas</label>
                  <input
                    name="extra_parcelas"
                    type="number"
                    min={1}
                    value={row.parcelas}
                    onChange={(e) => updateExtra(idx, "parcelas", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-2 flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      name={`extra_recorrente_${idx}`}
                      checked={row.recorrente_mensal}
                      onChange={(e) => updateExtra(idx, "recorrente_mensal", e.target.checked)}
                      className="rounded border-gray-600"
                    />
                    Recorrente/mês
                  </label>
                </div>
                <div className="md:col-span-1 flex items-end justify-end pb-1">
                  <button
                    type="button"
                    onClick={() => removeExtra(idx)}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                    aria-label="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <input type="hidden" name={`extra_observacao_${idx}`} value={row.observacao} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-[#E8A317] uppercase tracking-wider mb-4 border-b border-[#ffffff10] pb-2">
            Testemunhas (MSA / PDF)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 p-4 rounded-xl bg-[#0A0A0A] border border-[#ffffff08]">
              <p className="text-xs font-bold text-gray-400 uppercase">Testemunha 1</p>
              <div className="space-y-2">
                <label htmlFor="testemunha_1_nome" className="text-sm font-semibold text-white">Nome</label>
                <input
                  id="testemunha_1_nome"
                  name="testemunha_1_nome"
                  defaultValue={contrato?.testemunha_1_nome ?? ""}
                  placeholder="Nome completo"
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="testemunha_1_cpf" className="text-sm font-semibold text-white">CPF</label>
                <input
                  id="testemunha_1_cpf"
                  name="testemunha_1_cpf"
                  defaultValue={contrato?.testemunha_1_cpf ?? ""}
                  placeholder="000.000.000-00"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="space-y-4 p-4 rounded-xl bg-[#0A0A0A] border border-[#ffffff08]">
              <p className="text-xs font-bold text-gray-400 uppercase">Testemunha 2</p>
              <div className="space-y-2">
                <label htmlFor="testemunha_2_nome" className="text-sm font-semibold text-white">Nome</label>
                <input
                  id="testemunha_2_nome"
                  name="testemunha_2_nome"
                  defaultValue={contrato?.testemunha_2_nome ?? ""}
                  placeholder="Nome completo"
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="testemunha_2_cpf" className="text-sm font-semibold text-white">CPF</label>
                <input
                  id="testemunha_2_cpf"
                  name="testemunha_2_cpf"
                  defaultValue={contrato?.testemunha_2_cpf ?? ""}
                  placeholder="000.000.000-00"
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="observacoes" className="text-sm font-semibold text-white">Observações comerciais</label>
          <textarea
            id="observacoes"
            name="observacoes"
            rows={3}
            defaultValue={contrato?.observacoes ?? ""}
            placeholder="Condições especiais, descontos, SLA comercial..."
            className={`${inputCls} resize-none`}
          />
        </div>
      </div>

      <div className="px-8 py-5 bg-[#ffffff02] border-t border-[#ffffff0a] flex justify-between items-center">
        <Link href={cancelHref} className="text-sm text-gray-400 hover:text-white transition-colors">
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="bg-gradient-to-r from-[#E8A317] to-[#C48A10] text-white px-6 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {submitLabel}
        </button>
      </div>
    </form>
  )
}
