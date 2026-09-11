'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Save } from 'lucide-react'
import {
  ATIVO_FORM_SECTIONS,
  ATIVO_STATUS,
  type AtivoFormSectionId,
  type AtivoRecord,
} from '@/lib/ativos/constants'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

type Opt = { id: string; label: string }

type Props = {
  mode: 'create' | 'edit'
  ativo?: AtivoRecord | null
  skus: Opt[]
  pessoas: Opt[]
  formulas: Opt[]
  departamentos: Opt[]
  action: (formData: FormData) => Promise<{ error?: string } | void>
  cancelHref: string
  submitLabel: string
}

function Field({
  label,
  required,
  children,
  className = '',
  hint,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  className?: string
  hint?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label} {required && <span className="text-[#2BAADF]">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-600">{hint}</p>}
    </div>
  )
}

export default function AtivoForm({
  mode,
  ativo,
  skus,
  pessoas,
  formulas,
  departamentos,
  action,
  cancelHref,
  submitLabel,
}: Props) {
  const [section, setSection] = useState<AtivoFormSectionId>('identidade')

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await action(formData)
      if (result && 'error' in result && result.error) return { error: result.error }
      return null
    },
    null,
  )

  const sectionMeta = useMemo(
    () => ATIVO_FORM_SECTIONS.find((s) => s.id === section)!,
    [section],
  )

  const v = (key: keyof AtivoRecord, fallback = '') => {
    const raw = ativo?.[key]
    if (raw == null) return fallback
    if (typeof raw === 'boolean') return raw ? 'true' : 'false'
    return String(raw)
  }

  return (
    <form action={formAction} className="relative">
      {state?.error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{state.error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
          <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
            Seções
          </p>
          <nav className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5" role="tablist">
            {ATIVO_FORM_SECTIONS.map((item) => {
              const active = item.id === section
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSection(item.id)}
                  className={`rounded-xl px-2.5 py-2.5 text-left transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#2BAADF]/20 to-[#2BAADF]/5 text-[#2BAADF] border border-[#2BAADF]/25'
                      : 'text-gray-400 hover:bg-[#ffffff08] hover:text-white border border-transparent'
                  }`}
                >
                  <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                  <span className="mt-0.5 block text-[10px] text-gray-500 line-clamp-2">
                    {item.hint}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="border-b border-[#ffffff08] px-5 py-3.5 sm:px-6">
          <h3 className="text-base font-semibold text-white">{sectionMeta.label}</h3>
          <p className="text-xs text-gray-500">{sectionMeta.hint}</p>
        </div>

        <div className="min-h-[26rem] p-5 sm:min-h-[30rem] sm:p-6">
          <div className={section === 'identidade' ? 'space-y-5' : 'hidden'}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Código" required>
                <input name="codigo" required defaultValue={v('codigo')} className={inputCls} />
              </Field>
              <Field label="Nº patrimônio">
                <input
                  name="numero_patrimonio"
                  defaultValue={v('numero_patrimonio')}
                  className={inputCls}
                />
              </Field>
              <Field label="Nome" required className="md:col-span-2">
                <input name="nome" required defaultValue={v('nome')} className={inputCls} />
              </Field>
              <Field label="Nº série">
                <input name="numero_serie" defaultValue={v('numero_serie')} className={inputCls} />
              </Field>
              <Field label="Categoria">
                <input name="categoria" defaultValue={v('categoria')} className={inputCls} />
              </Field>
              <Field
                label="SKU de origem"
                className="md:col-span-2"
                hint="Opcional — quando o bem veio do catálogo de SKUs."
              >
                <select
                  name="sku_id"
                  defaultValue={v('sku_id')}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">—</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Descrição" className="md:col-span-2">
                <textarea
                  name="descricao"
                  rows={3}
                  defaultValue={v('descricao')}
                  className={`${inputCls} resize-none`}
                />
              </Field>
              <Field label="Cadastro ativo">
                <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    name="ativo"
                    defaultChecked={ativo?.ativo !== false}
                    className="rounded border-[#ffffff30] text-[#80B828] focus:ring-[#80B828]/40"
                  />
                  Ativo
                </label>
              </Field>
            </div>
          </div>

          <div className={section === 'aquisicao' ? 'space-y-5' : 'hidden'}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Data aquisição">
                <input
                  type="date"
                  name="data_aquisicao"
                  defaultValue={v('data_aquisicao')}
                  className={inputCls}
                />
              </Field>
              <Field label="Moeda">
                <input name="moeda" defaultValue={v('moeda', 'BRL')} className={inputCls} />
              </Field>
              <Field label="Valor aquisição">
                <input
                  name="valor_aquisicao"
                  defaultValue={v('valor_aquisicao')}
                  className={inputCls}
                />
              </Field>
              <Field label="Valor residual">
                <input
                  name="valor_residual"
                  defaultValue={v('valor_residual')}
                  className={inputCls}
                />
              </Field>
              <Field label="NF compra">
                <input name="nf_compra" defaultValue={v('nf_compra')} className={inputCls} />
              </Field>
              <Field label="Fornecedor">
                <select
                  name="fornecedor_id"
                  defaultValue={v('fornecedor_id')}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">—</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className={section === 'depreciacao' ? 'space-y-5' : 'hidden'}>
            <p className="rounded-xl border border-[#2BAADF]/15 bg-[#2BAADF]/5 px-3 py-2 text-xs text-gray-400">
              A fórmula de depreciação será cadastrada no módulo Ativo. Por enquanto selecione uma
              fórmula stub (se existir) ou deixe em branco — o vínculo já está previsto.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Fórmula de depreciação" className="md:col-span-2">
                <select
                  name="formula_depreciacao_id"
                  defaultValue={v('formula_depreciacao_id')}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">— Sem fórmula (definir depois) —</option>
                  {formulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Vida útil (meses)">
                <input
                  name="vida_util_meses"
                  defaultValue={v('vida_util_meses')}
                  className={inputCls}
                />
              </Field>
              <Field label="Taxa anual %">
                <input
                  name="taxa_anual_pct"
                  defaultValue={v('taxa_anual_pct')}
                  className={inputCls}
                />
              </Field>
              <Field label="Início depreciação">
                <input
                  type="date"
                  name="data_inicio_depreciacao"
                  defaultValue={v('data_inicio_depreciacao')}
                  className={inputCls}
                />
              </Field>
              <Field label="Valor contábil atual">
                <input
                  name="valor_contabil_atual"
                  defaultValue={v('valor_contabil_atual')}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          <div className={section === 'localizacao' ? 'space-y-5' : 'hidden'}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Localização física" className="md:col-span-2">
                <input name="localizacao" defaultValue={v('localizacao')} className={inputCls} />
              </Field>
              <Field
                label="Centro de custo"
                hint="Lista de departamentos (mesma estrutura organizacional)."
              >
                <select
                  name="departamento_id"
                  defaultValue={v('departamento_id')}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">—</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Responsável">
                <select
                  name="responsavel_id"
                  defaultValue={v('responsavel_id')}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">—</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Observações" className="md:col-span-2">
                <textarea
                  name="observacoes"
                  rows={3}
                  defaultValue={v('observacoes')}
                  className={`${inputCls} resize-none`}
                />
              </Field>
            </div>
          </div>

          <div className={section === 'situacao' ? 'space-y-5' : 'hidden'}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Status" required>
                <select
                  name="status"
                  defaultValue={v('status', 'em_uso')}
                  className={`${inputCls} appearance-none`}
                >
                  {ATIVO_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data baixa">
                <input
                  type="date"
                  name="data_baixa"
                  defaultValue={v('data_baixa')}
                  className={inputCls}
                />
              </Field>
              <Field label="Motivo baixa" className="md:col-span-2">
                <input name="motivo_baixa" defaultValue={v('motivo_baixa')} className={inputCls} />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[#ffffff0a] bg-[#0A0A0A] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="order-2 text-center text-xs text-gray-600 sm:order-1 sm:text-left">
            {mode === 'create' ? 'Novo ativo' : 'Editando ativo'} · {sectionMeta.label}
          </p>
          <div className="order-1 flex items-center justify-end gap-2 sm:order-2">
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
      </div>
    </form>
  )
}
