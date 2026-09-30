'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelarNota, confirmarNota } from '../actions'

export default function NotaAcoes({ notaId, status }: { notaId: string; status: string }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (status !== 'rascunho') return null

  function run(acao: 'confirmar' | 'cancelar') {
    setErro(null)
    start(async () => {
      const res = acao === 'confirmar' ? await confirmarNota(notaId) : await cancelarNota(notaId)
      if (res.error) {
        setErro(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => run('confirmar')}
        className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        Confirmar nota
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run('cancelar')}
        className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-300 disabled:opacity-60"
      >
        Cancelar rascunho
      </button>
      {erro ? <p className="text-sm text-red-300">{erro}</p> : null}
    </div>
  )
}
