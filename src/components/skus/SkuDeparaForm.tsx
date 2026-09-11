'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, Save } from 'lucide-react'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

type SkuOpt = { id: string; codigo: string; nome: string }
type PessoaOpt = { id: string; nome: string | null }

type Props = {
  skus: SkuOpt[]
  pessoas: PessoaOpt[]
  initial?: {
    sku_id?: string
    pessoa_id?: string
    codigo_parceiro?: string
    observacao?: string | null
    ativo?: boolean | null
  } | null
  action: (formData: FormData) => Promise<{ error?: string } | void>
  cancelHref: string
  submitLabel: string
}

export default function SkuDeparaForm({
  skus,
  pessoas,
  initial,
  action,
  cancelHref,
  submitLabel,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
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
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            SKU Hugin <span className="text-[#2BAADF]">*</span>
          </label>
          <select
            name="sku_id"
            required
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

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Pessoa (cliente/fornecedor) <span className="text-[#2BAADF]">*</span>
          </label>
          <select
            name="pessoa_id"
            required
            defaultValue={initial?.pessoa_id || ''}
            className={`${inputCls} appearance-none`}
          >
            <option value="">Selecione…</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome || p.id}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Código do parceiro <span className="text-[#2BAADF]">*</span>
          </label>
          <input
            name="codigo_parceiro"
            required
            defaultValue={initial?.codigo_parceiro || ''}
            className={inputCls}
            placeholder="SKU no sistema do cliente/fornecedor"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Observação
          </label>
          <input
            name="observacao"
            defaultValue={initial?.observacao || ''}
            className={inputCls}
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={initial?.ativo !== false}
            className="rounded border-[#ffffff30] text-[#80B828] focus:ring-[#80B828]/40"
          />
          Ativo
        </label>

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
