'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aprovarNotaSuspensa, cancelarNota, confirmarNota } from '../actions'

export default function NotaAcoes({
  notaId,
  status,
  podeEditar,
  podeAprovar,
  avisoSuspensao,
}: {
  notaId: string
  status: string
  podeEditar: boolean
  podeAprovar: boolean
  avisoSuspensao: string | null
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (status !== 'rascunho' && status !== 'suspensa') return null

  function run(acao: 'confirmar' | 'aprovar' | 'cancelar') {
    setErro(null)
    start(async () => {
      const res =
        acao === 'confirmar'
          ? await confirmarNota(notaId)
          : acao === 'aprovar'
            ? await aprovarNotaSuspensa(notaId)
            : await cancelarNota(notaId)
      if (res.error) {
        setErro(res.error)
        return
      }
      const texto = 'aviso' in res && typeof res.aviso === 'string' ? res.aviso : null
      if (texto) setAviso(texto)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {status === 'suspensa' && avisoSuspensao ? (
        <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-sm text-amber-200">
          {avisoSuspensao}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {status === 'rascunho' && podeEditar ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run('confirmar')}
            className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Confirmar nota
          </button>
        ) : null}
        {status === 'suspensa' && podeAprovar ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run('aprovar')}
            className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Aprovar recebimento
          </button>
        ) : null}
        {podeEditar ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run('cancelar')}
            className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-300 disabled:opacity-60"
          >
            {status === 'suspensa' ? 'Cancelar nota' : 'Cancelar rascunho'}
          </button>
        ) : null}
        {erro ? <p className="text-sm text-red-300">{erro}</p> : null}
        {aviso ? <p className="text-sm text-amber-300">{aviso}</p> : null}
      </div>
    </div>
  )
}
