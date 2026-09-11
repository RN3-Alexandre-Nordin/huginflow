'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Save, AlertCircle } from 'lucide-react'
import {
  SKU_FORM_SECTIONS,
  SKU_NATUREZAS,
  SKU_TIPOS,
  SKU_UNIDADES,
  type SkuFormSectionId,
  type SkuRecord,
} from '@/lib/skus/constants'

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

type PessoaOpt = { id: string; nome: string | null; papeis?: string[] | null }

type Props = {
  mode: 'create' | 'edit'
  sku?: SkuRecord | null
  pessoas: PessoaOpt[]
  action: (formData: FormData) => Promise<{ error?: string } | void>
  cancelHref: string
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

function UmSelect({ name, defaultValue }: { name: string; defaultValue: string }) {
  const val = defaultValue || 'UN'
  const options = SKU_UNIDADES.includes(val as (typeof SKU_UNIDADES)[number])
    ? SKU_UNIDADES
    : ([val, ...SKU_UNIDADES] as string[])
  return (
    <select name={name} defaultValue={val} className={`${inputCls} appearance-none`}>
      {options.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  )
}

export default function SkuForm({
  mode,
  sku,
  pessoas,
  action,
  cancelHref,
  submitLabel,
}: Props) {
  const [section, setSection] = useState<SkuFormSectionId>('identidade')
  const [tipo, setTipo] = useState(sku?.tipo === 'servico' ? 'servico' : 'produto')

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await action(formData)
      if (result && 'error' in result && result.error) return { error: result.error }
      return null
    },
    null,
  )

  const sectionMeta = useMemo(
    () => SKU_FORM_SECTIONS.find((s) => s.id === section)!,
    [section],
  )

  const v = (key: keyof SkuRecord, fallback = '') => {
    const raw = sku?.[key]
    if (raw == null) return fallback
    if (typeof raw === 'boolean') return raw ? 'true' : 'false'
    return String(raw)
  }

  const fornecedores = pessoas.filter(
    (p) => !p.papeis?.length || p.papeis.includes('fornecedor') || p.papeis.includes('prestador'),
  )

  return (
    <form action={formAction} className="relative">
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
        <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
          <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
            Seções
          </p>
          <nav
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5"
            role="tablist"
            aria-label="Seções do SKU"
          >
            {SKU_FORM_SECTIONS.map((item) => {
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

          <div className="min-h-[26rem] p-5 sm:min-h-[30rem] sm:p-6">
            <div className={section === 'identidade' ? 'space-y-5' : 'hidden'} role="tabpanel">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Tipo" required>
                  <div className="flex gap-2">
                    {SKU_TIPOS.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setTipo(t.value)}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold border transition-all ${
                          tipo === t.value
                            ? 'bg-[#2BAADF]/15 text-[#2BAADF] border-[#2BAADF]/30'
                            : 'text-gray-400 border-[#ffffff12] hover:text-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="tipo" value={tipo} />
                </Field>
                <Field label="Natureza">
                  <select
                    name="natureza"
                    defaultValue={v('natureza', tipo === 'servico' ? 'servico' : 'fisico')}
                    className={`${inputCls} appearance-none`}
                  >
                    <option value="">—</option>
                    {SKU_NATUREZAS.map((n) => (
                      <option key={n.value} value={n.value}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Código (SKU Hugin)" required>
                  <input
                    name="codigo"
                    required
                    defaultValue={v('codigo')}
                    className={inputCls}
                    placeholder="Ex.: PROD-001"
                  />
                </Field>
                <Field label="Código de barras">
                  <input name="codigo_barras" defaultValue={v('codigo_barras')} className={inputCls} />
                </Field>
                <Field label="Nome" required className="md:col-span-2">
                  <input name="nome" required defaultValue={v('nome')} className={inputCls} />
                </Field>
                <Field label="Nome fiscal" className="md:col-span-2">
                  <input name="nome_fiscal" defaultValue={v('nome_fiscal')} className={inputCls} />
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
                      defaultChecked={sku?.ativo !== false}
                      className="rounded border-[#ffffff30] text-[#80B828] focus:ring-[#80B828]/40"
                    />
                    Ativo
                  </label>
                </Field>
              </div>
            </div>

            <div className={section === 'unidades' ? 'space-y-5' : 'hidden'} role="tabpanel">
              <p className="rounded-xl border border-[#2BAADF]/15 bg-[#2BAADF]/5 px-3 py-2 text-xs text-gray-400">
                Conversões de unidade (genéricas ou por SKU) ficam em{' '}
                <Link href="/cockpit/cadastros/conversoes-um" className="text-[#2BAADF] hover:underline">
                  SKUs → Conversões UM
                </Link>
                . De-para com cliente/fornecedor em{' '}
                <Link href="/cockpit/cadastros/sku-depara" className="text-[#2BAADF] hover:underline">
                  De-para SKU
                </Link>
                .
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="UM venda" required>
                  <UmSelect name="unidade_venda" defaultValue={v('unidade_venda', 'UN')} />
                </Field>
                <Field label="UM compra" required>
                  <UmSelect name="unidade_compra" defaultValue={v('unidade_compra', 'UN')} />
                </Field>
                <Field label="UM estoque" required>
                  <UmSelect name="unidade_estoque" defaultValue={v('unidade_estoque', 'UN')} />
                </Field>
              </div>
            </div>

            <div className={section === 'comercial' ? 'space-y-5' : 'hidden'} role="tabpanel">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Preço de venda">
                  <input name="preco_venda" defaultValue={v('preco_venda')} className={inputCls} />
                </Field>
                <Field label="Preço de custo">
                  <input name="preco_custo" defaultValue={v('preco_custo')} className={inputCls} />
                </Field>
                <Field label="Moeda">
                  <input name="moeda" defaultValue={v('moeda', 'BRL')} className={inputCls} />
                </Field>
                <Field label="Observações" className="md:col-span-3">
                  <textarea
                    name="observacoes"
                    rows={3}
                    defaultValue={v('observacoes')}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>
            </div>

            <div className={section === 'estoque' ? 'space-y-5' : 'hidden'} role="tabpanel">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Controle de estoque" className="md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      name="controla_estoque"
                      defaultChecked={sku?.controla_estoque === true}
                      className="rounded border-[#ffffff30] text-[#80B828] focus:ring-[#80B828]/40"
                    />
                    Controla estoque (quantidades na UM de estoque)
                  </label>
                </Field>
                <Field label="Ponto de reposição">
                  <input
                    name="ponto_reposicao"
                    defaultValue={v('ponto_reposicao')}
                    className={inputCls}
                  />
                </Field>
                <Field label="Lead time (dias)">
                  <input
                    name="lead_time_dias"
                    defaultValue={v('lead_time_dias')}
                    className={inputCls}
                  />
                </Field>
                <Field label="Estoque mínimo">
                  <input
                    name="estoque_minimo"
                    defaultValue={v('estoque_minimo')}
                    className={inputCls}
                  />
                </Field>
                <Field label="Estoque máximo">
                  <input
                    name="estoque_maximo"
                    defaultValue={v('estoque_maximo')}
                    className={inputCls}
                  />
                </Field>
                <Field label="Fornecedor padrão" className="md:col-span-2">
                  <select
                    name="fornecedor_padrao_id"
                    defaultValue={v('fornecedor_padrao_id')}
                    className={`${inputCls} appearance-none`}
                  >
                    <option value="">—</option>
                    {(fornecedores.length ? fornecedores : pessoas).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome || p.id}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div className={section === 'fiscal' ? 'space-y-4' : 'hidden'} role="tabpanel">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Coluna 1 — produto: ICMS/IPI · serviço: ISS */}
                <div className="space-y-3 rounded-xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                    {tipo === 'servico' ? 'Serviço / ISS' : 'Mercadoria / ICMS·IPI'}
                  </p>
                  {tipo === 'produto' ? (
                    <div className="grid grid-cols-1 gap-3">
                      <Field label="NCM">
                        <input name="ncm" defaultValue={v('ncm')} className={inputCls} />
                      </Field>
                      <Field label="CEST">
                        <input name="cest" defaultValue={v('cest')} className={inputCls} />
                      </Field>
                      <Field label="Origem (0–8)">
                        <input
                          name="origem_mercadoria"
                          maxLength={1}
                          defaultValue={v('origem_mercadoria')}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="CFOP venda dentro">
                        <input
                          name="cfop_venda_dentro"
                          defaultValue={v('cfop_venda_dentro')}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="CFOP venda fora">
                        <input
                          name="cfop_venda_fora"
                          defaultValue={v('cfop_venda_fora')}
                          className={inputCls}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="CST ICMS">
                          <input name="cst_icms" defaultValue={v('cst_icms')} className={inputCls} />
                        </Field>
                        <Field label="CSOSN">
                          <input name="csosn" defaultValue={v('csosn')} className={inputCls} />
                        </Field>
                        <Field label="Alíq. ICMS %">
                          <input name="aliq_icms" defaultValue={v('aliq_icms')} className={inputCls} />
                        </Field>
                        <Field label="Alíq. IPI %">
                          <input name="aliq_ipi" defaultValue={v('aliq_ipi')} className={inputCls} />
                        </Field>
                        <Field label="CST IPI" className="col-span-2">
                          <input name="cst_ipi" defaultValue={v('cst_ipi')} className={inputCls} />
                        </Field>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      <Field label="Código serviço LC 116">
                        <input
                          name="codigo_servico_lc116"
                          defaultValue={v('codigo_servico_lc116')}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Código serviço municipal">
                        <input
                          name="codigo_servico_municipal"
                          defaultValue={v('codigo_servico_municipal')}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="CNAE serviço">
                        <input
                          name="cnae_servico"
                          defaultValue={v('cnae_servico')}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="NBS">
                        <input name="nbs" defaultValue={v('nbs')} className={inputCls} />
                      </Field>
                      <Field label="Município prestação (IBGE)">
                        <input
                          name="municipio_prestacao_ibge"
                          defaultValue={v('municipio_prestacao_ibge')}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Alíq. ISS %">
                        <input name="aliq_iss" defaultValue={v('aliq_iss')} className={inputCls} />
                      </Field>
                      <Field label="ISS retido">
                        <label className="inline-flex items-center gap-2 pt-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            name="iss_retido"
                            defaultChecked={sku?.iss_retido === true}
                            className="rounded border-[#ffffff30] text-[#80B828] focus:ring-[#80B828]/40"
                          />
                          Sim
                        </label>
                      </Field>
                    </div>
                  )}
                </div>

                {/* Coluna 2 — PIS/COFINS (produto e serviço) */}
                <div className="space-y-3 rounded-xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                    PIS / COFINS
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    <Field label="CST PIS">
                      <input name="cst_pis" defaultValue={v('cst_pis')} className={inputCls} />
                    </Field>
                    <Field label="Alíq. PIS %">
                      <input name="aliq_pis" defaultValue={v('aliq_pis')} className={inputCls} />
                    </Field>
                    <Field label="CST COFINS">
                      <input name="cst_cofins" defaultValue={v('cst_cofins')} className={inputCls} />
                    </Field>
                    <Field label="Alíq. COFINS %">
                      <input name="aliq_cofins" defaultValue={v('aliq_cofins')} className={inputCls} />
                    </Field>
                    {tipo === 'servico' && (
                      <p className="text-[11px] leading-relaxed text-gray-500">
                        Impostos de serviço: ISS (coluna 1) + PIS/COFINS aqui. Na transição, IBS/CBS
                        entram na coluna Reforma.
                      </p>
                    )}
                  </div>
                </div>

                {/* Coluna 3 — Reforma IBS / CBS / IS */}
                <div className="space-y-3 rounded-xl border border-[#2BAADF]/15 bg-[#2BAADF]/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#2BAADF]/80">
                    Reforma · IBS / CBS / IS
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {tipo === 'produto' && (
                      <Field label="NBS (se aplicável)">
                        <input name="nbs" defaultValue={v('nbs')} className={inputCls} />
                      </Field>
                    )}
                    <Field label="cClassTrib IBS/CBS">
                      <input
                        name="class_trib_ibs_cbs"
                        defaultValue={v('class_trib_ibs_cbs')}
                        className={inputCls}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="CST IBS">
                        <input name="cst_ibs" defaultValue={v('cst_ibs')} className={inputCls} />
                      </Field>
                      <Field label="CST CBS">
                        <input name="cst_cbs" defaultValue={v('cst_cbs')} className={inputCls} />
                      </Field>
                    </div>
                    <Field label="Alíq. IBS %">
                      <input name="aliq_ibs" defaultValue={v('aliq_ibs')} className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="IBS UF %">
                        <input
                          name="aliq_ibs_uf"
                          defaultValue={v('aliq_ibs_uf')}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="IBS Mun. %">
                        <input
                          name="aliq_ibs_mun"
                          defaultValue={v('aliq_ibs_mun')}
                          className={inputCls}
                        />
                      </Field>
                    </div>
                    <Field label="Alíq. CBS %">
                      <input name="aliq_cbs" defaultValue={v('aliq_cbs')} className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="% red. IBS">
                        <input
                          name="perc_red_ibs"
                          defaultValue={v('perc_red_ibs')}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="% red. CBS">
                        <input
                          name="perc_red_cbs"
                          defaultValue={v('perc_red_cbs')}
                          className={inputCls}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="CST IS">
                        <input name="cst_is" defaultValue={v('cst_is')} className={inputCls} />
                      </Field>
                      <Field label="Alíq. IS %">
                        <input name="aliq_is" defaultValue={v('aliq_is')} className={inputCls} />
                      </Field>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preserva campos do outro tipo no submit */}
              {tipo === 'produto' && (
                <>
                  <input type="hidden" name="codigo_servico_lc116" value={v('codigo_servico_lc116')} />
                  <input
                    type="hidden"
                    name="codigo_servico_municipal"
                    value={v('codigo_servico_municipal')}
                  />
                  <input type="hidden" name="cnae_servico" value={v('cnae_servico')} />
                  <input
                    type="hidden"
                    name="municipio_prestacao_ibge"
                    value={v('municipio_prestacao_ibge')}
                  />
                  <input type="hidden" name="aliq_iss" value={v('aliq_iss')} />
                </>
              )}
              {tipo === 'servico' && (
                <>
                  <input type="hidden" name="ncm" value={v('ncm')} />
                  <input type="hidden" name="cest" value={v('cest')} />
                  <input type="hidden" name="origem_mercadoria" value={v('origem_mercadoria')} />
                  <input type="hidden" name="cfop_venda_dentro" value={v('cfop_venda_dentro')} />
                  <input type="hidden" name="cfop_venda_fora" value={v('cfop_venda_fora')} />
                  <input type="hidden" name="cst_icms" value={v('cst_icms')} />
                  <input type="hidden" name="csosn" value={v('csosn')} />
                  <input type="hidden" name="aliq_icms" value={v('aliq_icms')} />
                  <input type="hidden" name="aliq_ipi" value={v('aliq_ipi')} />
                  <input type="hidden" name="cst_ipi" value={v('cst_ipi')} />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#ffffff0a] bg-[#0A0A0A] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="order-2 text-center text-xs text-gray-600 sm:order-1 sm:text-left">
              {mode === 'create' ? 'Novo SKU' : 'Editando SKU'} · {sectionMeta.label}
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
