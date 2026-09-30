'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import PedidoWizard from '../../PedidoWizard'
import { registrarRecebimento } from '../../actions'

type Item = {
  id: string
  descricao: string
  unidade: string
  pedido: number
  recebido: number
}

const STEPS = [
  { id: 'conferencia', label: '1. Conferência', hint: 'Quantidade que chegou agora e divergência' },
  { id: 'revisao', label: '2. Revisão', hint: 'Confira o recebimento antes de gravar' },
] as const

type StepId = (typeof STEPS)[number]['id']

function qtyLabel(n: number) {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

function parseQty(raw: string) {
  const n = Number(String(raw).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export default function ReceberPedidoForm({
  pedidoId,
  numero,
  itens,
}: {
  pedidoId: string
  numero: string
  itens: Item[]
}) {
  const router = useRouter()
  const [passo, setPasso] = useState<StepId>('conferencia')
  const [linhas, setLinhas] = useState(
    itens.map((item) => ({ id: item.id, quantidade: '', divergencia: '' })),
  )
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const conferidos = itens
    .map((item, index) => {
      const quantidade = parseQty(linhas[index]?.quantidade || '')
      return {
        ...item,
        quantidade,
        divergencia: linhas[index]?.divergencia.trim() || '',
        saldo: item.pedido - item.recebido,
      }
    })
    .filter((item) => item.quantidade > 0)

  function irProximo() {
    setErro(null)
    if (!conferidos.length) {
      setErro('Informe a quantidade recebida de ao menos um item.')
      return
    }
    const estouro = conferidos.find((item) => item.quantidade - item.saldo > 0.0001)
    if (estouro) {
      setErro(`A quantidade de “${estouro.descricao}” passa do saldo.`)
      return
    }
    setPasso('revisao')
  }

  function confirmar() {
    setErro(null)
    if (!conferidos.length) {
      setErro('Informe a quantidade recebida de ao menos um item.')
      setPasso('conferencia')
      return
    }
    const formData = new FormData()
    formData.set('pedido_id', pedidoId)
    if (observacao.trim()) formData.set('observacao', observacao.trim())
    formData.set(
      'itens_json',
      JSON.stringify(
        linhas.map((linha) => ({
          pedido_item_id: linha.id,
          quantidade: parseQty(linha.quantidade),
          divergencia: linha.divergencia.trim() || null,
        })),
      ),
    )
    start(async () => {
      const res = await registrarRecebimento(formData)
      if (res.error) {
        setErro(res.error)
        return
      }
      router.push(`/cockpit/compras/pedidos/${pedidoId}`)
      router.refresh()
    })
  }

  return (
    <PedidoWizard
      steps={STEPS}
      passo={passo}
      numero={numero}
      erro={erro}
      onVoltar={() => {
        setErro(null)
        setPasso('conferencia')
      }}
      onProximo={irProximo}
      onConfirmar={confirmar}
      confirmarLabel="Registrar recebimento"
      proximoDisabled={!conferidos.length}
      pending={pending}
    >
      {passo === 'conferencia' ? (
        <div className="space-y-4" role="tabpanel">
          <div className="space-y-3">
            {itens.map((item, index) => {
              const saldo = item.pedido - item.recebido
              const linha = linhas[index]
              return (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-xl border border-[#ffffff08] bg-[#0A0A0A]/50 p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-5">
                    <p className="truncate text-sm text-white" title={item.descricao}>
                      {item.descricao}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      pedido {qtyLabel(item.pedido)} {item.unidade} · saldo {qtyLabel(saldo)}
                    </p>
                  </div>
                  <input
                    value={linha?.quantidade || ''}
                    onChange={(e) => {
                      const next = [...linhas]
                      next[index] = { ...next[index], quantidade: e.target.value }
                      setLinhas(next)
                    }}
                    inputMode="decimal"
                    placeholder="Qtd recebida"
                    className="rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-white sm:col-span-3"
                  />
                  <input
                    value={linha?.divergencia || ''}
                    onChange={(e) => {
                      const next = [...linhas]
                      next[index] = { ...next[index], divergencia: e.target.value }
                      setLinhas(next)
                    }}
                    placeholder="Divergência"
                    className="rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-white sm:col-span-4"
                  />
                </div>
              )
            })}
          </div>
          <label className="block text-sm text-gray-300">
            Observação da conferência
            <textarea
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-white outline-none focus:border-[#2BAADF]/50"
            />
          </label>
        </div>
      ) : (
        <div className="space-y-5" role="tabpanel">
          <div className="rounded-xl border border-[#ffffff0a] bg-[#0A0A0A]/60 p-4 text-sm">
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-600">
              Conferência
            </p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">Pedido</dt>
                <dd className="font-mono text-[#2BAADF]">{numero}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Itens neste recebimento</dt>
                <dd className="text-white">{conferidos.length}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-500">Observação</dt>
                <dd className="text-white">{observacao.trim() || '—'}</dd>
              </div>
            </dl>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#ffffff0a]">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Receber</th>
                  <th className="px-4 py-2">Divergência</th>
                </tr>
              </thead>
              <tbody>
                {conferidos.map((item) => (
                  <tr key={item.id} className="border-t border-[#ffffff08]">
                    <td className="px-4 py-2 text-white">{item.descricao}</td>
                    <td className="px-4 py-2 text-gray-300">
                      {qtyLabel(item.quantidade)} {item.unidade}
                    </td>
                    <td className="px-4 py-2 text-gray-300">{item.divergencia || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PedidoWizard>
  )
}
