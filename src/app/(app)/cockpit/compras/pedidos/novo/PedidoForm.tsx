'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import SearchableSelect from '@/components/SearchableSelect'
import { TIPOS_COMPRA, TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import { registrarPedido } from '../../actions'

type PessoaOption = { id: string; nome: string; documento?: string | null; email?: string | null }
type FornecedorOption = { id: string; nome: string; documento?: string | null }
type SkuOption = {
  id: string
  codigo: string
  nome: string
  unidade_compra: string | null
  preco_custo: number | string | null
}
type ServicoOption = {
  id: string
  codigo: string
  nome: string
  unidade: string | null
  preco_referencia: number | string | null
}

type Item = {
  sku_id: string
  servico_id: string
  descricao: string
  quantidade: string
  unidade: string
  preco: string
}

const STEPS = [
  { id: 'cabecalho', label: '1. Cabeçalho', hint: 'Comprador, fornecedor e previsão' },
  { id: 'itens', label: '2. Itens', hint: 'SKU ou serviço do cadastro' },
  { id: 'revisao', label: '3. Revisão', hint: 'Confira e registre' },
] as const

type StepId = (typeof STEPS)[number]['id']

const inputClass =
  'mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-white outline-none focus:border-[#2BAADF]/50 [color-scheme:dark]'

type Props = {
  pedidoId: string
  numero: string
  pessoas: PessoaOption[]
  fornecedores: FornecedorOption[]
  skus: SkuOption[]
  servicos: ServicoOption[]
  defaultCompradorId: string
}

function formatMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function emptyItem(): Item {
  return { sku_id: '', servico_id: '', descricao: '', quantidade: '1', unidade: 'UN', preco: '0' }
}

export default function PedidoForm({
  pedidoId,
  numero,
  pessoas,
  fornecedores,
  skus,
  servicos,
  defaultCompradorId,
}: Props) {
  const router = useRouter()
  const [passo, setPasso] = useState<StepId>('cabecalho')
  const [compradorId, setCompradorId] = useState(defaultCompradorId)
  const [fornecedorId, setFornecedorId] = useState('')
  const [tipo, setTipo] = useState<TipoCompra>('produtivo')
  const [previsao, setPrevisao] = useState('')
  const [observacao, setObservacao] = useState('')
  const [itens, setItens] = useState<Item[]>([emptyItem()])
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const ehServico = tipo === 'servico'
  const comprador = pessoas.find((p) => p.id === compradorId)
  const fornecedor = fornecedores.find((f) => f.id === fornecedorId)
  const cabecalhoOk = Boolean(compradorId && fornecedorId && tipo)

  const itensValidos = useMemo(
    () =>
      itens.filter((i) => {
        const qtd = Number(i.quantidade.replace(',', '.'))
        const preco = Number(i.preco.replace(',', '.'))
        if (!(Number.isFinite(qtd) && qtd > 0 && Number.isFinite(preco) && preco >= 0)) return false
        return ehServico ? Boolean(i.servico_id) : Boolean(i.sku_id || i.descricao.trim())
      }),
    [itens, ehServico],
  )
  const itensOk = itensValidos.length > 0
  const valorTotal = itensValidos.reduce(
    (s, i) => s + Number(i.quantidade.replace(',', '.')) * Number(i.preco.replace(',', '.')),
    0,
  )

  function onTipoChange(next: TipoCompra) {
    setTipo(next)
    setItens([emptyItem()])
    setErro(null)
  }

  function applySku(index: number, skuId: string) {
    const sku = skus.find((s) => s.id === skuId)
    setItens((prev) => {
      const next = [...prev]
      const current = next[index]
      if (!current) return prev
      if (!sku) {
        next[index] = { ...current, sku_id: '', servico_id: '' }
        return next
      }
      const preco = Number(sku.preco_custo ?? 0)
      next[index] = {
        ...current,
        sku_id: sku.id,
        servico_id: '',
        descricao: `${sku.codigo} — ${sku.nome}`,
        unidade: (sku.unidade_compra || 'UN').toUpperCase(),
        preco: Number.isFinite(preco) ? String(preco) : '0',
      }
      return next
    })
  }

  function applyServico(index: number, servicoId: string) {
    const servico = servicos.find((s) => s.id === servicoId)
    setItens((prev) => {
      const next = [...prev]
      const current = next[index]
      if (!current) return prev
      if (!servico) {
        next[index] = { ...current, servico_id: '', sku_id: '' }
        return next
      }
      const preco = Number(servico.preco_referencia ?? 0)
      next[index] = {
        ...current,
        servico_id: servico.id,
        sku_id: '',
        descricao: `${servico.codigo} — ${servico.nome}`,
        unidade: (servico.unidade || 'UN').toUpperCase(),
        preco: Number.isFinite(preco) ? String(preco) : '0',
      }
      return next
    })
  }

  function updateItem(index: number, patch: Partial<Item>) {
    setItens((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  function irProximo() {
    setErro(null)
    if (passo === 'cabecalho') {
      if (!cabecalhoOk) {
        setErro('Selecione comprador, fornecedor e tipo.')
        return
      }
      setPasso('itens')
      return
    }
    if (passo === 'itens') {
      if (!itensOk) {
        setErro(
          ehServico
            ? 'Inclua ao menos um serviço com quantidade e preço.'
            : 'Inclua ao menos um SKU com quantidade e preço.',
        )
        return
      }
      setPasso('revisao')
    }
  }

  function irVoltar() {
    setErro(null)
    if (passo === 'itens') setPasso('cabecalho')
    else if (passo === 'revisao') setPasso('itens')
  }

  function registrar() {
    setErro(null)
    if (!cabecalhoOk || !itensOk) {
      setErro('Revise o cabeçalho e os itens antes de registrar.')
      return
    }
    const formData = new FormData()
    formData.set('pedido_id', pedidoId)
    formData.set('comprador_pessoa_id', compradorId)
    formData.set('fornecedor_id', fornecedorId)
    formData.set('tipo', tipo)
    if (previsao) formData.set('previsao_chegada', previsao)
    if (observacao.trim()) formData.set('observacao', observacao.trim())
    formData.set(
      'itens_json',
      JSON.stringify(
        itensValidos.map((i) => ({
          sku_id: ehServico ? undefined : i.sku_id || undefined,
          servico_id: ehServico ? i.servico_id : undefined,
          descricao: i.descricao.trim(),
          quantidade: Number(i.quantidade.replace(',', '.')),
          unidade: i.unidade || 'UN',
          preco_unitario: Number(i.preco.replace(',', '.')),
        })),
      ),
    )
    start(async () => {
      const res = await registrarPedido(formData)
      if (res.error) {
        setErro(res.error)
        return
      }
      router.push('/cockpit/compras/pedidos')
    })
  }

  const stepMeta = STEPS.find((s) => s.id === passo) || STEPS[0]
  const pessoaOptions = pessoas.map((p) => ({
    id: p.id,
    nome: p.documento ? `${p.nome} (${p.documento})` : p.nome,
  }))
  const fornecedorOptions = fornecedores.map((f) => ({
    id: f.id,
    nome: f.documento ? `${f.nome} (${f.documento})` : f.nome,
  }))
  const skuOptions = skus.map((s) => ({
    value: s.id,
    label: `${s.codigo} — ${s.nome}`,
    searchText: `${s.codigo} ${s.nome}`,
  }))
  const servicoOptions = servicos.map((s) => ({
    value: s.id,
    label: `${s.codigo} — ${s.nome}`,
    searchText: `${s.codigo} ${s.nome}`,
  }))

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
      <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
        <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
          Passos
        </p>
        <nav className="grid grid-cols-3 gap-1.5" role="tablist">
          {STEPS.map((item) => {
            const active = item.id === passo
            const done =
              (item.id === 'cabecalho' && (passo === 'itens' || passo === 'revisao')) ||
              (item.id === 'itens' && passo === 'revisao')
            return (
              <div
                key={item.id}
                role="tab"
                aria-selected={active}
                className={`rounded-xl px-2.5 py-2.5 text-left ${
                  active
                    ? 'border border-[#2BAADF]/25 bg-gradient-to-r from-[#2BAADF]/20 to-[#2BAADF]/5 text-[#2BAADF]'
                    : done
                      ? 'border border-[#ffffff14] text-gray-300'
                      : 'border border-transparent text-gray-500'
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-[10px] text-gray-500">{item.hint}</span>
              </div>
            )
          })}
        </nav>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-[#ffffff08] px-5 py-3.5 sm:px-6">
        <div>
          <h3 className="text-base font-semibold text-white">{stepMeta.label}</h3>
          <p className="text-xs text-gray-500">{stepMeta.hint}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Número</p>
          <p className="font-mono text-sm text-[#2BAADF]">{numero}</p>
        </div>
      </div>

      <div className="min-h-[20rem] p-5 sm:p-6">
        {passo === 'cabecalho' ? (
          <div className="space-y-4" role="tabpanel">
            <div className="block text-sm text-gray-300">
              <span className="mb-1 block">Comprador / responsável *</span>
              <SearchableSelect
                value={compradorId}
                onChange={setCompradorId}
                options={pessoaOptions}
                placeholder="Buscar funcionário…"
                emptyLabel="Nenhum funcionário cadastrado"
              />
            </div>
            <div className="block text-sm text-gray-300">
              <span className="mb-1 block">Fornecedor *</span>
              <SearchableSelect
                value={fornecedorId}
                onChange={setFornecedorId}
                options={fornecedorOptions}
                placeholder="Buscar fornecedor…"
                emptyLabel="Nenhum fornecedor"
              />
            </div>
            <label className="block text-sm text-gray-300">
              Tipo
              <select
                value={tipo}
                onChange={(e) => onTipoChange(e.target.value as TipoCompra)}
                className={inputClass}
              >
                {TIPOS_COMPRA.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_COMPRA_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
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
                placeholder="Opcional"
              />
            </label>
          </div>
        ) : null}

        {passo === 'itens' ? (
          <div className="space-y-3" role="tabpanel">
            <p className="text-xs text-gray-500">
              {ehServico
                ? 'Itens do cadastro Cadastros → Serviços (compra). Preço editável para comparar fornecedores.'
                : 'Itens do cadastro de SKUs (UM e preço de compra).'}
            </p>
            {itens.map((item, index) => (
              <div
                key={index}
                className="space-y-2 rounded-xl border border-[#ffffff08] bg-[#0A0A0A]/50 p-3"
              >
                {ehServico ? (
                  <SearchableSelect
                    value={item.servico_id}
                    onChange={(id) => applyServico(index, id)}
                    options={servicoOptions}
                    placeholder="Buscar serviço…"
                    emptyLabel="Nenhum serviço cadastrado"
                  />
                ) : (
                  <SearchableSelect
                    value={item.sku_id}
                    onChange={(id) => applySku(index, id)}
                    options={skuOptions}
                    placeholder="Buscar SKU…"
                    emptyLabel="Nenhum SKU com este termo"
                  />
                )}
                <div className="grid gap-2 sm:grid-cols-12">
                  <input
                    readOnly
                    value={item.descricao}
                    className="rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 sm:col-span-5"
                  />
                  <input
                    placeholder="Qtd *"
                    value={item.quantidade}
                    onChange={(e) => updateItem(index, { quantidade: e.target.value })}
                    className="rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-white sm:col-span-2"
                  />
                  <input
                    readOnly
                    value={item.unidade}
                    className="rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 sm:col-span-2"
                  />
                  <input
                    placeholder="Preço *"
                    value={item.preco}
                    onChange={(e) => updateItem(index, { preco: e.target.value })}
                    className="rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-white sm:col-span-3"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItens([...itens, emptyItem()])}
              className="text-sm text-[#2BAADF]"
            >
              Adicionar item
            </button>
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
                  <dd className="font-mono text-[#2BAADF]">{numero}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Comprador</dt>
                  <dd className="text-white">{comprador?.nome || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Fornecedor</dt>
                  <dd className="text-white">{fornecedor?.nome || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Tipo</dt>
                  <dd className="text-white">{TIPO_COMPRA_LABEL[tipo]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Previsão</dt>
                  <dd className="text-white">
                    {previsao
                      ? new Date(`${previsao}T12:00:00`).toLocaleDateString('pt-BR')
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Valor total</dt>
                  <dd className="text-white">{formatMoney(valorTotal)}</dd>
                </div>
              </dl>
            </div>
            <div className="overflow-hidden rounded-xl border border-[#ffffff0a]">
              <p className="border-b border-[#ffffff08] bg-[#0A0A0A] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600">
                Itens ({itensValidos.length})
              </p>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2">{ehServico ? 'Serviço' : 'SKU'}</th>
                    <th className="px-4 py-2">Qtd</th>
                    <th className="px-4 py-2">Preço</th>
                    <th className="px-4 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itensValidos.map((item, i) => {
                    const qtd = Number(item.quantidade.replace(',', '.'))
                    const preco = Number(item.preco.replace(',', '.'))
                    return (
                      <tr key={i} className="border-t border-[#ffffff08]">
                        <td className="px-4 py-2 text-white">{item.descricao}</td>
                        <td className="px-4 py-2 text-gray-300">
                          {item.quantidade} {item.unidade}
                        </td>
                        <td className="px-4 py-2 text-gray-300">{formatMoney(preco)}</td>
                        <td className="px-4 py-2 text-gray-300">{formatMoney(qtd * preco)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {erro ? <p className="mt-4 text-sm text-red-400">{erro}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-6 py-4">
        <button
          type="button"
          onClick={irVoltar}
          disabled={passo === 'cabecalho' || pending}
          className="rounded-xl border border-[#ffffff14] px-5 py-2.5 text-sm font-semibold text-gray-300 disabled:opacity-40"
        >
          Voltar
        </button>
        {passo !== 'revisao' ? (
          <button
            type="button"
            onClick={irProximo}
            disabled={passo === 'cabecalho' ? !cabecalhoOk : !itensOk}
            className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Próximo
          </button>
        ) : (
          <button
            type="button"
            onClick={registrar}
            disabled={pending}
            className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? 'Registrando…' : 'Registrar pedido'}
          </button>
        )}
      </div>
    </div>
  )
}
