'use client'

import { useState } from 'react'
import { Link2, Plus } from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import { SKU_UNIDADES } from '@/lib/skus/constants'
import type { LinhaXmlNota } from '@/lib/compras/casar-xml-pedido'

type SkuOpt = { id: string; codigo: string; nome: string; unidade_estoque: string }

export default function ResolverXmlNota({
  linha,
  skuOptions,
  pending,
  onBuscar,
  onVincular,
  onCriar,
  onFechar,
}: {
  linha: LinhaXmlNota
  skuOptions: SkuOpt[]
  pending: boolean
  onBuscar: (termo: string) => void
  onVincular: (skuId: string) => void
  onCriar: (input: { codigo: string; nome: string; unidadeEstoque: string; fator: string }) => void
  onFechar: () => void
}) {
  const [modoNovo, setModoNovo] = useState(false)
  const [skuPick, setSkuPick] = useState('')
  const [codigo, setCodigo] = useState(linha.codigo_parceiro)
  const [nome, setNome] = useState(linha.descricao)
  const [umEstoque, setUmEstoque] = useState(linha.unidade || 'UN')
  const [fator, setFator] = useState('1')
  const unidades = [linha.unidade, ...SKU_UNIDADES].filter((v, i, a) => v && a.indexOf(v) === i)

  return (
    <div className="rounded-xl border border-[#2BAADF]/25 bg-[#2BAADF]/5 p-4 space-y-4 sm:col-span-2">
      <p className="text-xs font-semibold text-white">
        Resolver item #{linha.linha} — {linha.codigo_parceiro}
      </p>
      <p className="text-[11px] text-gray-400">{linha.descricao}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setModoNovo(false)}
          className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium ${
            !modoNovo
              ? 'border-[#2BAADF]/40 bg-[#2BAADF]/15 text-[#2BAADF]'
              : 'border-[#ffffff12] text-gray-400'
          }`}
        >
          <Link2 className="mr-1 inline h-3 w-3" />
          Apontar SKU existente
        </button>
        <button
          type="button"
          onClick={() => setModoNovo(true)}
          className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium ${
            modoNovo
              ? 'border-[#2BAADF]/40 bg-[#2BAADF]/15 text-[#2BAADF]'
              : 'border-[#ffffff12] text-gray-400'
          }`}
        >
          <Plus className="mr-1 inline h-3 w-3" />
          Cadastrar SKU novo
        </button>
      </div>
      {!modoNovo ? (
        <div className="space-y-3">
          <SearchableSelect
            value={skuPick}
            onChange={setSkuPick}
            placeholder="Buscar SKU interno…"
            options={skuOptions.map((s) => ({
              value: s.id,
              label: `${s.codigo} — ${s.nome}`,
              searchText: `${s.codigo} ${s.nome}`,
            }))}
          />
          <input
            type="search"
            placeholder="Filtrar SKUs (digite e Enter)…"
            className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3 py-2 text-xs text-white"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onBuscar((e.target as HTMLInputElement).value)
              }
            }}
          />
          <button
            type="button"
            disabled={!skuPick || pending}
            onClick={() => onVincular(skuPick)}
            className="rounded-xl bg-[#2BAADF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Gravar de-para e resolver
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-[10px] uppercase text-gray-500">
            Código SKU
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3 py-2 text-xs text-white"
            />
          </label>
          <label className="block text-[10px] uppercase text-gray-500">
            Nome
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3 py-2 text-xs text-white"
            />
          </label>
          <label className="block text-[10px] uppercase text-gray-500">
            UM na NF-e (origem)
            <input
              value={linha.unidade}
              disabled
              className="mt-1 w-full rounded-xl border border-[#ffffff10] bg-[#0A0A0A] px-3 py-2 text-xs text-gray-400"
            />
          </label>
          <label className="block text-[10px] uppercase text-gray-500">
            UM estoque (confirmar)
            <select
              value={umEstoque}
              onChange={(e) => setUmEstoque(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3 py-2 text-xs text-white"
            >
              {unidades.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          {umEstoque.toUpperCase() !== (linha.unidade || '').toUpperCase() ? (
            <label className="block text-[10px] uppercase text-gray-500 md:col-span-2">
              Fator: 1 {linha.unidade} = ? {umEstoque}
              <input
                type="number"
                min="0"
                step="any"
                value={fator}
                onChange={(e) => setFator(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3 py-2 text-xs text-white"
              />
            </label>
          ) : null}
          <p className="text-[10px] text-gray-500 md:col-span-2">
            Do XML: NCM {linha.ncm || '—'}
            {linha.codigo_barras ? ` · EAN ${linha.codigo_barras}` : ''}
            {linha.cest ? ` · CEST ${linha.cest}` : ''}
          </p>
          <button
            type="button"
            disabled={pending || !nome.trim()}
            onClick={() => onCriar({ codigo, nome, unidadeEstoque: umEstoque, fator })}
            className="rounded-xl bg-[#2BAADF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 md:col-span-2"
          >
            Criar SKU + de-para e resolver
          </button>
        </div>
      )}
      <button type="button" onClick={onFechar} className="text-[11px] text-gray-500 hover:text-white">
        Fechar
      </button>
    </div>
  )
}
