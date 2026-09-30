'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { excluirCotacao } from './actions'

type Props = {
  cotacaoId: string
  numero: string
}

export default function ExcluirCotacaoButton({ cotacaoId, numero }: Props) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        title="Excluir"
        disabled={pending}
        onClick={() => {
          setErro(null)
          if (!confirm(`Excluir a cotação ${numero}? Esta ação não pode ser desfeita.`)) return
          start(async () => {
            const res = await excluirCotacao(cotacaoId)
            if (res.error) {
              setErro(res.error)
              return
            }
            router.refresh()
          })
        }}
        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {erro ? <span className="max-w-[10rem] text-[10px] text-red-400">{erro}</span> : null}
    </span>
  )
}
