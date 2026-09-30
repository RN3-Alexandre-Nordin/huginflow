'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { decidirPedido } from '../../actions'

export default function AprovarPedidoForm({ pedidoId }: { pedidoId: string }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(decisao: 'aprovado' | 'recusado') {
    return (formData: FormData) => {
      formData.set('pedido_id', pedidoId)
      formData.set('decisao', decisao)
      setErro(null)
      start(async () => {
        const res = await decidirPedido(formData)
        if (res.error) {
          setErro(res.error)
          return
        }
        router.refresh()
      })
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5">
      <h3 className="text-sm font-semibold text-white">Alçada</h3>
      <p className="text-xs text-gray-500">
        Cada decisão grava quem aprovou ou recusou. O PDF ao fornecedor só sai após a alçada
        (fase seguinte).
      </p>
      <form action={submit('aprovado')} className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-emerald-600/80 px-4 py-2 text-sm font-semibold text-white"
        >
          Aprovar nível
        </button>
      </form>
      <form action={submit('recusado')} className="space-y-2">
        <textarea
          name="motivo"
          required
          placeholder="Motivo da recusa"
          rows={2}
          className="w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-red-600/80 px-4 py-2 text-sm font-semibold text-white"
        >
          Recusar
        </button>
      </form>
      {erro ? <p className="text-sm text-red-400">{erro}</p> : null}
    </div>
  )
}
