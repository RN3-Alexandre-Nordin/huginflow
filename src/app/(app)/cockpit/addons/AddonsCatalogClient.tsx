'use client'

import { useMemo, useState, useTransition } from 'react'
import { Boxes, Plus, Save, PowerOff, X } from 'lucide-react'
import type { AddonRegistryRow, AddonTipo, BillingModel } from '@/lib/addons/entitlements'
import { parseMoneyInput } from '@/lib/finance/format'
import {
  createAddonRegistry,
  deactivateAddonRegistry,
  updateAddonRegistry,
  type AddonRegistryInput,
} from '@/app/(app)/cockpit/addons/actions'
import { slugifyAddonCodigo } from '@/lib/addons/sku'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-3 py-2 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

type Draft = {
  codigo: string
  nome: string
  descricao: string
  tipo: AddonTipo
  sort_order: number
  ativo: boolean
  default_enabled: boolean
  rn3_only: boolean
  billable: boolean
  billing_model: BillingModel
  /** Preço de lista na unidade da moeda (ex.: 250,00), não centavos. */
  list_price: string
  currency: string
  backfillEmpresas: boolean
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

function formatMoneyCents(cents: number | null, currency: string): string {
  if (cents == null) return '—'
  try {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
    })
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

const emptyDraft = (): Draft => ({
  codigo: '',
  nome: '',
  descricao: '',
  tipo: 'addon',
  sort_order: 100,
  ativo: true,
  default_enabled: false,
  rn3_only: false,
  billable: true,
  billing_model: 'flat',
  list_price: '',
  currency: 'BRL',
  backfillEmpresas: true,
})

function fromRow(row: AddonRegistryRow): Draft {
  return {
    codigo: row.codigo,
    nome: row.nome,
    descricao: row.descricao ?? '',
    tipo: row.tipo,
    sort_order: row.sort_order,
    ativo: row.ativo,
    default_enabled: row.default_enabled,
    rn3_only: row.rn3_only,
    billable: row.billable,
    billing_model: row.billing_model,
    list_price: centsToMoneyInput(row.list_price_cents),
    currency: row.currency,
    backfillEmpresas: false,
  }
}

function toPayload(draft: Draft): AddonRegistryInput {
  return {
    nome: draft.nome,
    descricao: draft.descricao || null,
    tipo: draft.tipo,
    sort_order: draft.sort_order,
    ativo: draft.ativo,
    default_enabled: draft.default_enabled,
    rn3_only: draft.rn3_only,
    billable: draft.billable,
    billing_model: draft.billing_model,
    list_price_cents: moneyInputToCents(draft.list_price),
    currency: draft.currency,
    backfillEmpresas: draft.backfillEmpresas,
  }
}


export default function AddonsCatalogClient({ rows }: { rows: AddonRegistryRow[] }) {
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.sort_order - b.sort_order || a.codigo.localeCompare(b.codigo)),
    [rows],
  )

  const openCreate = () => {
    setDraft(emptyDraft())
    setMode('create')
    setMessage(null)
    setError(null)
  }

  const openEdit = (row: AddonRegistryRow) => {
    setDraft(fromRow(row))
    setMode('edit')
    setMessage(null)
    setError(null)
  }

  const closeForm = () => {
    setMode('list')
    setDraft(emptyDraft())
  }

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  const handleSave = () => {
    setMessage(null)
    setError(null)
    if (draft.list_price.trim() && moneyInputToCents(draft.list_price) == null) {
      setError('Preço lista inválido. Use formato como 250,00')
      return
    }
    const payload = toPayload(draft)

    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createAddonRegistry(payload)
          : await updateAddonRegistry(draft.codigo, payload)

      if ('error' in result) {
        setError(result.error)
        return
      }
      setMessage(
        mode === 'create' && 'codigo' in result
          ? `Addon criado (SKU: ${result.codigo}).`
          : 'Addon atualizado.',
      )
      setMode('list')
    })
  }

  const handleDeactivate = (codigo: string) => {
    if (!confirm(`Desativar addon "${codigo}"? Empresas existentes mantêm a linha; o SKU some do catálogo ativo.`)) {
      return
    }
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await deactivateAddonRegistry(codigo)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setMessage(`Addon "${codigo}" desativado.`)
      if (mode === 'edit' && draft.codigo === codigo) closeForm()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-400 max-w-2xl">
          Catálogo global de produtos da plataforma (SKU). Ligar na ficha da empresa é
          entitlement; faturamento SaaS RN3 continua em Financeiro/Contratos.
        </p>
        {mode === 'list' && (
          <button
            type="button"
            onClick={openCreate}
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo addon
          </button>
        )}
      </div>

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

      {mode !== 'list' && (
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#2BAADF]/10 border border-[#2BAADF]/20 flex items-center justify-center">
                <Boxes className="w-4 h-4 text-[#2BAADF]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {mode === 'create' ? 'Novo addon' : `Editar: ${draft.codigo}`}
                </p>
                <p className="text-xs text-gray-500">
                  SKU interno gerado do nome (slug). Integrações futuras usam a API com esse
                  código — sem SKU de ERP externo.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome">
              <input
                className={inputCls}
                value={draft.nome}
                disabled={isPending}
                onChange={(e) => patch({ nome: e.target.value })}
                placeholder="Estoque"
              />
            </Field>
            <Field
              label="SKU interno"
              hint={
                mode === 'create'
                  ? 'Gerado automaticamente a partir do nome (ex.: “Gestão de Estoque” → gestao_de_estoque). Se já existir, sufixa _2, _3…'
                  : 'Imutável após criar — chave do catálogo e da API.'
              }
            >
              <input
                className={`${inputCls} font-mono text-xs text-[#2BAADF]`}
                value={
                  mode === 'create'
                    ? draft.nome.trim()
                      ? slugifyAddonCodigo(draft.nome)
                      : ''
                    : draft.codigo
                }
                disabled
                readOnly
                placeholder="digite o nome…"
              />
            </Field>
            <div className="col-span-2">
              <Field label="Descrição">
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={draft.descricao}
                  disabled={isPending}
                  onChange={(e) => patch({ descricao: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Tipo">
              <select
                className={`${inputCls} appearance-none`}
                value={draft.tipo}
                disabled={isPending || (mode === 'edit' && draft.tipo === 'foundation')}
                onChange={(e) => patch({ tipo: e.target.value as AddonTipo })}
              >
                <option value="addon">addon</option>
                <option value="foundation">foundation</option>
              </select>
            </Field>
            <Field label="Ordem">
              <input
                type="number"
                className={inputCls}
                value={draft.sort_order}
                disabled={isPending}
                onChange={(e) => patch({ sort_order: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Billing model">
              <select
                className={`${inputCls} appearance-none`}
                value={draft.billing_model}
                disabled={isPending || draft.tipo === 'foundation'}
                onChange={(e) => patch({ billing_model: e.target.value as BillingModel })}
              >
                <option value="flat">flat</option>
                <option value="per_seat">per_seat</option>
                <option value="usage">usage</option>
                <option value="included">included</option>
              </select>
            </Field>
            <Field label="Moeda">
              <input
                className={inputCls}
                value={draft.currency}
                disabled={isPending}
                onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
                placeholder="BRL"
              />
            </Field>
            <Field
              label={`Preço lista (${draft.currency || 'BRL'})`}
              hint="Ex.: 250,00 — valor na moeda acima (não em centavos)."
            >
              <input
                type="text"
                inputMode="decimal"
                className={inputCls}
                value={draft.list_price}
                disabled={isPending || draft.tipo === 'foundation'}
                onChange={(e) => patch({ list_price: e.target.value })}
                placeholder="250,00"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-gray-300">
            <Toggle
              label="Ativo"
              checked={draft.ativo}
              disabled={isPending}
              onChange={(v) => patch({ ativo: v })}
            />
            <Toggle
              label="Default enabled"
              checked={draft.default_enabled}
              disabled={isPending || draft.tipo === 'foundation'}
              onChange={(v) => patch({ default_enabled: v })}
            />
            <Toggle
              label="Billable"
              checked={draft.billable}
              disabled={isPending || draft.tipo === 'foundation'}
              onChange={(v) => patch({ billable: v })}
            />
            <Toggle
              label="RN3 only"
              checked={draft.rn3_only}
              disabled={isPending}
              onChange={(v) => patch({ rn3_only: v })}
            />
            {mode === 'create' && (
              <Toggle
                label="Backfill em todas as empresas"
                checked={draft.backfillEmpresas}
                disabled={isPending}
                onChange={(v) => patch({ backfillEmpresas: v })}
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="bg-gradient-to-r from-[#80B828] to-[#5F8A1C] disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
            >
              {isPending ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-[#ffffff08]">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.codigo}
                className="border-b border-[#ffffff06] hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 font-mono text-xs text-[#2BAADF]">{row.codigo}</td>
                <td className="px-4 py-3 text-white">
                  {row.nome}
                  {!row.ativo && (
                    <span className="ml-2 text-[10px] uppercase text-red-400">off</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400">{row.tipo}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {row.billable ? (
                      <Badge>billable</Badge>
                    ) : (
                      <Badge muted>included</Badge>
                    )}
                    {row.default_enabled && <Badge>default on</Badge>}
                    {row.rn3_only && <Badge>rn3</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                  {formatMoneyCents(row.list_price_cents, row.currency)}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="text-xs font-semibold text-[#2BAADF] hover:underline"
                  >
                    Editar
                  </button>
                  {row.tipo !== 'foundation' && row.ativo && (
                    <button
                      type="button"
                      onClick={() => handleDeactivate(row.codigo)}
                      disabled={isPending}
                      className="text-xs font-semibold text-red-400/80 hover:text-red-400 inline-flex items-center gap-1"
                    >
                      <PowerOff className="w-3 h-3" />
                      Desativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 leading-snug">{hint}</p>}
    </div>
  )
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-[#ffffff30] bg-transparent text-[#80B828] focus:ring-[#80B828]/40"
      />
      <span className="text-xs">{label}</span>
    </label>
  )
}

function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
        muted
          ? 'bg-gray-500/15 text-gray-400 border-gray-500/25'
          : 'bg-[#2BAADF]/15 text-[#2BAADF] border-[#2BAADF]/25'
      }`}
    >
      {children}
    </span>
  )
}
