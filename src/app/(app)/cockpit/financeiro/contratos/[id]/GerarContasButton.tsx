"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Banknote, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { gerarContasReceberDoContrato, type GerarContasResult } from "../actions"
import Link from "next/link"
import GerarContratoMsaButton from "@/components/GerarContratoMsaButton"

interface Props {
  contratoId: string
  empresaId: string
  contasExistentes: number
  jaGerado: boolean
  podeGerar: boolean
  podeGerarContratoMsa: boolean
  mensalidadesPadrao: number
}

export default function GerarContasButton({
  contratoId,
  empresaId,
  contasExistentes,
  jaGerado,
  podeGerar,
  podeGerarContratoMsa,
  mensalidadesPadrao,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<GerarContasResult | null>(null)
  const [mensalidades, setMensalidades] = useState(String(mensalidadesPadrao))

  const handleGerar = (forcar: boolean) => {
    const qtd = parseInt(mensalidades, 10)
    if (!Number.isFinite(qtd) || qtd < 1 || qtd > 120) {
      setError("Informe entre 1 e 120 mensalidades.")
      return
    }

    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await gerarContasReceberDoContrato(contratoId, forcar, qtd)
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.result) {
        setSuccess(res.result)
        router.refresh()
      }
    })
  }

  if (!podeGerar) return null

  const precisaConfirmar = contasExistentes > 0 || jaGerado

  return (
    <div className="bg-[#111111] border border-[#E8A317]/20 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#E8A317]/10 flex items-center justify-center flex-shrink-0">
            <Banknote className="w-5 h-5 text-[#E8A317]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white">Gerar contas a receber</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Cria automaticamente as contas de setup (parcelado), mensalidades e extras.
              {contasExistentes > 0 && (
                <span className="text-amber-400"> · {contasExistentes} conta(s) já vinculada(s)</span>
              )}
            </p>
          </div>
        </div>
        {podeGerarContratoMsa && (
          <GerarContratoMsaButton empresaId={empresaId} contratoId={contratoId} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="mensalidades_gerar" className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Mensalidades a gerar
          </label>
          <input
            id="mensalidades_gerar"
            type="number"
            min={1}
            max={120}
            value={mensalidades}
            onChange={(e) => setMensalidades(e.target.value)}
            className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#E8A317]"
          />
          <p className="text-[11px] text-gray-600">
            Padrão pela vigência do contrato ou valor definido no cadastro.
          </p>
        </div>
        <div className="space-y-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Parcelas setup</span>
          <p className="text-sm text-white py-2.5">Conforme cadastro do contrato</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-[#80B828]/10 border border-[#80B828]/20 rounded-lg text-sm space-y-2">
          <div className="flex items-center gap-2 text-[#80B828] font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            {success.total} conta(s) gerada(s)
          </div>
          <p className="text-gray-400 text-xs">
            Setup: {success.setup} · Mensalidades: {success.mensalidades} · Extras: {success.extras}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href={`/cockpit/financeiro/contas?contrato=${contratoId}`}
              className="text-xs font-semibold text-[#E8A317] hover:text-white"
            >
              Ver contas do contrato
            </Link>
            {success.primeira_conta_id && (
              <Link
                href={`/cockpit/financeiro/contas/${success.primeira_conta_id}`}
                className="text-xs font-semibold text-gray-400 hover:text-white"
              >
                Primeira conta
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleGerar(false)}
          className="bg-gradient-to-r from-[#E8A317] to-[#C48A10] text-white px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
          {precisaConfirmar ? "Gerar contas" : "Gerar contas a receber"}
        </button>
        {precisaConfirmar && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (window.confirm("Já existem contas deste contrato. Deseja gerar novamente?")) {
                handleGerar(true)
              }
            }}
            className="border border-amber-500/30 text-amber-400 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-amber-500/10 disabled:opacity-50"
          >
            Forçar nova geração
          </button>
        )}
      </div>
    </div>
  )
}
