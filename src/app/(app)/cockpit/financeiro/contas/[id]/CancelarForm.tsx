"use client"

import { useActionState } from "react"
import { AlertCircle, Ban } from "lucide-react"
import { cancelarContaReceber } from "../../actions"

const inputCls =
  "w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500/50"

interface Props {
  contaId: string
}

export default function CancelarForm({ contaId }: Props) {
  const [state, formAction, isPending] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => cancelarContaReceber(contaId, formData),
    null
  )

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 space-y-4">
      <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
        <Ban className="w-4 h-4" />
        Cancelar conta
      </h3>
      <p className="text-xs text-gray-500">Somente contas sem baixas podem ser canceladas.</p>

      {state?.error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-3">
        <input name="motivo" placeholder="Motivo do cancelamento (opcional)" className={inputCls} />
        <button
          type="submit"
          disabled={isPending}
          className="border border-red-500/40 text-red-400 hover:bg-red-500/10 px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
        >
          {isPending ? "Cancelando..." : "Cancelar conta"}
        </button>
      </form>
    </div>
  )
}
