'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Save } from 'lucide-react'
import { SKU_UNIDADES } from '@/lib/skus/constants'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

type SkuOpt = { id: string; codigo: string; nome: string }

type Props = {
  mode: 'create' | 'edit'
  skus: SkuOpt[]
  initial?: {
    sku_id?: string | null
    unidade_origem?: string
    unidade_destino?: string
    fator_conversao?: number | string | null
  } | null
  action: (formData: FormData) => Promise<{ error?: string } | void>
  cancelHref: string
  submitLabel: string
}

export default function ConversaoUmForm({
  mode,
  skus,
  initial,
  action,
  cancelHref,
  submitLabel,
}: Props) {
  const [escopo, setEscopo] = useState<'generica' | 'especifica'>(
    initial?.sku_id ? 'especifica' : 'generica',
  )

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      if (escopo === 'generica') formData.set('sku_id', '')
      const result = await action(formData)
      if (result && 'error' in result && result.error) return { error: result.error }
      return null
    },
    null,
  )

  return (
    <form action={formAction} className="relative max-w-2xl">
      {state?.error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{state.error}</p>
        </div>
      )}

      <div className="space-y-5 rounded-2xl border border-[#ffffff0a] bg-[#111111] p-6 shadow-2xl">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Escopo</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setEscopo('generica')}
              className={`rounded-xl border px-4 py-3 text-left transition-all ${
                escopo === 'generica'
                  ? 'border-[#2BAADF]/30 bg-[#2BAADF]/15 text-[#2BAADF]'
                  : 'border-[#ffffff12] text-gray-400 hover:text-white'
              }`}
            >
              <span className="block text-sm font-semibold">Genérica</span>
              <span className="mt-0.5 block text-[11px] text-gray-500">
                SKU vazio — vale para todos (ex.: ML → L = 1000)
              </span>
            </button>
            <button
              type="button"
              onClick={() => setEscopo('especifica')}
              className={`rounded-xl border px-4 py-3 text-left transition-all ${
                escopo === 'especifica'
                  ? 'border-[#80B828]/30 bg-[#80B828]/15 text-[#80B828]'
                  : 'border-[#ffffff12] text-gray-400 hover:text-white'
              }`}
            >
              <span className="block text-sm font-semibold">Específica</span>
              <span className="mt-0.5 block text-[11px] text-gray-500">
                SKU preenchido — override só daquele item
              </span>
            </button>
          </div>
        </div>

        {escopo === 'especifica' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              SKU <span className="text-[#2BAADF]">*</span>
            </label>
            <select
              name="sku_id"
              required={escopo === 'especifica'}
              defaultValue={initial?.sku_id || ''}
              className={`${inputCls} appearance-none`}
            >
              <option value="">Selecione…</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} — {s.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        {escopo === 'generica' && <input type="hidden" name="sku_id" value="" />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Origem <span className="text-[#2BAADF]">*</span>
            </label>
            <select
              name="unidade_origem"
              required
              defaultValue={initial?.unidade_origem || 'ML'}
              className={`${inputCls} appearance-none`}
            >
              {SKU_UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Destino <span className="text-[#2BAADF]">*</span>
            </label>
            <select
              name="unidade_destino"
              required
              defaultValue={initial?.unidade_destino || 'L'}
              className={`${inputCls} appearance-none`}
            >
              {SKU_UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Fator <span className="text-[#2BAADF]">*</span>
            </label>
            <input
              name="fator_conversao"
              required
              defaultValue={
                initial?.fator_conversao != null ? String(initial.fator_conversao) : '1000'
              }
              className={inputCls}
              placeholder="1000"
            />
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Regra: <strong className="text-gray-300">1 origem = fator × destino</strong>
          {mode === 'edit' ? ' · editando cadastro' : ' · novo cadastro'}.
        </p>

        <div className="flex justify-end gap-2 border-t border-[#ffffff0a] pt-4">
          <Link
            href={cancelHref}
            className="inline-flex h-10 items-center rounded-lg border border-[#ffffff12] px-4 text-sm font-medium text-gray-300 hover:bg-[#ffffff08] hover:text-white"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isPending ? 'Salvando…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}
