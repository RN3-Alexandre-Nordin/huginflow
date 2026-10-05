'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buscarPedidoImportado } from './actions'

export default function ImportadosBusca() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function abrir(event: React.FormEvent) {
    event.preventDefault()
    setErro(null)
    start(async () => {
      const res = await buscarPedidoImportado(codigo)
      if (res.error || !res.pedidoId) {
        setErro(res.error || 'Pedido não encontrado.')
        return
      }
      router.push(`/cockpit/compras/importados/${res.pedidoId}`)
    })
  }

  return (
    <form onSubmit={abrir} className="space-y-3">
      <input
        autoFocus
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="Código da caixa"
        className="h-11 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 font-mono text-sm text-white outline-none focus:border-[#2BAADF]/50"
      />
      {erro ? <p className="text-sm text-red-300">{erro}</p> : null}
      <button
        type="submit"
        disabled={pending || !codigo.trim()}
        className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        Abrir pedido
      </button>
    </form>
  )
}
