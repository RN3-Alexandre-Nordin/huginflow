'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dispensarPreTitulo, exportarPlanilhaContador, trazerNotasConfirmadas } from './actions'

export function ExportarPlanilhaButton({
  filtros,
}: {
  filtros: { q?: string; fornecedor?: string; data?: string; status?: string }
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function baixar() {
    setErro(null)
    start(async () => {
      const res = await exportarPlanilhaContador(filtros)
      if (res.error || !res.base64) {
        setErro(res.error || 'Não foi possível gerar a planilha.')
        return
      }
      const link = document.createElement('a')
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`
      link.download = res.filename
      link.click()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={baixar}
        className="rounded-xl border border-[#ffffff14] px-4 py-2 text-sm font-semibold text-gray-200 disabled:opacity-60"
      >
        {pending ? 'Gerando…' : 'Planilha do contador'}
      </button>
      {erro ? <p className="text-xs text-red-300">{erro}</p> : null}
    </div>
  )
}

export function TrazerNotasButton() {
  const router = useRouter()
  const [aviso, setAviso] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setAviso(null)
          start(async () => {
            const res = await trazerNotasConfirmadas()
            if (res.error) {
              setAviso(res.error)
              return
            }
            setAviso(
              res.quantidade
                ? `${res.quantidade} nota(s) confirmada(s) entraram na lista.`
                : 'Nenhuma nota confirmada sem pré-título.',
            )
            router.refresh()
          })
        }}
        className="rounded-xl bg-[#2BAADF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Buscando…' : 'Trazer notas confirmadas'}
      </button>
      {aviso ? <p className="text-xs text-gray-400">{aviso}</p> : null}
    </div>
  )
}

export function DispensarPreTituloButton({ id }: { id: string }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErro(null)
          start(async () => {
            const res = await dispensarPreTitulo(id)
            if (res.error) {
              setErro(res.error)
              return
            }
            router.refresh()
          })
        }}
        className="text-xs text-gray-400 hover:text-white disabled:opacity-60"
      >
        Dispensar
      </button>
      {erro ? <p className="text-xs text-red-300">{erro}</p> : null}
    </div>
  )
}
