'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Save, AlertCircle } from 'lucide-react'
import {
  PESSOA_FORM_SECTIONS,
  PESSOA_NATUREZAS,
  PESSOA_PAPEIS,
  PESSOA_PREFERENCIAS_CONTATO,
  PESSOA_STATUS,
  type PessoaFormSectionId,
  type PessoaRecord,
} from '@/lib/pessoas/constants'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

type Canal = { id: string; nome: string }

type Props = {
  mode: 'create' | 'edit'
  pessoa?: PessoaRecord | null
  canais: Canal[] | null
  action: (formData: FormData) => Promise<{ error?: string } | void>
  cancelHref: string
  linkCardId?: string | null
  submitLabel: string
}

function Field({
  label,
  required,
  children,
  className = '',
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label} {required && <span className="text-[#2BAADF]">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function PessoaForm({
  mode,
  pessoa,
  canais,
  action,
  cancelHref,
  linkCardId,
  submitLabel,
}: Props) {
  const [section, setSection] = useState<PessoaFormSectionId>('identidade')
  const [natureza, setNatureza] = useState(pessoa?.natureza === 'pj' ? 'pj' : 'pf')
  const [papeis, setPapeis] = useState<string[]>(
    pessoa?.papeis?.length ? pessoa.papeis : ['lead'],
  )

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await action(formData)
      if (result && 'error' in result && result.error) return { error: result.error }
      return null
    },
    null,
  )

  const sectionMeta = useMemo(
    () => PESSOA_FORM_SECTIONS.find((s) => s.id === section)!,
    [section],
  )

  const togglePapel = (value: string) => {
    setPapeis((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev
        return prev.filter((p) => p !== value)
      }
      return [...prev, value]
    })
  }

  const v = (key: keyof PessoaRecord, fallback = '') => {
    const raw = pessoa?.[key]
    if (raw == null) return fallback
    if (typeof raw === 'boolean') return raw ? 'true' : 'false'
    return String(raw)
  }

  return (
    <form action={formAction} className="relative">
      {linkCardId && <input type="hidden" name="link_card_id" value={linkCardId} />}
      {papeis.map((p) => (
        <input key={p} type="hidden" name="papeis" value={p} />
      ))}

      {isPending && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-[2px]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2BAADF]/20 border-t-[#2BAADF]" />
        </div>
      )}

      {state?.error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{state.error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        {/* Seletor horizontal — só troca o painel abaixo */}
        <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
          <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
            Seções
          </p>
          <nav
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6"
            role="tablist"
            aria-label="Seções do cadastro"
          >
            {PESSOA_FORM_SECTIONS.map((item) => {
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
                  <span className="block text-sm font-semibold tracking-tight leading-tight">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-gray-500 line-clamp-2">
                    {item.hint}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="flex flex-col">
          <div className="border-b border-[#ffffff08] px-5 py-3.5 sm:px-6">
            <h3 className="text-base font-semibold text-white">{sectionMeta.label}</h3>
            <p className="text-xs text-gray-500">{sectionMeta.hint}</p>
          </div>

          {/* Altura mínima estável; só 1 seção visível (demais hidden no DOM p/ submit) */}
          <div className="min-h-[28rem] p-5 sm:min-h-[32rem] sm:p-6 lg:min-h-[34rem]">
            {/* Identidade */}
            <div
              className={section === 'identidade' ? 'space-y-5' : 'hidden'}
              role="tabpanel"
              aria-hidden={section !== 'identidade'}
            >
              <Field label="Papéis" required>
                <div className="flex flex-wrap gap-2">
                  {PESSOA_PAPEIS.map((papel) => {
                    const on = papeis.includes(papel.value)
                    return (
                      <button
                        key={papel.value}
                        type="button"
                        onClick={() => togglePapel(papel.value)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide border transition-all ${
                          on
                            ? 'bg-[#80B828]/15 text-[#80B828] border-[#80B828]/30'
                            : 'bg-transparent text-gray-500 border-[#ffffff12] hover:text-white'
                        }`}
                      >
                        {papel.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Natureza" required>
                  <div className="flex gap-2">
                    {PESSOA_NATUREZAS.map((n) => (
                      <button
                        key={n.value}
                        type="button"
                        onClick={() => setNatureza(n.value)}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold border transition-all ${
                          natureza === n.value
                            ? 'bg-[#2BAADF]/15 text-[#2BAADF] border-[#2BAADF]/30'
                            : 'text-gray-400 border-[#ffffff12] hover:text-white'
                        }`}
                      >
                        {n.label}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="natureza" value={natureza} />
                </Field>
                <Field label="Status">
                  <select
                    name="status_relacionamento"
                    defaultValue={v('status_relacionamento', 'ativo')}
                    className={`${inputCls} appearance-none`}
                  >
                    {PESSOA_STATUS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={natureza === 'pj' ? 'Razão social' : 'Nome completo'}
                  required
                  className="md:col-span-2"
                >
                  <input name="nome" required defaultValue={v('nome')} className={inputCls} />
                </Field>
                <Field
                  label="Nome fantasia"
                  className={`md:col-span-2 ${natureza === 'pj' ? '' : 'hidden'}`}
                >
                  <input
                    name="nome_fantasia"
                    defaultValue={v('nome_fantasia')}
                    className={inputCls}
                  />
                </Field>
                <Field label={natureza === 'pj' ? 'CNPJ' : 'CPF'}>
                  <input name="documento" defaultValue={v('documento')} className={inputCls} />
                </Field>
                <Field label={natureza === 'pj' ? 'Inscrição estadual' : 'RG'}>
                  <input name="rg_ie" defaultValue={v('rg_ie')} className={inputCls} />
                </Field>
                <Field
                  label="Inscrição municipal"
                  className={natureza === 'pj' ? '' : 'hidden'}
                >
                  <input
                    name="inscricao_municipal"
                    defaultValue={v('inscricao_municipal')}
                    className={inputCls}
                  />
                </Field>
                <Field label="Cadastro ativo">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      name="ativo"
                      defaultChecked={pessoa?.ativo !== false}
                      className="rounded border-[#ffffff30] text-[#80B828] focus:ring-[#80B828]/40"
                    />
                    Ativo
                  </label>
                </Field>
              </div>
            </div>

            {/* Contato */}
            <div
              className={section === 'contato' ? 'space-y-5' : 'hidden'}
              role="tabpanel"
              aria-hidden={section !== 'contato'}
            >
              {linkCardId && (
                <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  Informe WhatsApp ou telefone — obrigatório para conversa no card.
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="WhatsApp">
                  <input name="whatsapp" defaultValue={v('whatsapp')} className={inputCls} />
                </Field>
                <Field label="Telefone">
                  <input name="telefone" defaultValue={v('telefone')} className={inputCls} />
                </Field>
                <Field label="Telefone 2">
                  <input name="telefone_2" defaultValue={v('telefone_2')} className={inputCls} />
                </Field>
                <Field label="Preferência de contato">
                  <select
                    name="preferencia_contato"
                    defaultValue={v('preferencia_contato')}
                    className={`${inputCls} appearance-none`}
                  >
                    <option value="">—</option>
                    {PESSOA_PREFERENCIAS_CONTATO.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="E-mail">
                  <input
                    type="email"
                    name="email"
                    defaultValue={v('email')}
                    className={inputCls}
                  />
                </Field>
                <Field label="E-mail financeiro">
                  <input
                    type="email"
                    name="email_financeiro"
                    defaultValue={v('email_financeiro')}
                    className={inputCls}
                  />
                </Field>
                <Field label="Site" className="md:col-span-2">
                  <input name="site" defaultValue={v('site')} className={inputCls} />
                </Field>
              </div>
            </div>

            {/* Endereço */}
            <div
              className={section === 'endereco' ? 'space-y-5' : 'hidden'}
              role="tabpanel"
              aria-hidden={section !== 'endereco'}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
                <Field label="CEP" className="md:col-span-2">
                  <input name="cep" defaultValue={v('cep')} className={inputCls} />
                </Field>
                <Field label="UF" className="md:col-span-1">
                  <input
                    name="uf"
                    maxLength={2}
                    defaultValue={v('uf')}
                    className={inputCls}
                    placeholder="SP"
                  />
                </Field>
                <Field label="Cidade" className="md:col-span-3">
                  <input name="cidade" defaultValue={v('cidade')} className={inputCls} />
                </Field>
                <Field label="Logradouro" className="md:col-span-4">
                  <input name="logradouro" defaultValue={v('logradouro')} className={inputCls} />
                </Field>
                <Field label="Número" className="md:col-span-2">
                  <input name="numero" defaultValue={v('numero')} className={inputCls} />
                </Field>
                <Field label="Complemento" className="md:col-span-3">
                  <input name="complemento" defaultValue={v('complemento')} className={inputCls} />
                </Field>
                <Field label="Bairro" className="md:col-span-3">
                  <input name="bairro" defaultValue={v('bairro')} className={inputCls} />
                </Field>
                <Field label="País" className="md:col-span-2">
                  <input name="pais" defaultValue={v('pais', 'BR')} className={inputCls} />
                </Field>
              </div>
            </div>

            {/* Comercial */}
            <div
              className={section === 'comercial' ? 'space-y-5' : 'hidden'}
              role="tabpanel"
              aria-hidden={section !== 'comercial'}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Canal de origem">
                  <select
                    name="canal_id"
                    defaultValue={v('canal_id')}
                    className={`${inputCls} appearance-none`}
                  >
                    <option value="">— Não informado —</option>
                    {canais?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Detalhe da origem">
                  <input
                    name="origem_detalhe"
                    defaultValue={v('origem_detalhe')}
                    className={inputCls}
                    placeholder="Campanha, indicação…"
                  />
                </Field>
                <Field label="Empresa / empregador">
                  <input
                    name="empresa_cliente"
                    defaultValue={v('empresa_cliente')}
                    className={inputCls}
                  />
                </Field>
                <Field label="Cargo">
                  <input name="cargo" defaultValue={v('cargo')} className={inputCls} />
                </Field>
                <Field label="Observações" className="md:col-span-2">
                  <textarea
                    name="observacoes"
                    rows={4}
                    defaultValue={v('observacoes')}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>
            </div>

            {/* Fiscal */}
            <div
              className={section === 'fiscal' ? 'space-y-5' : 'hidden'}
              role="tabpanel"
              aria-hidden={section !== 'fiscal'}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Regime tributário">
                  <input
                    name="regime_tributario"
                    defaultValue={v('regime_tributario')}
                    className={inputCls}
                    placeholder="Simples, Lucro presumido…"
                  />
                </Field>
                <Field label="Optante Simples">
                  <label className="inline-flex items-center gap-2 pt-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      name="optante_simples"
                      defaultChecked={pessoa?.optante_simples === true}
                      className="rounded border-[#ffffff30] text-[#80B828] focus:ring-[#80B828]/40"
                    />
                    Sim
                  </label>
                </Field>
              </div>
            </div>

            {/* Financeiro */}
            <div
              className={section === 'financeiro' ? 'space-y-5' : 'hidden'}
              role="tabpanel"
              aria-hidden={section !== 'financeiro'}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="PIX" className="md:col-span-2">
                  <input name="pix" defaultValue={v('pix')} className={inputCls} />
                </Field>
                <Field label="Banco">
                  <input name="banco" defaultValue={v('banco')} className={inputCls} />
                </Field>
                <Field label="Agência">
                  <input name="agencia" defaultValue={v('agencia')} className={inputCls} />
                </Field>
                <Field label="Conta" className="md:col-span-2">
                  <input name="conta" defaultValue={v('conta')} className={inputCls} />
                </Field>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#ffffff0a] bg-[#0A0A0A] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="order-2 text-center text-xs text-gray-600 sm:order-1 sm:text-left">
              {mode === 'create' ? 'Nova pessoa' : 'Editando cadastro'} · {sectionMeta.label}
            </p>
            <div className="order-1 flex items-center justify-end gap-2 sm:order-2">
              <Link
                href={cancelHref}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#ffffff12] px-4 text-sm font-medium text-gray-300 transition-colors hover:border-[#ffffff20] hover:bg-[#ffffff08] hover:text-white"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 text-sm font-semibold text-white shadow-[0_2px_12px_rgba(43,170,223,0.25)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4 shrink-0 opacity-90" />
                <span>{isPending ? 'Salvando…' : submitLabel}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
