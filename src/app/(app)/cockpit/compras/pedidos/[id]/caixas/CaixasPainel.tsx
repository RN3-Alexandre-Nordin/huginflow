'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { abrirCaixa, buscarCaixa, cancelarCaixa } from './actions'

type Caixa = { id: string; codigo: string; status: string }

const STATUS: Record<string, string> = {
  aberta: 'Aberta',
  lida: 'Lida',
  cancelada: 'Cancelada',
}

export default function CaixasPainel({
  pedidoId,
  caixas,
  podeConferir,
}: {
  pedidoId: string
  caixas: Caixa[]
  podeConferir: boolean
}) {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function nova() {
    setErro(null)
    start(async () => {
      const res = await abrirCaixa(pedidoId)
      if (res.error || !res.id) {
        setErro(res.error || 'Não foi possível abrir a caixa.')
        return
      }
      router.push(`/cockpit/compras/pedidos/${pedidoId}/caixas/${res.id}`)
    })
  }

  function ler(event: React.FormEvent) {
    event.preventDefault()
    setErro(null)
    start(async () => {
      const res = await buscarCaixa(codigo)
      if (res.error || !res.id || !res.pedidoId) {
        setErro(res.error || 'Caixa não encontrada.')
        return
      }
      router.push(`/cockpit/compras/pedidos/${res.pedidoId}/caixas/${res.id}`)
    })
  }

  function cancelar(id: string) {
    setErro(null)
    start(async () => {
      const res = await cancelarCaixa(id)
      if (res.error) {
        setErro(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {podeConferir ? (
        <form onSubmit={ler} className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Ler código da caixa"
            className="h-10 min-w-[16rem] flex-1 rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 font-mono text-sm text-white outline-none focus:border-[#2BAADF]/50"
          />
          <button
            type="submit"
            disabled={pending || !codigo.trim()}
            className="rounded-xl border border-[#ffffff14] px-4 py-2 text-sm text-gray-200 disabled:opacity-40"
          >
            Abrir
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={nova}
            className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Nova caixa
          </button>
        </form>
      ) : null}
      {erro ? <p className="text-sm text-red-300">{erro}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0A0A0A] text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {caixas.map((caixa) => (
              <tr key={caixa.id} className="border-t border-[#ffffff08]">
                <td className="px-4 py-2 font-mono text-[#2BAADF]">{caixa.codigo}</td>
                <td className="px-4 py-2 text-gray-300">{STATUS[caixa.status] || caixa.status}</td>
                <td className="px-4 py-2 text-right">
                  {caixa.status !== 'cancelada' ? (
                    <Link
                      href={`/cockpit/compras/pedidos/${pedidoId}/caixas/${caixa.id}`}
                      className="text-sm text-[#2BAADF]"
                    >
                      {caixa.status === 'aberta' ? 'Ler' : 'Etiqueta'}
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-600">Número encerrado</span>
                  )}
                  {podeConferir && caixa.status === 'aberta' ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => cancelar(caixa.id)}
                      className="ml-3 text-sm text-red-300"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!caixas.length ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">
                  Nenhuma caixa neste pedido.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
