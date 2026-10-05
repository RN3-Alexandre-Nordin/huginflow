'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import SearchableSelect from '@/components/SearchableSelect'
import { TIPOS_COMPRA, TIPO_COMPRA_LABEL, type TipoCompra } from '@/lib/compras/tipos'
import { atualizarSolicitacao, registrarSolicitacao } from '../../actions'

export type PessoaOption = { id: string; nome: string; documento?: string | null; email?: string | null }
export type SkuOption = {
  id: string
  codigo: string
  nome: string
  unidade_compra: string | null
  preco_custo: number | string | null
}
export type ServicoOption = {
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
  { id: 'cabecalho', label: '1. Cabeçalho', hint: 'Solicitante, tipo e necessidade' },
  { id: 'itens', label: '2. Itens', hint: 'SKU ou serviço do cadastro' },
  { id: 'revisao', label: '3. Revisão', hint: 'Confira e salve' },
] as const

type StepId = (typeof STEPS)[number]['id']

const inputClass =
  'mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-white outline-none focus:border-[#2BAADF]/50 [color-scheme:dark]'

export type SolicitacaoInitial = {
  solicitanteId: string
  tipo: TipoCompra
  dataNecessidade: string
  observacao: string
  itens: Item[]
}

type Props = {
  solicitacaoId: string
  numero: string
  pessoas: PessoaOption[]
  skus: SkuOption[]
  servicos: ServicoOption[]
  defaultSolicitanteId: string
  mode?: 'create' | 'edit'
  initial?: SolicitacaoInitial
}

function formatMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function emptyItem(): Item {
  return { sku_id: '', servico_id: '', descricao: '', quantidade: '1', unidade: 'UN', preco: '' }
}

export default function SolicitacaoForm({
  solicitacaoId,
  numero,
  pessoas,
  skus,
  servicos,
  defaultSolicitanteId,
  mode = 'create',
  initial,
}: Props) {
  const router = useRouter()
  const isEdit = mode === 'edit'
  const [passo, setPasso] = useState<StepId>('cabecalho')
  const [solicitanteId, setSolicitanteId] = useState(
    initial?.solicitanteId || defaultSolicitanteId,
  )
  const [tipo, setTipo] = useState<TipoCompra>(initial?.tipo || 'produtivo')
  const [dataNecessidade, setDataNecessidade] = useState(initial?.dataNecessidade || '')
  const [observacao, setObservacao] = useState(initial?.observacao || '')
  const [itens, setItens] = useState<Item[]>(
    initial?.itens?.length ? initial.itens : [emptyItem()],
  )
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const ehServico = tipo === 'servico'
  const solicitante = pessoas.find((p) => p.id === solicitanteId)
  const cabecalhoOk = Boolean(solicitanteId && tipo)

  const itensValidos = useMemo(
    () =>
      itens.filter((i) => {
        const qtd = Number(i.quantidade.replace(',', '.'))
        if (!(Number.isFinite(qtd) && qtd > 0)) return false
        return ehServico ? Boolean(i.servico_id) : Boolean(i.sku_id || i.descricao.trim())
      }),
    [itens, ehServico],
  )
  const itensOk = itensValidos.length > 0

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
        preco: Number.isFinite(preco) ? String(preco) : '',
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
        preco: Number.isFinite(preco) ? String(preco) : '',
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
        setErro('Selecione o solicitante e o tipo.')
        return
      }
      setPasso('itens')
      return
    }
    if (passo === 'itens') {
      if (!itensOk) {
        setErro(
          ehServico
            ? 'Inclua ao menos um serviço do cadastro com quantidade.'
            : 'Inclua ao menos um SKU com quantidade.',
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

  function salvar() {
    setErro(null)
    if (!cabecalhoOk || !itensOk) {
      setErro('Revise o cabeçalho e os itens antes de salvar.')
      return
    }
    const formData = new FormData()
    formData.set('solicitacao_id', solicitacaoId)
    formData.set('solicitante_pessoa_id', solicitanteId)
    formData.set('tipo', tipo)
    if (dataNecessidade) formData.set('data_necessidade', dataNecessidade)
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
        })),
      ),
    )
    start(async () => {
      const res = isEdit
        ? await atualizarSolicitacao(formData)
        : await registrarSolicitacao(formData)
      if (res.error) {
        setErro(res.error)
        return
      }
      router.push(isEdit ? `/cockpit/compras/solicitacoes/${solicitacaoId}` : '/cockpit/compras/solicitacoes')
      router.refresh()
    })
  }

  const stepMeta = STEPS.find((s) => s.id === passo) || STEPS[0]
  const pessoaOptions = pessoas.map((p) => ({
    id: p.id,
    nome: p.documento ? `${p.nome} (${p.documento})` : p.nome,
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
              <span className="mb-1 block">Solicitante *</span>
              <SearchableSelect
                value={solicitanteId}
                onChange={setSolicitanteId}
                options={pessoaOptions}
                placeholder="Buscar funcionário…"
                emptyLabel="Nenhum funcionário cadastrado em Pessoas"
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
              Data de necessidade
              <input
                type="date"
                value={dataNecessidade}
                onChange={(e) => setDataNecessidade(e.target.value)}
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
                ? 'Itens do cadastro Cadastros → Serviços (compra).'
                : 'Itens do cadastro de SKUs (unidade e preço de compra).'}
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
                    placeholder={ehServico ? 'Serviço' : 'SKU'}
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
                    readOnly
                    value={item.preco}
                    className="rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 sm:col-span-3"
                    placeholder="Preço ref."
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
                  <dt className="text-xs text-gray-500">Solicitante</dt>
                  <dd className="text-white">{solicitante?.nome || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Tipo</dt>
                  <dd className="text-white">{TIPO_COMPRA_LABEL[tipo]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Data de necessidade</dt>
                  <dd className="text-white">
                    {dataNecessidade
                      ? new Date(`${dataNecessidade}T12:00:00`).toLocaleDateString('pt-BR')
                      : '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-gray-500">Observação</dt>
                  <dd className="whitespace-pre-wrap text-white">{observacao.trim() || '—'}</dd>
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
                    <th className="px-4 py-2">UM</th>
                    <th className="px-4 py-2">Preço ref.</th>
                  </tr>
                </thead>
                <tbody>
                  {itensValidos.map((item, i) => (
                    <tr key={i} className="border-t border-[#ffffff08]">
                      <td className="px-4 py-2 text-white">{item.descricao}</td>
                      <td className="px-4 py-2 text-gray-300">{item.quantidade}</td>
                      <td className="px-4 py-2 text-gray-300">{item.unidade || 'UN'}</td>
                      <td className="px-4 py-2 text-gray-300">
                        {item.preco
                          ? formatMoney(Number(item.preco.replace(',', '.')) || 0)
                          : '—'}
                      </td>
                    </tr>
                  ))}
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
            onClick={salvar}
            disabled={pending}
            className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending
              ? isEdit
                ? 'Salvando…'
                : 'Registrando…'
              : isEdit
                ? 'Salvar alterações'
                : 'Registrar solicitação'}
          </button>
        )}
      </div>
    </div>
  )
}
