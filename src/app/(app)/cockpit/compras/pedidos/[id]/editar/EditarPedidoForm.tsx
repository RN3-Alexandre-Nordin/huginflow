'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import SearchableSelect from '@/components/SearchableSelect'
import PedidoWizard from '../../PedidoWizard'
import { atualizarPedido } from '../../actions'

type Fornecedor = { id: string; nome: string; documento?: string | null }
type Item = {
  id: string
  descricao: string
  unidade: string
  quantidade: string
  preco: string
}

const STEPS = [
  { id: 'cabecalho', label: '1. Cabeçalho', hint: 'Fornecedor, previsão e observação' },
  { id: 'itens', label: '2. Itens', hint: 'Quantidade e preço dos itens já lançados' },
  { id: 'revisao', label: '3. Revisão', hint: 'Confira e salve. O número não muda.' },
] as const

type StepId = (typeof STEPS)[number]['id']

const inputClass =
  'mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-white outline-none focus:border-[#2BAADF]/50 [color-scheme:dark]'

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function numero(raw: string) {
  const s = String(raw ?? '').trim()
  if (!s) return NaN
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : NaN
}

function formatPreco(raw: string) {
  const n = numero(raw)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function maskPreco(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 12)
  if (!digits) return ''
  const n = Number(digits) / 100
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function EditarPedidoForm({
  pedidoId,
  numero: numeroPedido,
  fornecedorId,
  previsao: previsaoInicial,
  observacao: observacaoInicial,
  fornecedores,
  itensIniciais,
  valorAprovado,
}: {
  pedidoId: string
  numero: string
  statusLabel: string
  fornecedorId: string
  previsao: string
  observacao: string
  fornecedores: Fornecedor[]
  itensIniciais: Item[]
  valorAprovado: boolean
}) {
  const router = useRouter()
  const [passo, setPasso] = useState<StepId>('cabecalho')
  const [fornecedor, setFornecedor] = useState(fornecedorId)
  const [previsao, setPrevisao] = useState(previsaoInicial)
  const [observacao, setObservacao] = useState(observacaoInicial)
  const [itens, setItens] = useState(() =>
    itensIniciais.map((item) => ({ ...item, preco: formatPreco(item.preco) })),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const fornecedorNome = fornecedores.find((f) => f.id === fornecedor)?.nome || '—'
  const valorOriginal = useMemo(
    () => itensIniciais.reduce((s, i) => s + numero(i.quantidade) * numero(i.preco), 0),
    [itensIniciais],
  )
  const valor = itens.reduce((s, i) => {
    const qtd = numero(i.quantidade)
    const preco = numero(i.preco)
    if (!Number.isFinite(qtd) || !Number.isFinite(preco)) return s
    return s + qtd * preco
  }, 0)
  const itensOk = itens.every((i) => {
    const qtd = numero(i.quantidade)
    const preco = numero(i.preco)
    return Number.isFinite(qtd) && qtd > 0 && Number.isFinite(preco) && preco >= 0
  })
  const valorMudou = Math.round(valor * 100) !== Math.round(valorOriginal * 100)

  function irProximo() {
    setErro(null)
    if (passo === 'cabecalho') {
      if (!fornecedor) {
        setErro('Selecione o fornecedor.')
        return
      }
      setPasso('itens')
      return
    }
    if (!itensOk) {
      setErro('Informe quantidade e preço válidos em todos os itens.')
      return
    }
    setPasso('revisao')
  }

  function irVoltar() {
    setErro(null)
    if (passo === 'itens') setPasso('cabecalho')
    else if (passo === 'revisao') setPasso('itens')
  }

  function salvar() {
    setErro(null)
    if (!fornecedor || !itensOk) {
      setErro('Revise o cabeçalho e os itens antes de salvar.')
      return
    }
    const formData = new FormData()
    formData.set('pedido_id', pedidoId)
    formData.set('fornecedor_id', fornecedor)
    if (previsao) formData.set('previsao_chegada', previsao)
    if (observacao.trim()) formData.set('observacao', observacao.trim())
    formData.set(
      'itens_json',
      JSON.stringify(
        itens.map((i) => ({
          id: i.id,
          quantidade: numero(i.quantidade),
          preco_unitario: numero(i.preco),
        })),
      ),
    )
    start(async () => {
      const res = await atualizarPedido(formData)
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
      numero={numeroPedido}
      erro={erro}
      onVoltar={irVoltar}
      onProximo={irProximo}
      onConfirmar={salvar}
      confirmarLabel="Salvar pedido"
      proximoDisabled={passo === 'cabecalho' ? !fornecedor : !itensOk}
      pending={pending}
    >
      {passo === 'cabecalho' ? (
        <div className="space-y-4" role="tabpanel">
          <div className="block text-sm text-gray-300">
            <span className="mb-1 block">Fornecedor *</span>
            <SearchableSelect
              value={fornecedor}
              onChange={setFornecedor}
              options={fornecedores.map((f) => ({
                id: f.id,
                nome: f.documento ? `${f.nome} (${f.documento})` : f.nome,
              }))}
              placeholder="Buscar fornecedor…"
              emptyLabel="Nenhum fornecedor"
            />
          </div>
          <label className="block text-sm text-gray-300">
            Previsão de chegada
            <input
              type="date"
              value={previsao}
              onChange={(e) => setPrevisao(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm text-gray-300">
            Observação
            <textarea
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      ) : null}

      {passo === 'itens' ? (
        <div role="tabpanel">
          {valorAprovado ? (
            <p className="mb-2 text-xs text-amber-300/90">
              Se o valor total mudar, o pedido volta para aprovação.
            </p>
          ) : null}
          <div className="overflow-hidden rounded-xl border border-[#ffffff08]">
            {itens.map((item, index) => {
              const qtd = numero(item.quantidade)
              const preco = numero(item.preco)
              const totalLinha = Number.isFinite(qtd) && Number.isFinite(preco) ? qtd * preco : 0
              const field =
                'h-8 w-full rounded-lg border border-[#ffffff14] bg-[#0A0A0A] px-2 text-sm text-white'
              return (
                <div
                  key={item.id}
                  className="grid items-center gap-x-2 border-t border-[#ffffff08] px-3 py-1 first:border-t-0 sm:grid-cols-12"
                >
                  <p className="truncate text-sm text-white sm:col-span-4" title={item.descricao}>
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
                    className={`${field} sm:col-span-2`}
                  />
                  <input
                    readOnly
                    aria-label="Unidade"
                    value={item.unidade}
                    className={`${field} text-gray-300 sm:col-span-1`}
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
                    placeholder="0,00"
                    className={`${field} text-right sm:col-span-2`}
                  />
                  <p className="flex items-center justify-end text-sm font-semibold text-white sm:col-span-3">
                    {money(totalLinha)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {passo === 'revisao' ? (
        <div className="space-y-5" role="tabpanel">
          <div className="rounded-xl border border-[#ffffff0a] bg-[#0A0A0A]/60 p-4 text-sm">
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-600">
              Cabeçalho
            </p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">Número</dt>
                <dd className="font-mono text-[#2BAADF]">{numeroPedido}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Fornecedor</dt>
                <dd className="text-white">{fornecedorNome}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Previsão</dt>
                <dd className="text-white">
                  {previsao ? new Date(`${previsao}T12:00:00`).toLocaleDateString('pt-BR') : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Valor total</dt>
                <dd className="text-white">{money(valor)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-500">Observação</dt>
                <dd className="text-white">{observacao.trim() || '—'}</dd>
              </div>
            </dl>
            {valorAprovado && valorMudou ? (
              <p className="mt-3 text-xs text-amber-300/90">
                O valor mudou. Ao salvar, o pedido volta para aprovação.
              </p>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-xl border border-[#ffffff0a]">
            <p className="border-b border-[#ffffff08] bg-[#0A0A0A] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600">
              Itens ({itens.length})
            </p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Qtd</th>
                  <th className="px-4 py-2">Preço</th>
                  <th className="px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => {
                  const qtd = numero(item.quantidade)
                  const preco = numero(item.preco)
                  return (
                    <tr key={item.id} className="border-t border-[#ffffff08]">
                      <td className="px-4 py-2 text-white">{item.descricao}</td>
                      <td className="px-4 py-2 text-gray-300">
                        {item.quantidade} {item.unidade}
                      </td>
                      <td className="px-4 py-2 text-gray-300">{money(preco)}</td>
                      <td className="px-4 py-2 text-gray-300">{money(qtd * preco)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </PedidoWizard>
  )
}
