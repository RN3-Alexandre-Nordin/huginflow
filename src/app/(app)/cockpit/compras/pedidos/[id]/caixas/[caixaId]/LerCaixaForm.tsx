'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { code39Bars } from '@/lib/compras/code39'
import { lerCaixa } from '../actions'

type Item = {
  id: string
  descricao: string
  unidade: string
  saldo: number
  quantidade: string
  divergencia: string
}

export default function LerCaixaForm({
  caixaId,
  codigo,
  pedidoNumero,
  status,
  itensIniciais,
}: {
  caixaId: string
  codigo: string
  pedidoNumero: string
  status: string
  itensIniciais: Item[]
}) {
  const router = useRouter()
  const [itens, setItens] = useState(itensIniciais)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const bars = code39Bars(codigo)
  const aberta = status === 'aberta'

  function confirmar() {
    setErro(null)
    start(async () => {
      const res = await lerCaixa({
        caixaId,
        itens: itens.map((item) => ({
          pedido_item_id: item.id,
          quantidade: Number(String(item.quantidade).replace(',', '.')) || 0,
          divergencia: item.divergencia,
        })),
      })
      if (res.error) {
        setErro(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <style>{`@media print { body * { visibility: hidden; } .etiqueta, .etiqueta * { visibility: visible; } .etiqueta { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <div className="etiqueta rounded-2xl border border-[#ffffff0a] bg-white p-6 text-black">
        <p className="text-xs uppercase tracking-widest text-neutral-500">{pedidoNumero}</p>
        {bars ? (
          <svg viewBox={`0 0 ${bars[bars.length - 1].x + bars[bars.length - 1].w + 8} 48`} className="mt-2 h-16 w-full">
            {bars.map((bar, index) => (
              <rect key={index} x={bar.x} y="0" width={bar.w} height="48" fill="#000" />
            ))}
          </svg>
        ) : null}
        <p className="mt-2 text-center font-mono text-2xl font-semibold tracking-widest">{codigo}</p>
      </div>
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl border border-[#ffffff14] px-4 py-2 text-sm text-gray-200"
        >
          Imprimir etiqueta
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ffffff08] print:hidden">
        {itens.map((item, index) => (
          <div
            key={item.id}
            className="grid items-center gap-2 border-t border-[#ffffff08] px-3 py-1 first:border-t-0 sm:grid-cols-12"
          >
            <div className="sm:col-span-5">
              <p className="truncate text-sm text-white">{item.descricao}</p>
              <p className="text-[11px] text-gray-500">saldo {item.saldo} {item.unidade}</p>
            </div>
            {aberta ? (
              <>
                <input
                  inputMode="decimal"
                  value={item.quantidade}
                  onChange={(e) => {
                    const next = [...itens]
                    next[index] = { ...item, quantidade: e.target.value }
                    setItens(next)
                  }}
                  placeholder="Qtd"
                  className="h-8 rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 text-sm text-white sm:col-span-2"
                />
                <input
                  value={item.divergencia}
                  onChange={(e) => {
                    const next = [...itens]
                    next[index] = { ...item, divergencia: e.target.value }
                    setItens(next)
                  }}
                  placeholder="Divergência"
                  className="h-8 rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 text-sm text-white sm:col-span-5"
                />
              </>
            ) : (
              <p className="text-sm text-gray-300 sm:col-span-7">
                {item.quantidade ? `${item.quantidade} ${item.unidade}` : '—'}
                {item.divergencia ? ` · ${item.divergencia}` : ''}
              </p>
            )}
          </div>
        ))}
      </div>
      {erro ? <p className="text-sm text-red-300 print:hidden">{erro}</p> : null}
      {aberta ? (
        <div className="flex justify-end print:hidden">
          <button
            type="button"
            disabled={pending}
            onClick={confirmar}
            className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            Confirmar leitura
          </button>
        </div>
      ) : null}
    </div>
  )
}
