'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { excluirSolicitacao } from '../actions'

type Props = {
  solicitacaoId: string
  numero: string
  variant?: 'icon' | 'button'
}

export default function ExcluirSolicitacaoButton({
  solicitacaoId,
  numero,
  variant = 'button',
}: Props) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onClick() {
    setErro(null)
    if (!confirm(`Excluir a solicitação ${numero}? Esta ação não pode ser desfeita.`)) return
    start(async () => {
      const res = await excluirSolicitacao(solicitacaoId)
      if (res.error) {
        setErro(res.error)
        return
      }
      router.push('/cockpit/compras/solicitacoes')
      router.refresh()
    })
  }

  if (variant === 'icon') {
    return (
      <span className="inline-flex flex-col items-end">
        <button
          type="button"
          title="Excluir"
          disabled={pending}
          onClick={onClick}
          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {erro ? <span className="max-w-[10rem] text-[10px] text-red-400">{erro}</span> : null}
      </span>
    )
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
        {pending ? 'Excluindo…' : 'Excluir'}
      </button>
      {erro ? <p className="text-xs text-red-400">{erro}</p> : null}
    </div>
  )
}
