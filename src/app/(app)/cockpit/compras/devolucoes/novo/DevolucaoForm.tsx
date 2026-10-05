'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import PedidoWizard from '../../pedidos/PedidoWizard'
import { DEVOLUCAO_MOTIVO_LABEL } from '@/lib/compras/devolucao-status'
import { PEDIDO_STATUS_LABEL } from '@/lib/compras/pedido-status'
import type { PedidoDevolucaoCarregado, PedidoDevolucaoResumo } from '@/lib/compras/devolucao-pedidos'
import { abrirPedidoDevolucao, lancarDevolucao, localizarPedidosDevolucao } from '../actions'

const STEPS = [
  { id: 'pedido', label: '1. Pedido', hint: 'Filtre número, fornecedor, data ou status' },
  { id: 'itens', label: '2. Itens', hint: 'Quantidade e motivo da devolução' },
  { id: 'revisao', label: '3. Revisão', hint: 'Confirme o documento' },
] as const

type StepId = (typeof STEPS)[number]['id']

const field =
  'h-8 w-full rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 text-sm text-white outline-none focus:border-[#2BAADF]/50 [color-scheme:dark]'

const filtroClass =
  'mt-1 h-9 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 text-sm text-white outline-none focus:border-[#2BAADF]/50 [color-scheme:dark]'

function parseQty(raw: string) {
  const n = Number(String(raw).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function qtyLabel(n: number) {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

export default function DevolucaoForm({
  fornecedores,
  pedidoInicial,
}: {
  fornecedores: Array<{ id: string; nome: string }>
  pedidoInicial?: PedidoDevolucaoCarregado | null
}) {
  const router = useRouter()
  const [passo, setPasso] = useState<StepId>(pedidoInicial ? 'itens' : 'pedido')
  const [pedido, setPedido] = useState<PedidoDevolucaoCarregado | null>(pedidoInicial || null)
  const [selecionadoId, setSelecionadoId] = useState(pedidoInicial?.id || '')
  const [numero, setNumero] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [data, setData] = useState('')
  const [status, setStatus] = useState('')
  const [resultados, setResultados] = useState<PedidoDevolucaoResumo[]>([])
  const [buscando, setBuscando] = useState(false)
  const [linhas, setLinhas] = useState(() =>
    (pedidoInicial?.itens || []).map((item) => ({ id: item.id, quantidade: '', motivo: '' })),
  )
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const devolvendo = (pedido?.itens || [])
    .map((item, index) => ({
      ...item,
      quantidade: parseQty(linhas[index]?.quantidade || ''),
      motivo: linhas[index]?.motivo || '',
      saldo: item.recebido - item.devolvido,
    }))
    .filter((item) => item.quantidade > 0)

  async function buscar(event?: FormEvent) {
    event?.preventDefault()
    setErro(null)
    setBuscando(true)
    const res = await localizarPedidosDevolucao({ q: numero, fornecedor, data, status })
    setBuscando(false)
    if (res.error) {
      setErro(res.error)
      setResultados([])
      return
    }
    setResultados(res.pedidos)
    if (!res.pedidos.some((row) => row.id === selecionadoId)) setSelecionadoId('')
  }

  useEffect(() => {
    void buscar()
    // A lista inicial mostra os 50 recebimentos mais recentes da empresa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function validar() {
    if (!devolvendo.length) return 'Informe a quantidade de ao menos um item.'
    const estouro = devolvendo.find((item) => item.quantidade - item.saldo > 0.0001)
    if (estouro) return `A quantidade de “${estouro.descricao}” passa do que ainda pode ser devolvido.`
    const semMotivo = devolvendo.find((item) => !DEVOLUCAO_MOTIVO_LABEL[item.motivo])
    if (semMotivo) return `Escolha o motivo de “${semMotivo.descricao}”: SKU trocado, avaria ou outro.`
    return null
  }

  function irProximo() {
    setErro(null)
    if (passo === 'pedido') {
      if (!selecionadoId) {
        setErro('Selecione um pedido da lista.')
        return
      }
      start(async () => {
        const res = await abrirPedidoDevolucao(selecionadoId)
        if (res.error || !res.pedido) {
          setErro(res.error || 'Pedido não encontrado.')
          return
        }
        setPedido(res.pedido)
        setLinhas(res.pedido.itens.map((item) => ({ id: item.id, quantidade: '', motivo: '' })))
        setPasso('itens')
      })
      return
    }
    const falha = validar()
    if (falha) {
      setErro(falha)
      return
    }
    setPasso('revisao')
  }

  function salvar(confirmar: boolean) {
    if (!pedido) return
    const falha = validar()
    if (falha) {
      setErro(falha)
      setPasso('itens')
      return
    }
    setErro(null)
    start(async () => {
      const res = await lancarDevolucao({
        pedido_id: pedido.id,
        observacao,
        confirmar,
        itens: devolvendo.map((item) => ({
          pedido_item_id: item.id,
          quantidade: item.quantidade,
          motivo: item.motivo,
        })),
      })
      if (res.error) {
        setErro(res.error)
        return
      }
      if (res.id) router.push(`/cockpit/compras/devolucoes/${res.id}`)
    })
  }

  return (
    <PedidoWizard
      steps={STEPS}
      passo={passo}
      numero={pedido?.numero}
      erro={erro}
      onVoltar={() => {
        setErro(null)
        if (passo === 'itens') setPasso('pedido')
        else if (passo === 'revisao') setPasso('itens')
        else router.push('/cockpit/compras/devolucoes')
      }}
      onProximo={passo === 'revisao' ? undefined : irProximo}
      onConfirmar={passo === 'revisao' ? () => salvar(true) : undefined}
      confirmarLabel="Confirmar devolução"
      pending={pending}
    >
      {passo === 'pedido' ? (
        <div className="space-y-3" role="tabpanel">
          <form onSubmit={buscar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-gray-400">
              Número
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Trecho do número"
                className={filtroClass}
              />
            </label>
            <label className="block text-xs text-gray-400">
              Fornecedor
              <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className={filtroClass}>
                <option value="">Todos</option>
                {fornecedores.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-400">
              Data do pedido
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={filtroClass} />
            </label>
            <label className="block text-xs text-gray-400">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={filtroClass}>
                <option value="">Recebidos</option>
                <option value="recebido_parcial">Recebido parcial</option>
                <option value="recebido">Recebido</option>
              </select>
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={buscando}
                className="rounded-xl bg-[#2BAADF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {buscando ? 'Buscando…' : 'Filtrar'}
              </button>
            </div>
          </form>
          <p className="text-xs text-gray-500">Até 50 pedidos. Use os filtros para achar um mais antigo.</p>
          <div className="overflow-hidden rounded-xl border border-[#ffffff08]">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Pedido</th>
                  <th className="px-3 py-2 font-medium">Fornecedor</th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((row) => {
                  const ativo = row.id === selecionadoId
                  return (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-[#ffffff08] ${ativo ? 'bg-[#2BAADF]/10' : 'hover:bg-[#ffffff06]'}`}
                      onClick={() => setSelecionadoId(row.id)}
                    >
                      <td className="px-3 py-2">
                        <label className="flex cursor-pointer items-center gap-2 text-white">
                          <input
                            type="radio"
                            name="pedido"
                            checked={ativo}
                            onChange={() => setSelecionadoId(row.id)}
                          />
                          {row.numero}
                        </label>
                      </td>
                      <td className="px-3 py-2 text-gray-300">{row.fornecedorNome}</td>
                      <td className="px-3 py-2 text-gray-400">
                        {new Date(row.data).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-gray-300">{PEDIDO_STATUS_LABEL[row.status] || row.status}</td>
                    </tr>
                  )
                })}
                {!resultados.length && !buscando ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                      Nenhum pedido com esses filtros.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {passo === 'itens' ? (
        <div className="space-y-3" role="tabpanel">
          <div className="overflow-x-auto rounded-xl border border-[#ffffff08]">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Item</th>
                  <th className="px-2 py-1.5 font-medium">Recebido</th>
                  <th className="px-2 py-1.5 font-medium">Já devolvido</th>
                  <th className="px-2 py-1.5 font-medium">Devolver</th>
                  <th className="px-2 py-1.5 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {(pedido?.itens || []).map((item, index) => (
                  <tr key={item.id} className="border-t border-[#ffffff08]">
                    <td className="max-w-[16rem] truncate px-2 py-1 text-white" title={item.descricao}>
                      {item.descricao}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-gray-300">
                      {qtyLabel(item.recebido)} {item.unidade}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-gray-300">
                      {qtyLabel(item.devolvido)} {item.unidade}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label="Quantidade a devolver"
                        inputMode="decimal"
                        value={linhas[index]?.quantidade || ''}
                        onChange={(e) => {
                          const next = [...linhas]
                          next[index] = { ...next[index], quantidade: e.target.value }
                          setLinhas(next)
                        }}
                        className={`${field} w-24`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        aria-label="Motivo"
                        value={linhas[index]?.motivo || ''}
                        onChange={(e) => {
                          const next = [...linhas]
                          next[index] = { ...next[index], motivo: e.target.value }
                          setLinhas(next)
                        }}
                        className={`${field} w-40`}
                      >
                        <option value="">—</option>
                        {Object.entries(DEVOLUCAO_MOTIVO_LABEL).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="block text-sm text-gray-300">
            Observação
            <textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 py-1.5 text-sm text-white outline-none focus:border-[#2BAADF]/50"
            />
          </label>
        </div>
      ) : null}

      {passo === 'revisao' ? (
        <div className="space-y-3 text-sm" role="tabpanel">
          <p className="text-white">
            {pedido?.numero} · {pedido?.fornecedorNome} · {devolvendo.length} item(ns)
          </p>
          <p className="text-xs text-gray-500">
            Este documento não emite NF-e, não gera título e não movimenta o estoque.
          </p>
          <button type="button" disabled={pending} onClick={() => salvar(false)} className="text-sm text-[#2BAADF]">
            Salvar rascunho
          </button>
        </div>
      ) : null}
    </PedidoWizard>
  )
}
