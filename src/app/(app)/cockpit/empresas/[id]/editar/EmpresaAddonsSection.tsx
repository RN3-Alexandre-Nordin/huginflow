'use client'

import { useMemo, useState, useTransition } from 'react'
import { Boxes, ChevronDown, Save } from 'lucide-react'
import type {
  CommercialStatus,
  EmpresaAddonLine,
  EmpresaAddonUpdateInput,
} from '@/lib/addons/entitlements'
import { updateEmpresaAddons } from '@/app/(app)/cockpit/empresas/addon-actions'
import { parseMoneyInput } from '@/lib/finance/format'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-3 py-2 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

const COMMERCIAL_OPTIONS: { value: CommercialStatus; label: string }[] = [
  { value: 'active', label: 'Ativo' },
  { value: 'trial', label: 'Trial' },
  { value: 'courtesy', label: 'Cortesia' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'ended', label: 'Encerrado' },
]

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function centsToMoneyInput(cents: number | null): string {
  if (cents == null) return ''
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function moneyInputToCents(raw: string): number | null {
  if (!raw.trim()) return null
  const major = parseMoneyInput(raw)
  if (major == null || major < 0) return null
  return Math.round(major * 100)
}

type DraftLine = {
  addon_codigo: string
  enabled: boolean
  plano: string
  commercial_status: CommercialStatus
  quantity: number
  price_override: string
  starts_at: string
  ends_at: string
  open: boolean
}

function draftsFromLines(lines: EmpresaAddonLine[]): DraftLine[] {
  return lines.map((line) => ({
    addon_codigo: line.addon_codigo,
    enabled: line.enabled,
    plano: line.plano ?? '',
    commercial_status: line.commercial_status,
    quantity: line.quantity,
    price_override: centsToMoneyInput(line.price_override_cents),
    starts_at: toDatetimeLocal(line.starts_at),
    ends_at: toDatetimeLocal(line.ends_at),
    open: false,
  }))
}

export default function EmpresaAddonsSection({
  empresaId,
  lines,
  canEdit,
}: {
  empresaId: string
  lines: EmpresaAddonLine[]
  canEdit: boolean
}) {
  const [drafts, setDrafts] = useState(() => draftsFromLines(lines))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const byCodigo = useMemo(() => {
    const map = new Map(lines.map((l) => [l.addon_codigo, l]))
    return map
  }, [lines])

  const updateDraft = (codigo: string, patch: Partial<DraftLine>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.addon_codigo === codigo ? { ...d, ...patch } : d)),
    )
  }

  const handleSave = () => {
    if (!canEdit) return
    setMessage(null)
    setError(null)

    const payload: EmpresaAddonUpdateInput[] = drafts.map((d) => ({
      addon_codigo: d.addon_codigo,
      enabled: d.enabled,
      plano: d.plano.trim() || null,
      commercial_status: d.commercial_status,
      quantity: d.quantity,
      price_override_cents: moneyInputToCents(d.price_override),
      starts_at: d.starts_at ? new Date(d.starts_at).toISOString() : null,
      ends_at: d.ends_at ? new Date(d.ends_at).toISOString() : null,
    }))

    startTransition(async () => {
      const result = await updateEmpresaAddons(empresaId, payload)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setMessage('Addons salvos.')
    })
  }

  return (
    <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative overflow-hidden">
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, #80B828 0%, transparent 70%)',
          filter: 'blur(30px)',
        }}
      />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#80B828]/10 border border-[#80B828]/20 flex items-center justify-center">
            <Boxes className="w-4 h-4 text-[#80B828]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Addons da empresa</p>
            <p className="text-xs text-gray-500">
              Acesso técnico (`enabled`) e linha comercial. Ligar ≠ faturar
              automaticamente (faturamento na Sessão 7).
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="bg-gradient-to-r from-[#80B828] to-[#5F8A1C] hover:shadow-[0_4px_24px_rgba(128,184,40,0.35)] disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          >
            {isPending ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Salvar addons
          </button>
        )}
      </div>

      {!canEdit && (
        <p className="text-xs text-amber-500/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          Somente superadmin RN3 pode alterar entitlements. Visualização apenas.
        </p>
      )}

      {message && (
        <p className="text-xs text-[#80B828] bg-[#80B828]/10 border border-[#80B828]/20 rounded-xl px-3 py-2">
          {message}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {drafts.map((draft) => {
          const meta = byCodigo.get(draft.addon_codigo)?.registry
          if (!meta) return null
          const isFoundation = meta.tipo === 'foundation'

          return (
            <div
              key={draft.addon_codigo}
              className="border border-[#ffffff0a] rounded-xl bg-[#0A0A0A]/60 overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFoundation ? true : draft.enabled}
                    disabled={!canEdit || isFoundation || isPending}
                    onChange={(e) =>
                      updateDraft(draft.addon_codigo, { enabled: e.target.checked })
                    }
                    className="rounded border-[#ffffff30] bg-transparent text-[#80B828] focus:ring-[#80B828]/40"
                  />
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-white block truncate">
                      {meta.nome}
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-500">
                        {draft.addon_codigo}
                      </span>
                    </span>
                    {meta.descricao && (
                      <span className="text-xs text-gray-500 line-clamp-1">
                        {meta.descricao}
                      </span>
                    )}
                  </span>
                </label>

                <div className="flex items-center gap-2 shrink-0">
                  {meta.billable ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#2BAADF]/15 text-[#2BAADF] border border-[#2BAADF]/25">
                      Billable
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-500/15 text-gray-400 border border-gray-500/25">
                      Included
                    </span>
                  )}
                  {isFoundation && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#80B828]/15 text-[#80B828] border border-[#80B828]/25">
                      Foundation
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft(draft.addon_codigo, { open: !draft.open })
                    }
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    aria-label="Campos comerciais"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${draft.open ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>

              {draft.open && (
                <div className="px-4 pb-4 grid grid-cols-2 gap-3 border-t border-[#ffffff08] pt-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Plano
                    </label>
                    <input
                      type="text"
                      value={draft.plano}
                      disabled={!canEdit || isPending}
                      onChange={(e) =>
                        updateDraft(draft.addon_codigo, { plano: e.target.value })
                      }
                      placeholder="starter / pro / …"
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Status comercial
                    </label>
                    <select
                      value={draft.commercial_status}
                      disabled={!canEdit || isFoundation || isPending}
                      onChange={(e) =>
                        updateDraft(draft.addon_codigo, {
                          commercial_status: e.target.value as CommercialStatus,
                        })
                      }
                      className={`${inputCls} appearance-none`}
                    >
                      {COMMERCIAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={draft.quantity}
                      disabled={!canEdit || isPending}
                      onChange={(e) =>
                        updateDraft(draft.addon_codigo, {
                          quantity: Number(e.target.value) || 0,
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Preço negociado ({meta.currency || 'BRL'})
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft.price_override}
                      disabled={!canEdit || isFoundation || isPending}
                      onChange={(e) =>
                        updateDraft(draft.addon_codigo, {
                          price_override: e.target.value,
                        })
                      }
                      placeholder={
                        meta.list_price_cents != null
                          ? `Lista: ${(meta.list_price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: meta.currency || 'BRL' })}`
                          : 'vazio = preço de lista'
                      }
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Início
                    </label>
                    <input
                      type="datetime-local"
                      value={draft.starts_at}
                      disabled={!canEdit || isPending}
                      onChange={(e) =>
                        updateDraft(draft.addon_codigo, { starts_at: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Fim
                    </label>
                    <input
                      type="datetime-local"
                      value={draft.ends_at}
                      disabled={!canEdit || isPending}
                      onChange={(e) =>
                        updateDraft(draft.addon_codigo, { ends_at: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
