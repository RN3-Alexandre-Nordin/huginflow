'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Save, AlertCircle } from 'lucide-react'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

type Familia = {
  codigo?: string
  nome?: string
  descricao?: string | null
  ordem?: number | null
  ativo?: boolean | null
}

export default function FamiliaForm({
  familia,
  action,
  cancelHref,
  submitLabel,
}: {
  familia?: Familia | null
  action: (formData: FormData) => Promise<{ error?: string } | void>
  cancelHref: string
  submitLabel: string
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, fd: FormData) => {
      const res = await action(fd)
      if (res && typeof res === 'object' && 'error' in res) return { error: res.error }
      return null
    },
    null as { error?: string } | null
  )

  return (
    <form action={formAction} className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111]">
      <div className="space-y-4 p-6">
        {state?.error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {state.error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Código <span className="text-[#2BAADF]">*</span>
            </label>
            <input
              name="codigo"
              required
              defaultValue={familia?.codigo || ''}
              className={inputCls}
              placeholder="Ex.: CERV"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Ordem
            </label>
            <input
              name="ordem"
              type="number"
              defaultValue={familia?.ordem ?? 0}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Nome <span className="text-[#2BAADF]">*</span>
            </label>
            <input
              name="nome"
              required
              defaultValue={familia?.nome || ''}
              className={inputCls}
              placeholder="Ex.: Cervejas"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Descrição
            </label>
            <textarea
              name="descricao"
              rows={2}
              defaultValue={familia?.descricao || ''}
              className={`${inputCls} resize-none`}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={familia?.ativo !== false}
              className="rounded border-[#ffffff30] text-[#80B828] focus:ring-[#80B828]/40"
            />
            Ativa
          </label>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-6 py-4">
        <Link href={cancelHref} className="text-sm text-gray-400 hover:text-white">
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
