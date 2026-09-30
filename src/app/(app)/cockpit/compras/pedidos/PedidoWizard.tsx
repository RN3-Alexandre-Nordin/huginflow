'use client'

import type { ReactNode } from 'react'

export type WizardStep = { id: string; label: string; hint: string }

export default function PedidoWizard({
  steps,
  passo,
  numero,
  children,
  erro,
  onVoltar,
  onProximo,
  onConfirmar,
  confirmarLabel,
  proximoDisabled,
  confirmarDisabled,
  pending,
}: {
  steps: readonly WizardStep[]
  passo: string
  numero?: string
  children: ReactNode
  erro?: string | null
  onVoltar: () => void
  onProximo?: () => void
  onConfirmar?: () => void
  confirmarLabel: string
  proximoDisabled?: boolean
  confirmarDisabled?: boolean
  pending?: boolean
}) {
  const index = Math.max(0, steps.findIndex((s) => s.id === passo))
  const ultimo = index === steps.length - 1

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
      <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">Passos</p>
          {numero ? (
            <p className="font-mono text-xs text-[#2BAADF]">{numero}</p>
          ) : null}
        </div>
        <nav
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
          role="tablist"
        >
          {steps.map((item, i) => {
            const active = i === index
            const done = i < index
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
                <span className="mt-0.5 block text-[10px] leading-snug text-gray-500 line-clamp-2">
                  {item.hint}
                </span>
              </div>
            )
          })}
        </nav>
      </div>

      <div className="p-4 sm:px-5">
        {children}
        {erro ? <p className="mt-4 text-sm text-red-400">{erro}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-6 py-4">
        <button
          type="button"
          onClick={onVoltar}
          disabled={index === 0 || pending}
          className="rounded-xl border border-[#ffffff14] px-5 py-2.5 text-sm font-semibold text-gray-300 disabled:opacity-40"
        >
          Voltar
        </button>
        {ultimo ? (
          <button
            type="button"
            onClick={onConfirmar}
            disabled={pending || confirmarDisabled}
            className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? 'Salvando…' : confirmarLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onProximo}
            disabled={proximoDisabled || pending}
            className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Próximo
          </button>
        )}
      </div>
    </div>
  )
}
