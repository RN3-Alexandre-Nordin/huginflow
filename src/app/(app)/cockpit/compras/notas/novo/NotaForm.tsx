'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import SearchableSelect from '@/components/SearchableSelect'
import { PEDIDO_STATUS_LABEL } from '@/lib/compras/pedido-status'
import PedidoWizard from '../../pedidos/PedidoWizard'
import { lancarNota, lerXmlNota } from '../actions'

type ItemPedido = {
  id: string
  skuId: string | null
  descricao: string
  quantidade: string
  unidade: string
  preco: string
}

export type PedidoNotaOption = {
  id: string
  numero: string
  status: string
  fornecedorNome: string
  fornecedorDocumento: string
  itens: ItemPedido[]
}

const STEPS = [
  { id: 'pedido', label: '1. Pedido', hint: 'Pedido aprovado ou em recebimento' },
  { id: 'nota', label: '2. Nota', hint: 'Número, série, chave ou XML' },
  { id: 'itens', label: '3. Itens', hint: 'Quantidade e preço da nota' },
  { id: 'revisao', label: '4. Revisão', hint: 'Confirme a nota de entrada' },
] as const

type StepId = (typeof STEPS)[number]['id']

const field =
  'mt-1 h-9 w-full rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 text-sm text-white outline-none focus:border-[#2BAADF]/50'

function numero(raw: string) {
  const s = String(raw ?? '').trim()
  if (!s) return NaN
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : NaN
}

function maskPreco(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 12)
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatPreco(raw: string) {
  const n = numero(raw)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function digitos(value: string) {
  return value.replace(/\D/g, '')
}

export default function NotaForm({
  pedidos,
  pedidoInicial,
}: {
  pedidos: PedidoNotaOption[]
  pedidoInicial?: string
}) {
  const router = useRouter()
  const [passo, setPasso] = useState<StepId>('pedido')
  const [pedidoId, setPedidoId] = useState(pedidoInicial || '')
  const [numeroNf, setNumeroNf] = useState('')
  const [serie, setSerie] = useState('1')
  const [chave, setChave] = useState('')
  const [emissao, setEmissao] = useState('')
  const [observacao, setObservacao] = useState('')
  const [origem, setOrigem] = useState<'manual' | 'xml'>('manual')
  const [emitenteDocumento, setEmitenteDocumento] = useState('')
  const [emitenteNome, setEmitenteNome] = useState('')
  const [itens, setItens] = useState<ItemPedido[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const pedido = pedidos.find((p) => p.id === pedidoId)
  const valor = itens.reduce((s, i) => {
    const qtd = numero(i.quantidade)
    const preco = numero(i.preco)
    if (!Number.isFinite(qtd) || !Number.isFinite(preco)) return s
    return s + qtd * preco
  }, 0)

  const opcoes = useMemo(
    () =>
      pedidos.map((p) => ({
        id: p.id,
        nome: `${p.numero} · ${p.fornecedorNome} · ${PEDIDO_STATUS_LABEL[p.status] || p.status}`,
      })),
    [pedidos],
  )

  function escolherPedido(id: string) {
    const next = pedidos.find((p) => p.id === id)
    setPedidoId(id)
    setItens(
      (next?.itens || []).map((item) => ({
        ...item,
        preco: formatPreco(item.preco),
      })),
    )
    setOrigem('manual')
    setEmitenteDocumento('')
    setEmitenteNome('')
  }

  function irProximo() {
    setErro(null)
    if (passo === 'pedido') {
      if (!pedido) {
        setErro('Selecione o pedido.')
        return
      }
      setPasso('nota')
      return
    }
    if (passo === 'nota') {
      if (!numeroNf.trim() || !emissao) {
        setErro('Informe o número e a data de emissão.')
        return
      }
      if (chave && digitos(chave).length !== 44) {
        setErro('A chave de acesso precisa ter 44 dígitos.')
        return
      }
      if (origem === 'xml') {
        const docPedido = digitos(pedido?.fornecedorDocumento || '')
        if (!emitenteDocumento || emitenteDocumento !== docPedido) {
          setErro('O CNPJ do XML não é o mesmo do fornecedor do pedido.')
          return
        }
      }
      setPasso('itens')
      return
    }
    if (itens.some((i) => !(numero(i.quantidade) > 0) || !Number.isFinite(numero(i.preco)))) {
      setErro('Informe quantidade e preço válidos em todos os itens.')
      return
    }
    setPasso('revisao')
  }

  function irVoltar() {
    setErro(null)
    if (passo === 'nota') setPasso('pedido')
    else if (passo === 'itens') setPasso('nota')
    else if (passo === 'revisao') setPasso('itens')
  }

  function salvar(confirmar: boolean) {
    if (!pedido) return
    setErro(null)
    start(async () => {
      const res = await lancarNota({
        pedido_id: pedido.id,
        numero: numeroNf,
        serie,
        chave,
        data_emissao: emissao,
        observacao,
        origem,
        emitente_documento: emitenteDocumento,
        confirmar,
        itens: itens.map((i) => ({
          pedido_item_id: i.id,
          sku_id: i.skuId,
          descricao: i.descricao,
          quantidade: numero(i.quantidade),
          unidade: i.unidade,
          preco_unitario: numero(i.preco),
        })),
      })
      if ('error' in res && res.error) {
        setErro(res.error)
        return
      }
      if ('id' in res && res.id) router.push(`/cockpit/compras/notas/${res.id}`)
    })
  }

  return (
    <PedidoWizard
      steps={STEPS}
      passo={passo}
      numero={pedido?.numero}
      erro={erro}
      onVoltar={passo === 'pedido' ? () => router.push('/cockpit/compras/notas') : irVoltar}
      onProximo={passo === 'revisao' ? undefined : irProximo}
      onConfirmar={passo === 'revisao' ? () => salvar(true) : undefined}
      confirmarLabel="Confirmar nota"
      pending={pending}
    >
      {passo === 'pedido' ? (
        <div role="tabpanel">
          <label className="block text-sm text-gray-300">
            Pedido
            <div className="mt-1">
              <SearchableSelect
                value={pedidoId}
                onChange={escolherPedido}
                options={opcoes}
                placeholder="Buscar pedido…"
                emptyLabel="Nenhum pedido aprovado"
              />
            </div>
          </label>
        </div>
      ) : null}

      {passo === 'nota' ? (
        <div className="grid gap-3 sm:grid-cols-2" role="tabpanel">
          <label className="block text-sm text-gray-300 sm:col-span-2">
            XML da NF-e
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              className="mt-1 block w-full text-xs text-gray-400"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  const xml = String(reader.result || '')
                  start(async () => {
                    const res = await lerXmlNota(xml)
                    if ('error' in res && res.error) {
                      setErro(res.error)
                      return
                    }
                    if (!('ok' in res) || !res.ok) return
                    setErro(null)
                    setNumeroNf(res.numero ?? '')
                    setSerie(res.serie || '1')
                    setChave(res.chave ?? '')
                    setEmissao(res.data_emissao ?? '')
                    setOrigem('xml')
                    setEmitenteDocumento(res.emitente_documento ?? '')
                    setEmitenteNome(res.emitente_nome ?? '')
                  })
                }
                reader.readAsText(file)
              }}
            />
          </label>
          {emitenteNome ? (
            <p className="text-xs text-gray-400 sm:col-span-2">
              Emitente do XML: {emitenteNome}
            </p>
          ) : null}
          <label className="block text-sm text-gray-300">
            Número
            <input value={numeroNf} onChange={(e) => setNumeroNf(e.target.value)} className={field} />
          </label>
          <label className="block text-sm text-gray-300">
            Série
            <input value={serie} onChange={(e) => setSerie(e.target.value)} className={field} />
          </label>
          <label className="block text-sm text-gray-300">
            Chave de acesso
            <input value={chave} onChange={(e) => setChave(e.target.value)} className={field} />
          </label>
          <label className="block text-sm text-gray-300">
            Emissão
            <input
              type="date"
              value={emissao}
              onChange={(e) => setEmissao(e.target.value)}
              className={field}
            />
          </label>
          <label className="block text-sm text-gray-300 sm:col-span-2">
            Observação
            <textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className={field}
            />
          </label>
        </div>
      ) : null}

      {passo === 'itens' ? (
        <div className="overflow-hidden rounded-xl border border-[#ffffff08]" role="tabpanel">
          {itens.map((item, index) => (
            <div
              key={item.id}
              className="grid items-center gap-x-2 border-t border-[#ffffff08] px-3 py-1 first:border-t-0 sm:grid-cols-12"
            >
              <p className="truncate text-sm text-white sm:col-span-5" title={item.descricao}>
                {item.descricao}
              </p>
              <input
                aria-label="Quantidade"
                value={item.quantidade}
                onChange={(e) => {
                  const next = [...itens]
                  next[index] = { ...item, quantidade: e.target.value }
                  setItens(next)
                }}
                className="h-8 rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 text-sm text-white sm:col-span-2"
              />
              <input
                readOnly
                value={item.unidade}
                className="h-8 rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 text-sm text-gray-300 sm:col-span-1"
              />
              <input
                aria-label="Preço unitário"
                inputMode="numeric"
                value={item.preco}
                onChange={(e) => {
                  const next = [...itens]
                  next[index] = { ...item, preco: maskPreco(e.target.value) }
                  setItens(next)
                }}
                className="h-8 rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 text-right text-sm text-white sm:col-span-2"
              />
              <p className="text-right text-sm font-semibold text-white sm:col-span-2">
                {money((numero(item.quantidade) || 0) * (numero(item.preco) || 0))}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {passo === 'revisao' ? (
        <div className="space-y-3 text-sm" role="tabpanel">
          <p className="text-white">
            NF {numeroNf}/{serie} · {pedido?.fornecedorNome} · {money(valor)}
          </p>
          <p className="text-xs text-gray-500">
            Confirmar grava a nota. A entrada de estoque fica para a fase seguinte.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => salvar(false)}
            className="text-sm text-[#2BAADF]"
          >
            Salvar rascunho
          </button>
        </div>
      ) : null}
    </PedidoWizard>
  )
}
