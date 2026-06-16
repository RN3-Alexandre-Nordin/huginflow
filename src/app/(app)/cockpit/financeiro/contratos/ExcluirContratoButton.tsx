"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import { deleteContrato } from "./deleteContrato"

interface Props {
  contratoId: string
  titulo: string
  numeroContrato: string | null
}

export default function ExcluirContratoButton({ contratoId, titulo, numeroContrato }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const label = titulo || numeroContrato || "este contrato"

  const close = () => {
    if (isPending) return
    setOpen(false)
    setError(null)
  }

  const handleDelete = () => {
    setError(null)
    startTransition(() => {
      deleteContrato(contratoId).then((res) => {
        if (res.error) {
          setError(res.error)
          return
        }
        setOpen(false)
        router.refresh()
      })
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-400/80 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" /> Excluir
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="excluir-contrato-title"
            className="w-full max-w-md bg-[#111111] border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 id="excluir-contrato-title" className="text-lg font-bold text-white">
                    Excluir contrato?
                  </h3>
                  <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                    Você está prestes a excluir{" "}
                    <span className="text-white font-semibold">{label}</span>
                    {numeroContrato && (
                      <span className="block text-xs text-gray-500 font-mono mt-1">{numeroContrato}</span>
                    )}
                    . Esta ação não pode ser desfeita.
                  </p>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="px-6 py-4 bg-[#ffffff02] border-t border-[#ffffff0a] flex justify-end gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={close}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-[#ffffff08] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleDelete}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-red-500 hover:bg-red-600 text-white inline-flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
