'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { divergenciaPreco, divergenciaQuantidade } from '@/lib/compras/divergencia'
import PedidoWizard from '../../PedidoWizard'
import { registrarRecebimento } from '../../actions'

type Item = {
  id: string
  descricao: string
  unidade: string
  pedido: number
  preco: number
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

function parseMoney(raw: string) {
  const s = String(raw ?? '').trim()
  if (!s) return NaN
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : NaN
}

function maskMoney(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 12)
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPreco(n: number) {
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const cell =
  'h-8 w-full rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 text-sm text-white outline-none focus:border-[#2BAADF]/50'

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
    itens.map((item) => ({
      id: item.id,
      quantidade: '',
      precoNota: formatPreco(item.preco),
    })),
  )
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const conferidos = itens
    .map((item, index) => {
      const quantidade = parseQty(linhas[index]?.quantidade || '')
      const precoNota = parseMoney(linhas[index]?.precoNota || '')
      return {
        ...item,
        quantidade,
        precoNota,
        saldo: item.pedido - item.recebido,
        divergenciaQuantidade: divergenciaQuantidade(quantidade, item.pedido),
        divergenciaPreco: Number.isFinite(precoNota) ? divergenciaPreco(precoNota, item.preco) : 0,
        total: quantidade > 0 && Number.isFinite(precoNota) ? quantidade * precoNota : 0,
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
    const semPreco = conferidos.find((item) => !(item.precoNota >= 0))
    if (semPreco) {
      setErro(`Informe o preço unitário da nota de “${semPreco.descricao}”.`)
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
    const semPreco = conferidos.find((item) => !(item.precoNota >= 0))
    if (semPreco) {
      setErro(`Informe o preço unitário da nota de “${semPreco.descricao}”.`)
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
          preco_nota: parseMoney(linha.precoNota),
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
        <div className="space-y-3" role="tabpanel">
          <div className="overflow-x-auto rounded-xl border border-[#ffffff08]">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Item</th>
                  <th className="px-2 py-1.5 font-medium">Qtd pedido</th>
                  <th className="px-2 py-1.5 font-medium">Preço pedido</th>
                  <th className="px-2 py-1.5 font-medium">Preço nota</th>
                  <th className="px-2 py-1.5 font-medium">Qtd recebida</th>
                  <th className="px-2 py-1.5 font-medium">Div. qtd</th>
                  <th className="px-2 py-1.5 font-medium">Div. preço</th>
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item, index) => {
                  const saldo = item.pedido - item.recebido
                  const linha = linhas[index]
                  const qtd = parseQty(linha?.quantidade || '')
                  const precoNota = parseMoney(linha?.precoNota || '')
                  const total = qtd > 0 && Number.isFinite(precoNota) ? qtd * precoNota : 0
                  const divQtd = qtd > 0 ? divergenciaQuantidade(qtd, item.pedido) : null
                  const divPreco =
                    qtd > 0 && Number.isFinite(precoNota) ? divergenciaPreco(precoNota, item.preco) : null
                  return (
                    <tr key={item.id} className="border-t border-[#ffffff08]">
                      <td className="max-w-[14rem] px-2 py-1">
                        <p className="truncate text-sm text-white" title={item.descricao}>
                          {item.descricao}
                        </p>
                        <p className="text-[10px] leading-tight text-gray-500">
                          saldo {qtyLabel(saldo)} {item.unidade}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-gray-300">
                        {qtyLabel(item.pedido)} {item.unidade}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-gray-300">
                        {formatMoney(item.preco)}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          aria-label="Preço unitário da nota"
                          inputMode="numeric"
                          value={linha?.precoNota || ''}
                          onChange={(e) => {
                            const next = [...linhas]
                            next[index] = { ...next[index], precoNota: maskMoney(e.target.value) }
                            setLinhas(next)
                          }}
                          className={`${cell} w-28 text-right`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          aria-label="Quantidade recebida"
                          value={linha?.quantidade || ''}
                          onChange={(e) => {
                            const next = [...linhas]
                            next[index] = { ...next[index], quantidade: e.target.value }
                            setLinhas(next)
                          }}
                          inputMode="decimal"
                          className={`${cell} w-24`}
                        />
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-1 ${divQtd ? 'text-amber-300' : 'text-gray-400'}`}
                      >
                        {divQtd == null ? '—' : `${qtyLabel(divQtd)} ${item.unidade}`}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-1 ${divPreco ? 'text-amber-300' : 'text-gray-400'}`}
                      >
                        {divPreco == null ? '—' : formatMoney(divPreco)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right font-medium text-white">
                        {formatMoney(total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <label className="block text-sm text-gray-300">
            Observação da conferência
            <textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 py-1.5 text-sm text-white outline-none focus:border-[#2BAADF]/50"
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
                  <th className="px-3 py-1.5">Item</th>
                  <th className="px-3 py-1.5">Qtd pedido</th>
                  <th className="px-3 py-1.5">Preço nota</th>
                  <th className="px-3 py-1.5">Receber</th>
                  <th className="px-3 py-1.5">Div. qtd</th>
                  <th className="px-3 py-1.5">Div. preço</th>
                  <th className="px-3 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {conferidos.map((item) => (
                  <tr key={item.id} className="border-t border-[#ffffff08]">
                    <td className="px-3 py-1 text-white">{item.descricao}</td>
                    <td className="px-3 py-1 text-gray-300">
                      {qtyLabel(item.pedido)} {item.unidade}
                    </td>
                    <td className="px-3 py-1 text-gray-300">{formatMoney(item.precoNota)}</td>
                    <td className="px-3 py-1 text-gray-300">
                      {qtyLabel(item.quantidade)} {item.unidade}
                    </td>
                    <td className="px-3 py-1 text-gray-300">
                      {qtyLabel(item.divergenciaQuantidade)} {item.unidade}
                    </td>
                    <td className="px-3 py-1 text-gray-300">{formatMoney(item.divergenciaPreco)}</td>
                    <td className="px-3 py-1 text-right text-white">{formatMoney(item.total)}</td>
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
