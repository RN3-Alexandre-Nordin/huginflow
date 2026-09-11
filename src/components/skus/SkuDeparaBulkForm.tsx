'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronDown, Plus, Save, Trash2 } from 'lucide-react'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

const selectCls = `${inputCls} cursor-pointer appearance-none pr-9`

type SkuOpt = { id: string; codigo: string; nome: string }
type PessoaOpt = { id: string; nome: string | null }

type Row = {
  key: string
  sku_id: string
  pessoa_id: string
  codigo_parceiro: string
}

function emptyRow(): Row {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sku_id: '',
    pessoa_id: '',
    codigo_parceiro: '',
  }
}

type Props = {
  skus: SkuOpt[]
  pessoas: PessoaOpt[]
  action: (formData: FormData) => Promise<{ error?: string } | void>
  cancelHref: string
  initialRows?: number
}

function SelectCell({
  name,
  value,
  onChange,
  children,
  className = '',
}: {
  name: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectCls}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
    </div>
  )
}

export default function SkuDeparaBulkForm({
  skus,
  pessoas,
  action,
  cancelHref,
  initialRows = 8,
}: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: initialRows }, () => emptyRow()),
  )

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await action(formData)
      if (result && 'error' in result && result.error) return { error: result.error }
      return null
    },
    null,
  )

  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  return (
    <form action={formAction} className="relative space-y-4">
      {state?.error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{state.error}</p>
        </div>
      )}

      {!skus.length && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          Nenhum SKU ativo nesta empresa. Cadastre SKUs antes do de-para.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ffffff0a] px-4 py-3">
          <p className="text-xs text-gray-500">
            SKU Hugin e Pessoa são listas (sem digitação). Linhas vazias são ignoradas.
          </p>
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyRow(), emptyRow(), emptyRow()])}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ffffff12] px-3 text-xs font-semibold text-gray-300 hover:bg-[#ffffff08] hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" /> +3 linhas
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-10" />
              <col className="w-[42%]" />
              <col className="w-[28%]" />
              <col className="w-[24%]" />
              <col className="w-12" />
            </colgroup>
            <thead className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              <tr>
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">SKU Hugin</th>
                <th className="px-3 py-3">Pessoa</th>
                <th className="px-3 py-3">Cód. parceiro</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff08]">
              {rows.map((row, idx) => (
                <tr key={row.key} className="align-middle hover:bg-[#ffffff03]">
                  <td className="px-3 py-2 text-xs text-gray-600">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <SelectCell
                      name="depara_sku_id"
                      value={row.sku_id}
                      onChange={(v) => updateRow(row.key, { sku_id: v })}
                    >
                      <option value="">Selecione o SKU…</option>
                      {skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.codigo} — {s.nome}
                        </option>
                      ))}
                    </SelectCell>
                  </td>
                  <td className="px-3 py-2">
                    <SelectCell
                      name="depara_pessoa_id"
                      value={row.pessoa_id}
                      onChange={(v) => updateRow(row.key, { pessoa_id: v })}
                    >
                      <option value="">Selecione a pessoa…</option>
                      {pessoas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome || p.id}
                        </option>
                      ))}
                    </SelectCell>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name="depara_codigo"
                      value={row.codigo_parceiro}
                      onChange={(e) => updateRow(row.key, { codigo_parceiro: e.target.value })}
                      placeholder="SKU do parceiro"
                      className={inputCls}
                      autoComplete="off"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      title="Remover linha"
                      onClick={() =>
                        setRows((prev) =>
                          prev.length <= 1 ? prev : prev.filter((r) => r.key !== row.key),
                        )
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-400/60 hover:bg-red-400/10 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-[#ffffff0a] bg-[#0A0A0A] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[#ffffff12] px-4 text-sm font-medium text-gray-300 hover:bg-[#ffffff08] hover:text-white"
          >
            <Plus className="h-4 w-4" /> Adicionar linha
          </button>
          <div className="flex items-center justify-end gap-2">
            <Link
              href={cancelHref}
              className="inline-flex h-10 items-center rounded-lg border border-[#ffffff12] px-4 text-sm font-medium text-gray-300 hover:bg-[#ffffff08] hover:text-white"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isPending || !skus.length}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isPending ? 'Salvando…' : 'Salvar lista'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
