'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarCotacaoDeSolicitacao } from './actions'

export default function AbrirCotacaoButton({ solicitacaoId }: { solicitacaoId: string }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErro(null)
          start(async () => {
            const res = await criarCotacaoDeSolicitacao(solicitacaoId)
            if (res.error || !res.id) {
              setErro(res.error || 'Falha ao abrir cotação.')
              return
            }
            router.push(`/cockpit/compras/cotacoes/${res.id}`)
          })
        }}
        className="rounded-xl bg-[#2BAADF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Abrindo…' : 'Abrir cotação'}
      </button>
      {erro ? <p className="text-xs text-red-400">{erro}</p> : null}
    </div>
  )
}
