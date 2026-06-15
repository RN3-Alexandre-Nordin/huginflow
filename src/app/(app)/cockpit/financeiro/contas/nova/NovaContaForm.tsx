"use client"

import { useActionState, useMemo } from "react"
import Link from "next/link"
import { Save, AlertCircle } from "lucide-react"
import { createContaReceber } from "../../actions"
import { FINANCE_MEIOS_PAGAMENTO, FINANCE_TIPOS } from "@/lib/finance/constants"
import { formatBRL } from "@/lib/finance/format"
import SearchableSelect from "@/components/SearchableSelect"
import { Building2 } from "lucide-react"
import { useState } from "react"

const inputCls =
  "w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E8A317] transition-all"

interface Props {
  empresas: { id: string; nome: string }[] | null
  isSuperAdmin: boolean
  defaultEmpresaId?: string
}

export default function NovaContaForm({ empresas, isSuperAdmin, defaultEmpresaId }: Props) {
  const [selectedEmpresa, setSelectedEmpresa] = useState(defaultEmpresaId ?? "")
  const [tipo, setTipo] = useState("setup")
  const [parcelas, setParcelas] = useState("1")
  const [valorPreview, setValorPreview] = useState("")

  const [state, formAction, isPending] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => createContaReceber(formData),
    null
  )

  const meios =
    tipo === "mensalidade"
      ? FINANCE_MEIOS_PAGAMENTO.filter((m) => m.value === "stripe")
      : FINANCE_MEIOS_PAGAMENTO

  const isMensalidade = tipo === "mensalidade"
  const parcelasNum = Math.max(1, parseInt(parcelas || "1", 10) || 1)
  const valorNum = parseFloat(valorPreview.replace(/[^\d,.-]/g, "").replace(",", ".")) || 0

  const resumoValor = useMemo(() => {
    if (!valorNum || parcelasNum < 1) return null
    if (isMensalidade) {
      const total = valorNum * parcelasNum
      return {
        linha1: `${parcelasNum} mensalidade(s) de ${formatBRL(valorNum)}`,
        linha2: `Total do contrato: ${formatBRL(total)}`,
      }
    }
    const porParcela = parcelasNum === 1 ? valorNum : valorNum / parcelasNum
    return {
      linha1: `${parcelasNum} parcela(s) de ~${formatBRL(porParcela)}`,
      linha2: `Valor total: ${formatBRL(valorNum)}`,
    }
  }, [valorNum, parcelasNum, isMensalidade])

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="tipo" className="text-sm font-semibold text-white">
              Tipo <span className="text-red-500">*</span>
            </label>
            <select
              id="tipo"
              name="tipo"
              required
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className={inputCls}
            >
              {FINANCE_TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="parcelas_total" className="text-sm font-semibold text-white">
              {isMensalidade ? "Quantidade de meses" : "Quantidade de parcelas"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              id="parcelas_total"
              name="parcelas_total"
              type="number"
              min={1}
              max={120}
              required
              value={parcelas}
              onChange={(e) => setParcelas(e.target.value)}
              className={inputCls}
            />
            <p className="text-xs text-gray-500">
              {isMensalidade
                ? "Será gerada uma conta por mês, com vencimento mensal a partir da data inicial."
                : "O valor total será dividido em parcelas iguais, com vencimento mensal."}
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="valor_total" className="text-sm font-semibold text-white">
              {isMensalidade ? "Valor mensal (R$)" : "Valor total (R$)"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              id="valor_total"
              name="valor_total"
              required
              placeholder="1500,00"
              value={valorPreview}
              onChange={(e) => setValorPreview(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="vencimento" className="text-sm font-semibold text-white">
              {isMensalidade ? "Primeiro vencimento" : "Vencimento da 1ª parcela"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input id="vencimento" name="vencimento" type="date" required className={inputCls} />
          </div>
          <div className="space-y-2">
            <label htmlFor="competencia" className="text-sm font-semibold text-white">
              Competência inicial
            </label>
            <input id="competencia" name="competencia" type="date" className={inputCls} />
            {isMensalidade && (
              <p className="text-xs text-gray-500">Se vazio, usa o mês de cada vencimento.</p>
            )}
          </div>
          {resumoValor && parcelasNum > 1 && (
            <div className="md:col-span-2 p-4 rounded-xl bg-[#E8A317]/10 border border-[#E8A317]/20 text-sm">
              <p className="text-[#E8A317] font-semibold">{resumoValor.linha1}</p>
              <p className="text-gray-400 mt-1">{resumoValor.linha2}</p>
            </div>
          )}
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="descricao" className="text-sm font-semibold text-white">
              Descrição
            </label>
            <input id="descricao" name="descricao" placeholder="Ex: Setup inicial — contrato 2026" className={inputCls} />
          </div>
          <div className="space-y-2">
            <label htmlFor="meio_pagamento" className="text-sm font-semibold text-white">
              Meio de pagamento
            </label>
            <select id="meio_pagamento" name="meio_pagamento" className={inputCls}>
              <option value="">— Não definido —</option>
              {meios.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {tipo === "mensalidade" && (
              <p className="text-xs text-gray-500">Mensalidades recorrentes devem usar Stripe.</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor="meio_pagamento_detalhe" className="text-sm font-semibold text-white">
              Detalhe do meio
            </label>
            <input
              id="meio_pagamento_detalhe"
              name="meio_pagamento_detalhe"
              placeholder="Chave PIX, link boleto..."
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div className="px-8 py-5 bg-[#ffffff02] border-t border-[#ffffff0a] flex justify-between items-center">
        <Link href="/cockpit/financeiro/contas" className="text-sm text-gray-400 hover:text-white transition-colors">
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="bg-gradient-to-r from-[#E8A317] to-[#C48A10] text-white px-6 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {parcelasNum > 1 ? `Gerar ${parcelasNum} contas` : "Salvar conta"}
        </button>
      </div>
    </form>
  )
}
