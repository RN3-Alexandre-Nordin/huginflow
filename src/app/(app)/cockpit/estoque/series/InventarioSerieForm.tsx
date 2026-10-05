'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atribuirSerieAction } from './actions'

export default function InventarioSerieForm({
  opcoes,
}: {
  opcoes: Array<{ skuId: string; localId: string; rotulo: string; quantidade: number }>
}) {
  const router = useRouter()
  const [chave, setChave] = useState(opcoes[0] ? `${opcoes[0].skuId}|${opcoes[0].localId}` : '')
  const [numero, setNumero] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!opcoes.length) {
    return (
      <p className="text-sm text-gray-500">
        Nenhum saldo sem série. Quando um SKU passa a controlar série, as unidades que já estavam no
        local aparecem aqui até cada uma ganhar um número.
      </p>
    )
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        const [skuId, localId] = chave.split('|')
        if (!skuId || !localId || !numero.trim()) {
          setAviso('Escolha o saldo e informe o número da peça.')
          return
        }
        setAviso(null)
        startTransition(async () => {
          const res = await atribuirSerieAction({ skuId, localId, numero })
          if (res.error) {
            setAviso(res.error)
            return
          }
          setNumero('')
          router.refresh()
        })
      }}
    >
      <label className="block text-xs text-gray-400">
        Saldo sem série
        <select
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0d1218] px-3 py-2 text-sm text-white"
        >
          {opcoes.map((opcao) => (
            <option key={`${opcao.skuId}|${opcao.localId}`} value={`${opcao.skuId}|${opcao.localId}`}>
              {opcao.rotulo} · {opcao.quantidade} sem série
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-gray-400">
        Número da peça
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0d1218] px-3 py-2 font-mono text-sm text-white"
          placeholder="Série"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Gravando…' : 'Dar série a 1 unidade'}
      </button>
      {aviso ? <p className="sm:col-span-3 text-sm text-amber-300">{aviso}</p> : null}
    </form>
  )
}
