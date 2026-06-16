"use client"

import { useActionState, useEffect } from "react"
import { AlertCircle, CheckCircle2, Banknote } from "lucide-react"
import { registrarBaixa } from "../../actions"
import { FINANCE_MEIOS_PAGAMENTO } from "@/lib/finance/constants"
import { formatBRL } from "@/lib/finance/format"

const inputCls =
  "w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#80B828]"

interface Props {
  contaId: string
  saldo: number
}

export default function BaixaForm({ contaId, saldo }: Props) {
  const today = new Date().toISOString().slice(0, 10)

  const [state, formAction, isPending] = useActionState(
    async (prev: { error?: string; success?: boolean } | null, formData: FormData) =>
      registrarBaixa(contaId, formData),
    null
  )

  useEffect(() => {
    if (state?.success) {
      window.location.reload()
    }
  }, [state?.success])

  return (
    <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Banknote className="w-4 h-4 text-[#80B828]" />
        Registrar baixa
        <span className="text-xs font-normal text-gray-500 ml-1">(saldo {formatBRL(saldo)})</span>
      </h3>

      {state?.error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="p-3 bg-[#80B828]/10 border border-[#80B828]/20 rounded-lg flex items-center gap-2 text-[#80B828] text-sm">
          <CheckCircle2 className="w-4 h-4" />
          Baixa registrada.
        </div>
      )}

      <form action={formAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase">Valor</label>
          <input name="valor" required placeholder={saldo.toFixed(2).replace(".", ",")} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase">Data pagamento</label>
          <input name="data_pagamento" type="date" defaultValue={today} required className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase">Meio</label>
          <select name="meio_pagamento" required className={inputCls}>
            {FINANCE_MEIOS_PAGAMENTO.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase">Detalhe</label>
          <input name="meio_pagamento_detalhe" placeholder="Opcional" className={inputCls} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-gray-400 uppercase">Observação</label>
          <input name="observacao" placeholder="Opcional" className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            className="bg-gradient-to-r from-[#80B828] to-[#5A8F1A] text-white px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? "Registrando..." : "Confirmar baixa"}
          </button>
        </div>
      </form>
    </div>
  )
}
