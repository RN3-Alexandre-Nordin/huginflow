'use client'

import { useState } from 'react'
import Link from 'next/link'

const SECTIONS = [
  { id: 'identidade', label: 'Identidade', hint: 'Código, nome e unidade' },
  { id: 'comercial', label: 'Comercial', hint: 'Preço de referência e descrição' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const inputClass =
  'mt-1 w-full rounded-xl border border-[#ffffff14] bg-[#0A0A0A] px-3 py-2 text-white outline-none focus:border-[#2BAADF]/50'

export type ServicoRecord = {
  id?: string
  codigo?: string | null
  nome?: string | null
  unidade?: string | null
  preco_referencia?: number | string | null
  descricao?: string | null
  ativo?: boolean | null
}

type Props = {
  mode: 'create' | 'edit'
  /** Código já reservado/exibido (create) ou atual (edit). */
  codigo: string
  servico?: ServicoRecord | null
  action: (formData: FormData) => Promise<{ error?: string } | void>
  cancelHref: string
  submitLabel: string
}

export default function ServicoForm({
  mode,
  codigo,
  servico,
  action,
  cancelHref,
  submitLabel,
}: Props) {
  const [section, setSection] = useState<SectionId>('identidade')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const active = SECTIONS.find((s) => s.id === section) || SECTIONS[0]

  async function onSubmit(formData: FormData) {
    setErro(null)
    setPending(true)
    try {
      const res = await action(formData)
      if (res && 'error' in res && res.error) setErro(res.error)
    } finally {
      setPending(false)
    }
  }

  return (
    <form action={onSubmit} className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
      <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
        <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
          Seções
        </p>
        <nav className="grid grid-cols-2 gap-1.5" role="tablist">
          {SECTIONS.map((item) => {
            const isActive = item.id === section
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSection(item.id)}
                className={`rounded-xl px-2.5 py-2.5 text-left transition-all ${
                  isActive
                    ? 'border border-[#2BAADF]/25 bg-gradient-to-r from-[#2BAADF]/20 to-[#2BAADF]/5 text-[#2BAADF]'
                    : 'border border-transparent text-gray-400 hover:bg-[#ffffff08] hover:text-white'
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-[10px] text-gray-500">{item.hint}</span>
              </button>
            )
          })}
        </nav>
      </div>

      <div className="border-b border-[#ffffff08] px-5 py-3.5 sm:px-6">
        <h3 className="text-base font-semibold text-white">{active.label}</h3>
        <p className="text-xs text-gray-500">{active.hint}</p>
      </div>

      <div className="min-h-[16rem] space-y-4 p-5 sm:p-6">
        <div className={section === 'identidade' ? 'space-y-4' : 'hidden'} role="tabpanel">
          <label className="block text-sm text-gray-300">
            Código
            <input
              value={codigo}
              readOnly
              className={`${inputClass} cursor-not-allowed font-mono text-[#2BAADF]`}
            />
            <span className="mt-1 block text-[10px] text-gray-500">
              {mode === 'create'
                ? 'Gerado automaticamente (prefixo SRV- + sequencial).'
                : 'Código permanente — não altera na edição.'}
            </span>
          </label>
          <label className="block text-sm text-gray-300">
            Nome *
            <input
              name="nome"
              required
              defaultValue={servico?.nome || ''}
              className={inputClass}
              placeholder="Ex.: Limpeza e jardinagem"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Unidade
            <select name="unidade" defaultValue={servico?.unidade || 'HORAS'} className={inputClass}>
              <option value="HORAS">HORAS</option>
              <option value="DIA">DIA</option>
              <option value="SEMANAL">SEMANAL</option>
              <option value="MENSAL">MENSAL</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={mode === 'create' ? true : servico?.ativo !== false}
              className="rounded border-[#ffffff24]"
            />
            Ativo
          </label>
        </div>
        <div className={section === 'comercial' ? 'space-y-4' : 'hidden'} role="tabpanel">
          <label className="block text-sm text-gray-300">
            Preço de referência
            <input
              name="preco_referencia"
              defaultValue={
                servico?.preco_referencia != null ? String(servico.preco_referencia) : ''
              }
              className={inputClass}
              placeholder="Último ou preço típico"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Descrição
            <textarea
              name="descricao"
              rows={4}
              defaultValue={servico?.descricao || ''}
              className={inputClass}
              placeholder="Escopo do serviço"
            />
          </label>
        </div>
        {erro ? <p className="text-sm text-red-400">{erro}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-6 py-4">
        <Link href={cancelHref} className="text-sm text-gray-400 hover:text-white">
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? 'Salvando…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
