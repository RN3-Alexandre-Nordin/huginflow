'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { salvarPropostasCotacao } from '@/app/(app)/cockpit/compras/cotacoes/actions'

type ItemRow = {
  id: string
  descricao: string
  quantidade: number
  unidade: string
  preco: string
}

type Props = {
  cotacaoId: string
  cotacaoNumero: string
  fornecedorId: string
  fornecedorNome: string
  itens: ItemRow[]
  somenteLeitura: boolean
}

function parsePreco(raw: string): number | null {
  if (!raw.trim()) return null
  const v = Number(raw.replace(',', '.'))
  if (!Number.isFinite(v) || v < 0) return null
  return v
}

export default function PropostaFornecedorForm({
  cotacaoId,
  cotacaoNumero,
  fornecedorId,
  fornecedorNome,
  itens: itensIniciais,
  somenteLeitura,
}: Props) {
  const router = useRouter()
  const [itens, setItens] = useState(itensIniciais)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const inputClass =
    'mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-white outline-none focus:border-[#2BAADF]/50'

  function salvar(voltar: boolean) {
    setErro(null)
    setMsg(null)
    start(async () => {
      const propostas = itens.flatMap((it) => {
        const preco = parsePreco(it.preco)
        if (preco == null) return []
        return [
          {
            cotacao_item_id: it.id,
            fornecedor_id: fornecedorId,
            preco_unitario: preco,
          },
        ]
      })

      const fd = new FormData()
      fd.set('cotacao_id', cotacaoId)
      fd.set('fornecedor_id', fornecedorId)
      fd.set('propostas_json', JSON.stringify(propostas))
      const res = await salvarPropostasCotacao(fd)
      if (res.error) {
        setErro(res.error)
        return
      }
      if (voltar) {
        router.push(`/cockpit/compras/cotacoes/${cotacaoId}`)
        router.refresh()
        return
      }
      setMsg('Preços salvos. Pode completar depois.')
      router.refresh()
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
      <div className="border-b border-[#ffffff08] px-5 py-3.5 sm:px-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">
          Proposta · {cotacaoNumero}
        </p>
        <h3 className="text-base font-semibold text-white">{fornecedorNome}</h3>
        <p className="text-xs text-gray-500">
          Lista vertical — deixe em branco o que ainda não chegou.
        </p>
      </div>

      <div className="min-h-[16rem] space-y-3 p-5 sm:p-6">
        {erro ? <p className="text-sm text-red-400">{erro}</p> : null}
        {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}

        {itens.map((it, index) => (
          <div
            key={it.id}
            className="rounded-xl border border-[#ffffff0a] bg-[#0A0A0A]/50 p-4"
          >
            <p className="text-sm font-medium text-white">{it.descricao}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {it.quantidade} {it.unidade}
            </p>
            <label className="mt-3 block text-xs text-gray-500">
              Preço unitário (R$)
              <input
                className={inputClass}
                inputMode="decimal"
                disabled={somenteLeitura}
                value={it.preco}
                onChange={(e) =>
                  setItens((prev) => {
                    const next = [...prev]
                    next[index] = { ...next[index], preco: e.target.value }
                    return next
                  })
                }
                placeholder="—"
              />
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-6 py-4">
        <Link
          href={`/cockpit/compras/cotacoes/${cotacaoId}`}
          className="text-sm text-[#2BAADF]"
        >
          Voltar ao hub
        </Link>
        {!somenteLeitura ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => salvar(false)}
              className="rounded-xl border border-[#ffffff14] px-5 py-2.5 text-sm font-semibold text-gray-300 disabled:opacity-40"
            >
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => salvar(true)}
              className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? 'Salvando…' : 'Salvar e voltar'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
