'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  Briefcase,
  User,
  Power,
  PowerOff,
  CheckCircle2,
  XCircle,
  Save,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Cpu,
  Clock,
  Boxes,
  ChevronDown,
  Info,
  CreditCard,
} from 'lucide-react'
import {
  maskCNPJ,
  maskPhone,
  maskCPF,
  validateCNPJ,
  validateCPF,
} from '@/utils/brasilian-formatters'
import { TIPOS_SOCIETARIOS, ESTADOS_CIVIS } from '@/constants/empresa-juridico'
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/lib/ai/empresa-ai'
import type {
  CommercialStatus,
  EmpresaAddonLine,
  EmpresaAddonUpdateInput,
} from '@/lib/addons/entitlements'
import { updateEmpresaAddons } from '@/app/(app)/cockpit/empresas/addon-actions'
import { parseMoneyInput } from '@/lib/finance/format'

import {
  type EmpresaFormSectionId,
  type EmpresaFormSection,
  type EmpresaRecord,
  EMPRESA_FORM_SECTIONS,
} from '@/constants/empresa-form'

export type { EmpresaFormSectionId, EmpresaFormSection, EmpresaRecord }
export { EMPRESA_FORM_SECTIONS }

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

const COMMERCIAL_OPTIONS: { value: CommercialStatus; label: string }[] = [
  { value: 'active', label: 'Ativo' },
  { value: 'trial', label: 'Trial' },
  { value: 'courtesy', label: 'Cortesia' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'ended', label: 'Encerrado' },
]

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-[#ffffff08]">
      <div className="w-8 h-8 rounded-lg bg-[#2BAADF]/10 border border-[#2BAADF]/20 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#2BAADF]" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white leading-tight">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  )
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

function safeIsoDate(raw: string): string | null {
  if (!raw || !raw.trim()) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
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

function draftsToPayload(drafts: DraftLine[]): EmpresaAddonUpdateInput[] {
  return drafts.map((d) => ({
    addon_codigo: d.addon_codigo,
    enabled: d.enabled,
    plano: d.plano.trim() || null,
    commercial_status: d.commercial_status,
    quantity: d.quantity,
    price_override_cents: moneyInputToCents(d.price_override),
    starts_at: safeIsoDate(d.starts_at),
    ends_at: safeIsoDate(d.ends_at),
  }))
}

interface EmpresaFormProps {
  mode: 'create' | 'edit'
  empresa?: EmpresaRecord | null
  addonLines?: EmpresaAddonLine[]
  canEditAddons?: boolean
  cancelHref?: string
  action: (formData: FormData) => Promise<{ error?: string } | void>
  deleteAction?: () => Promise<{ error?: string } | void>
  toggleStatusAction?: (novoStatus: boolean) => Promise<{ error?: string } | void>
}

export default function EmpresaForm({
  mode,
  empresa,
  addonLines = [],
  canEditAddons = false,
  cancelHref = '/cockpit/empresas',
  action,
  deleteAction,
  toggleStatusAction,
}: EmpresaFormProps) {
  const [section, setSection] = useState<EmpresaFormSectionId>('corporativo')
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Status de Contrato / Acesso
  const [isAtivo, setIsAtivo] = useState(empresa?.ativo ?? true)
  const [showStatusConfirm, setShowStatusConfirm] = useState(false)

  // Máscaras e validações
  const [cnpj, setCnpj] = useState(maskCNPJ(empresa?.cnpj ?? ''))
  const [phone, setPhone] = useState(maskPhone(empresa?.telefone ?? ''))
  const [finPhone, setFinPhone] = useState(maskPhone(empresa?.financeiro_telefone ?? ''))
  const [respPhone, setRespPhone] = useState(maskPhone(empresa?.responsavel_telefone ?? ''))
  const [respCpf, setRespCpf] = useState(maskCPF(empresa?.responsavel_cpf ?? ''))
  const [isValidCnpj, setIsValidCnpj] = useState(
    empresa?.cnpj ? validateCNPJ(empresa.cnpj) : true,
  )
  const [isValidCpf, setIsValidCpf] = useState(
    empresa?.responsavel_cpf ? validateCPF(empresa.responsavel_cpf) : true,
  )

  // Gestão de Addons
  const [drafts, setDrafts] = useState<DraftLine[]>(() => draftsFromLines(addonLines))
  const [addonsMessage, setAddonsMessage] = useState<string | null>(null)
  const [addonsError, setAddonsError] = useState<string | null>(null)
  const [isSavingAddons, startAddonsTransition] = useTransition()

  const byCodigo = useMemo(() => {
    return new Map(addonLines.map((l) => [l.addon_codigo, l]))
  }, [addonLines])

  const sectionMeta = useMemo(() => {
    return EMPRESA_FORM_SECTIONS.find((s) => s.id === section)!
  }, [section])

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const masked = maskCNPJ(value)
    setCnpj(masked)

    const digits = value.replace(/\D/g, '')
    if (digits.length === 14) {
      setIsValidCnpj(validateCNPJ(digits))
    } else {
      setIsValidCnpj(true)
    }
  }

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const masked = maskCPF(value)
    setRespCpf(masked)

    const digits = value.replace(/\D/g, '')
    if (digits.length === 11) {
      setIsValidCpf(validateCPF(digits))
    } else {
      setIsValidCpf(true)
    }
  }

  const handleStatusToggle = () => {
    if (!toggleStatusAction) return
    const novoStatus = !isAtivo
    startTransition(async () => {
      try {
        const res = await toggleStatusAction(novoStatus)
        if (res && 'error' in res && res.error) {
          setFormError(res.error)
          return
        }
        setIsAtivo(novoStatus)
        setShowStatusConfirm(false)
      } catch (err: any) {
        setFormError(err?.message ?? 'Falha ao atualizar status da empresa.')
      }
    })
  }

  const handleDelete = () => {
    if (!deleteAction) return
    startTransition(async () => {
      try {
        const res = await deleteAction()
        if (res && 'error' in res && res.error) {
          setFormError(res.error)
        }
      } catch (err: any) {
        if (err?.message?.includes('NEXT_REDIRECT')) throw err
        setFormError(err?.message ?? 'Falha ao excluir empresa.')
      }
    })
  }

  const handleUpdateDraft = (codigo: string, patch: Partial<DraftLine>) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.addon_codigo !== codigo) return d
        const updated = { ...d, ...patch }
        // Ao ativar o addon, se estiver como 'ended', muda para 'active'
        if (patch.enabled === true && updated.commercial_status === 'ended') {
          updated.commercial_status = 'active'
        }
        // Ao desativar o addon, se estiver como 'active', muda para 'ended'
        if (patch.enabled === false && updated.commercial_status === 'active') {
          updated.commercial_status = 'ended'
        }
        return updated
      }),
    )
  }

  const handleSaveAddons = () => {
    if (!canEditAddons || !empresa?.id) return
    setAddonsMessage(null)
    setAddonsError(null)

    const payload = draftsToPayload(drafts)

    startAddonsTransition(async () => {
      const result = await updateEmpresaAddons(empresa.id, payload)
      if ('error' in result) {
        setAddonsError(result.error)
        return
      }
      setAddonsMessage('Addons da empresa atualizados com sucesso.')
    })
  }

  const handleSubmit = (formData: FormData) => {
    setFormError(null)
    startTransition(async () => {
      try {
        const result = await action(formData)
        if (result && 'error' in result && result.error) {
          setFormError(result.error)
        }
      } catch (err: any) {
        // Redirecionamentos do Next.js disparam NEXT_REDIRECT (não devem ser tratados como erro)
        if (err?.message?.includes('NEXT_REDIRECT')) throw err
        setFormError(err?.message ?? 'Erro inesperado ao salvar empresa.')
      }
    })
  }

  const resolvedDefaultModel =
    empresa?.ai_model && AI_MODELS.some((m) => m.value === empresa.ai_model)
      ? empresa.ai_model
      : DEFAULT_AI_MODEL

  return (
    <form action={handleSubmit} className="relative">
      {canEditAddons && (
        <input
          type="hidden"
          name="addons_payload"
          value={JSON.stringify(draftsToPayload(drafts))}
        />
      )}
      {isPending && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-[2px]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2BAADF]/20 border-t-[#2BAADF]" />
        </div>
      )}

      {formError && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{formError}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        {/* Barra superior de Navegação de Seções / Abas */}
        <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
          <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
            Seções
          </p>
          <nav
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6"
            role="tablist"
            aria-label="Seções do Cadastro de Empresa"
          >
            {EMPRESA_FORM_SECTIONS.map((item) => {
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
          {/* Cabeçalho da Seção Ativa */}
          <div className="border-b border-[#ffffff08] px-5 py-3.5 sm:px-6 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-white">{sectionMeta.label}</h3>
              <p className="text-xs text-gray-500">{sectionMeta.hint}</p>
            </div>
            {mode === 'edit' && empresa && (
              <div className="hidden sm:flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                    isAtivo
                      ? 'bg-[#80B828]/10 text-[#80B828] border-[#80B828]/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isAtivo ? 'bg-[#80B828]' : 'bg-red-400'}`}
                  />
                  {isAtivo ? 'Ativa' : 'Suspensa'}
                </span>
              </div>
            )}
          </div>

          {/* Área de Conteúdo das Abas */}
          <div className="min-h-[26rem] p-5 sm:min-h-[30rem] sm:p-6 space-y-6">
            {/* ══════════════════════════════════════════════════════════════
                ABA 1: CORPORATIVO & CONTRATO
            ══════════════════════════════════════════════════════════════ */}
            <div
              className={section === 'corporativo' ? 'space-y-6 animate-in fade-in duration-200' : 'hidden'}
              role="tabpanel"
            >
              {/* Bloco 1.1: Status do Contrato / Acesso */}
              {mode === 'edit' && empresa && toggleStatusAction && (
                <div
                  className={`rounded-2xl border p-5 transition-all relative overflow-hidden ${
                    isAtivo
                      ? 'bg-[#80B828]/5 border-[#80B828]/20'
                      : 'bg-red-500/5 border-red-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isAtivo ? 'bg-[#80B828]/10 text-[#80B828]' : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {isAtivo ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">
                          Status do Contrato / Acesso
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {isAtivo ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#80B828]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Empresa Ativa — Usuários podem acessar o sistema
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
                              <XCircle className="w-3.5 h-3.5" />
                              Empresa Suspensa — Logins de usuários bloqueados
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!showStatusConfirm ? (
                      <button
                        type="button"
                        onClick={() => setShowStatusConfirm(true)}
                        disabled={isPending}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 border ${
                          isAtivo
                            ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25'
                            : 'bg-[#80B828]/10 hover:bg-[#80B828]/20 text-[#80B828] border-[#80B828]/25'
                        }`}
                      >
                        {isAtivo ? 'Suspender Acesso' : 'Reativar Acesso'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 bg-[#0A0A0A]/80 border border-[#ffffff15] p-1.5 rounded-xl">
                        <span className="text-xs text-gray-400 px-2">Confirmar?</span>
                        <button
                          type="button"
                          onClick={handleStatusToggle}
                          disabled={isPending}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isAtivo
                              ? 'bg-red-500 hover:bg-red-600 text-white'
                              : 'bg-[#80B828] hover:bg-[#6da020] text-white'
                          }`}
                        >
                          {isPending ? '...' : 'Sim, alterar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowStatusConfirm(false)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:bg-[#ffffff10] transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  {!isAtivo && (
                    <p className="mt-3 text-xs text-red-400/80 border-t border-red-500/15 pt-3">
                      ⚠️ Todos os logins de usuários desta empresa estão bloqueados. Clique em
                      &quot;Reativar Acesso&quot; para restaurar o acesso.
                    </p>
                  )}
                </div>
              )}

              {/* Bloco 1.2: Dados Cadastrais Corporativos */}
              <div className="rounded-2xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-5 space-y-4">
                <SectionHeader
                  icon={Building2}
                  title="Dados Corporativos"
                  subtitle="Informações oficiais da pessoa jurídica para contrato e cadastro"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Razão Social" required className="md:col-span-2">
                    <input
                      type="text"
                      name="nome"
                      required
                      defaultValue={empresa?.nome ?? ''}
                      placeholder="Ex: Acme Soluções Ltda."
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Tipo Societário" required>
                    <select
                      name="tipo_societario"
                      required
                      defaultValue={empresa?.tipo_societario ?? ''}
                      className={`${inputCls} appearance-none bg-[#0A0A0A]`}
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {TIPOS_SOCIETARIOS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="CNPJ" required>
                    <div className="relative">
                      <input
                        type="text"
                        name="cnpj"
                        required
                        value={cnpj}
                        onChange={handleCnpjChange}
                        maxLength={18}
                        placeholder="00.000.000/0001-00"
                        className={`${inputCls} font-mono tracking-wider ${
                          !isValidCnpj
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                            : ''
                        }`}
                      />
                      {!isValidCnpj && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-red-500 animate-in fade-in zoom-in duration-200">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-tight">
                            Inválido
                          </span>
                        </div>
                      )}
                    </div>
                  </Field>

                  <Field label="Cidade (Sede)">
                    <input
                      type="text"
                      name="cidade"
                      defaultValue={empresa?.cidade ?? ''}
                      placeholder="Ex: São Paulo"
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Ramo de Atividade">
                    <input
                      type="text"
                      name="ramo_atividade"
                      defaultValue={empresa?.ramo_atividade ?? ''}
                      placeholder="Ex: Tecnologia, Varejo, Saúde..."
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                ABA 2: CONTATO & SEDE
            ══════════════════════════════════════════════════════════════ */}
            <div
              className={section === 'contato' ? 'space-y-6 animate-in fade-in duration-200' : 'hidden'}
              role="tabpanel"
            >
              {/* Bloco 2.1: Canais Corporativos */}
              <div className="rounded-2xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-5 space-y-4">
                <SectionHeader
                  icon={Phone}
                  title="Canais de Comunicação Corporativos"
                  subtitle="Pontos de contato oficiais da organização"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="E-mail Corporativo">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        name="email"
                        defaultValue={empresa?.email ?? ''}
                        placeholder="contato@empresa.com.br"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>

                  <Field label="Telefone Geral" required>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        name="telefone"
                        required
                        value={phone}
                        onChange={(e) => setPhone(maskPhone(e.target.value))}
                        placeholder="(00) 0000-0000"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>

                  <Field label="Website Corporativo" className="md:col-span-2">
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        name="website"
                        defaultValue={empresa?.website ?? ''}
                        placeholder="www.empresa.com.br"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>
                </div>
              </div>

              {/* Bloco 2.2: Endereço Oficial */}
              <div className="rounded-2xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-5 space-y-4">
                <SectionHeader
                  icon={MapPin}
                  title="Localização da Sede"
                  subtitle="Endereço físico oficial para notas fiscais e correspondência"
                />

                <div>
                  <Field label="Endereço Completo" required>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                      <textarea
                        name="endereco"
                        required
                        rows={3}
                        defaultValue={empresa?.endereco ?? ''}
                        placeholder="Logradouro, Número, Complemento, Bairro, Cidade - UF, CEP"
                        className={`${inputCls} pl-10 resize-none`}
                      />
                    </div>
                  </Field>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                ABA 3: FINANCEIRO & FATURAMENTO
            ══════════════════════════════════════════════════════════════ */}
            <div
              className={section === 'financeiro' ? 'space-y-6 animate-in fade-in duration-200' : 'hidden'}
              role="tabpanel"
            >
              <div className="rounded-2xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-5 space-y-4">
                <SectionHeader
                  icon={CreditCard}
                  title="Contato Financeiro & Cobrança"
                  subtitle="Destinatário oficial para envio de faturas, boletos, notas fiscais e conciliação"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Nome do Responsável Financeiro">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        name="financeiro_nome"
                        defaultValue={empresa?.financeiro_nome ?? ''}
                        placeholder="Ex.: Maria Santos (Contas a Pagar)"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>

                  <Field label="E-mail Financeiro / Cobrança">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        name="financeiro_email"
                        defaultValue={empresa?.financeiro_email ?? ''}
                        placeholder="financeiro@empresa.com.br"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>

                  <Field label="Telefone / WhatsApp Financeiro">
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        name="financeiro_telefone"
                        value={finPhone}
                        onChange={(e) => setFinPhone(maskPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>

                  <Field label="Chave PIX da Empresa">
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        name="financeiro_chave_pix"
                        defaultValue={empresa?.financeiro_chave_pix ?? ''}
                        placeholder="CNPJ, E-mail, Telefone ou Chave Aleatória"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>
                </div>
              </div>

              {/* Informação / Dica de apoio */}
              <div className="rounded-xl border border-[#2BAADF]/20 bg-[#2BAADF]/5 p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-[#2BAADF] shrink-0 mt-0.5" />
                <div className="text-xs text-gray-400 space-y-1">
                  <p className="font-semibold text-white">Utilização dos Dados Financeiros</p>
                  <p>
                    Estas informações são utilizadas automaticamente nas rotinas de Contas a Receber,
                    geração de contratos, faturamento de assinaturas de módulos e notificações de cobrança.
                  </p>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                ABA 4: REPRESENTANTE LEGAL
            ══════════════════════════════════════════════════════════════ */}
            <div
              className={section === 'representante' ? 'space-y-6 animate-in fade-in duration-200' : 'hidden'}
              role="tabpanel"
            >
              {/* Bloco 3.1: Qualificação Civil e Jurídica */}
              <div className="rounded-2xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-5 space-y-4">
                <SectionHeader
                  icon={User}
                  title="Qualificação Civil do Representante"
                  subtitle="Dados exigidos para assinatura e validade jurídica do Contrato MSA"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Nome Completo" required>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        name="responsavel_nome"
                        required
                        defaultValue={empresa?.responsavel_nome ?? ''}
                        placeholder="Ex: João da Silva"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>

                  <Field label="CPF" required>
                    <div className="relative">
                      <input
                        type="text"
                        name="responsavel_cpf"
                        required
                        value={respCpf}
                        onChange={handleCpfChange}
                        maxLength={14}
                        placeholder="000.000.000-00"
                        className={`${inputCls} font-mono tracking-wider ${
                          !isValidCpf
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                            : ''
                        }`}
                      />
                      {!isValidCpf && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-red-500">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-tight">
                            Inválido
                          </span>
                        </div>
                      )}
                    </div>
                  </Field>

                  <Field label="Nacionalidade" required>
                    <input
                      type="text"
                      name="responsavel_nacionalidade"
                      required
                      defaultValue={empresa?.responsavel_nacionalidade ?? 'brasileiro(a)'}
                      placeholder="Ex: brasileiro(a)"
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Estado Civil" required>
                    <select
                      name="responsavel_estado_civil"
                      required
                      defaultValue={empresa?.responsavel_estado_civil ?? ''}
                      className={`${inputCls} appearance-none bg-[#0A0A0A]`}
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {ESTADOS_CIVIS.map((ec) => (
                        <option key={ec} value={ec}>
                          {ec.charAt(0).toUpperCase() + ec.slice(1)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Profissão" required>
                    <input
                      type="text"
                      name="responsavel_profissao"
                      required
                      defaultValue={empresa?.responsavel_profissao ?? ''}
                      placeholder="Ex: administrador de empresas"
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Cargo / Qualidade" required>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        name="responsavel_cargo"
                        required
                        defaultValue={empresa?.responsavel_cargo ?? ''}
                        placeholder="Ex: Sócio Administrador, Diretor..."
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>
                </div>
              </div>

              {/* Bloco 3.2: Contato Direto do Representante */}
              <div className="rounded-2xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-5 space-y-4">
                <SectionHeader
                  icon={Phone}
                  title="Contato Direto do Representante"
                  subtitle="Canais para assinatura eletrônica e notificações contratuais"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="E-mail do Representante" required>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="email"
                        name="responsavel_email"
                        required
                        defaultValue={empresa?.responsavel_email ?? ''}
                        placeholder="responsavel@empresa.com.br"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>

                  <Field label="WhatsApp / Celular" required>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        name="responsavel_telefone"
                        required
                        value={respPhone}
                        onChange={(e) => setRespPhone(maskPhone(e.target.value))}
                        placeholder="(00) 90000-0000"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                ABA 5: MÓDULOS & ADDONS
            ══════════════════════════════════════════════════════════════ */}
            <div
              className={section === 'addons' ? 'space-y-6 animate-in fade-in duration-200' : 'hidden'}
              role="tabpanel"
            >
              {mode === 'create' ? (
                <div className="rounded-2xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-[#2BAADF]/10 border border-[#2BAADF]/20 flex items-center justify-center mx-auto text-[#2BAADF]">
                    <Boxes className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-semibold text-white">
                    Inicialização de Módulos Automática
                  </h4>
                  <p className="text-xs text-gray-400 max-w-lg mx-auto">
                    Ao criar a empresa, o sistema vinculará automaticamente o pacote
                    Foundation (Cadastros) e preparará os addons contratados. Você poderá
                    gerenciar entitlements técnicos e comerciais nesta mesma aba logo após salvar.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#80B828]/10 border border-[#80B828]/20 flex items-center justify-center">
                        <Boxes className="w-4 h-4 text-[#80B828]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Addons & Módulos da Empresa</p>
                        <p className="text-xs text-gray-500">
                          Habilitação técnica de acesso (`enabled`) e parametrização comercial.
                        </p>
                      </div>
                    </div>

                    {canEditAddons && (
                      <button
                        type="button"
                        onClick={handleSaveAddons}
                        disabled={isSavingAddons}
                        className="bg-gradient-to-r from-[#80B828] to-[#5F8A1C] hover:shadow-[0_4px_24px_rgba(128,184,40,0.35)] disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
                      >
                        {isSavingAddons ? (
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Salvar Addons
                      </button>
                    )}
                  </div>

                  {!canEditAddons && (
                    <div className="flex items-center gap-2 text-xs text-amber-500/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>
                        Somente superadministradores da RN3 possuem permissão para alterar entitlements de addons.
                      </span>
                    </div>
                  )}

                  {addonsMessage && (
                    <div className="flex items-center gap-2 text-xs text-[#80B828] bg-[#80B828]/10 border border-[#80B828]/20 rounded-xl px-3 py-2.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{addonsMessage}</span>
                    </div>
                  )}

                  {addonsError && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{addonsError}</span>
                    </div>
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
                                disabled={!canEditAddons || isFoundation || isSavingAddons}
                                onChange={(e) =>
                                  handleUpdateDraft(draft.addon_codigo, {
                                    enabled: e.target.checked,
                                  })
                                }
                                className="rounded border-[#ffffff30] bg-transparent text-[#80B828] focus:ring-[#80B828]/40 h-4 w-4"
                              />
                              <span className="min-w-0">
                                <span className="text-sm font-medium text-white block truncate">
                                  {meta.nome}
                                  <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-500 font-mono">
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
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-800 text-gray-400 border border-gray-700">
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
                                  handleUpdateDraft(draft.addon_codigo, { open: !draft.open })
                                }
                                className="p-1 rounded-lg hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors"
                                aria-label="Detalhes comerciais"
                              >
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform ${
                                    draft.open ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {draft.open && (
                            <div className="border-t border-[#ffffff0a] bg-[#050505] p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              <Field label="Status Comercial">
                                <select
                                  disabled={!canEditAddons || isSavingAddons}
                                  value={draft.commercial_status}
                                  onChange={(e) =>
                                    handleUpdateDraft(draft.addon_codigo, {
                                      commercial_status: e.target.value as CommercialStatus,
                                    })
                                  }
                                  className={`${inputCls} text-xs py-2`}
                                >
                                  {COMMERCIAL_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>

                              <Field label="Plano">
                                <input
                                  type="text"
                                  disabled={!canEditAddons || isSavingAddons}
                                  value={draft.plano}
                                  onChange={(e) =>
                                    handleUpdateDraft(draft.addon_codigo, {
                                      plano: e.target.value,
                                    })
                                  }
                                  placeholder="Ex: pro, enterprise"
                                  className={`${inputCls} text-xs py-2`}
                                />
                              </Field>

                              <Field label="Quantidade">
                                <input
                                  type="number"
                                  min={1}
                                  disabled={!canEditAddons || isSavingAddons}
                                  value={draft.quantity}
                                  onChange={(e) =>
                                    handleUpdateDraft(draft.addon_codigo, {
                                      quantity: Math.max(1, Number(e.target.value) || 1),
                                    })
                                  }
                                  className={`${inputCls} text-xs py-2`}
                                />
                              </Field>

                              <Field label="Preço Diferenciado (R$)">
                                <input
                                  type="text"
                                  disabled={!canEditAddons || isSavingAddons}
                                  value={draft.price_override}
                                  onChange={(e) =>
                                    handleUpdateDraft(draft.addon_codigo, {
                                      price_override: e.target.value,
                                    })
                                  }
                                  placeholder="0,00 (vazio = padrão catálogo)"
                                  className={`${inputCls} text-xs py-2`}
                                />
                              </Field>

                              <Field label="Início da Vigência">
                                <input
                                  type="datetime-local"
                                  disabled={!canEditAddons || isSavingAddons}
                                  value={draft.starts_at}
                                  onChange={(e) =>
                                    handleUpdateDraft(draft.addon_codigo, {
                                      starts_at: e.target.value,
                                    })
                                  }
                                  className={`${inputCls} text-xs py-2`}
                                />
                              </Field>

                              <Field label="Fim da Vigência">
                                <input
                                  type="datetime-local"
                                  disabled={!canEditAddons || isSavingAddons}
                                  value={draft.ends_at}
                                  onChange={(e) =>
                                    handleUpdateDraft(draft.addon_codigo, {
                                      ends_at: e.target.value,
                                    })
                                  }
                                  className={`${inputCls} text-xs py-2`}
                                />
                              </Field>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════════
                ABA 6: CÉREBRO IA (ANTIGRAVITY)
            ══════════════════════════════════════════════════════════════ */}
            <div
              className={section === 'ia' ? 'space-y-6 animate-in fade-in duration-200' : 'hidden'}
              role="tabpanel"
            >
              {/* Bloco 5.1: Parametrização do Modelo e Timeout */}
              <div className="rounded-2xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-5 space-y-4 relative overflow-hidden">
                <div
                  className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.06] pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)',
                    filter: 'blur(30px)',
                  }}
                />

                <SectionHeader
                  icon={Sparkles}
                  title="Motor de Inteligência Artificial"
                  subtitle="Configuração do modelo neural e tempos operacionais de transbordo humano"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Modelo de IA">
                    <div className="relative">
                      <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <select
                        name="ai_model"
                        defaultValue={resolvedDefaultModel}
                        className={`${inputCls} pl-10 appearance-none bg-[#0A0A0A]`}
                      >
                        {AI_MODELS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>

                  <Field label="Tempo de Silêncio IA (minutos)">
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="number"
                        name="ia_silence_timeout"
                        defaultValue={empresa?.ia_silence_timeout ?? 60}
                        placeholder="60"
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </Field>
                </div>
              </div>

              {/* Bloco 5.2: Persona e Contexto Corporativo */}
              <div className="rounded-2xl border border-[#ffffff0a] bg-[#0A0A0A]/40 p-5 space-y-4">
                <SectionHeader
                  icon={Sparkles}
                  title="Contexto e Persona Corporativa"
                  subtitle="Instruções permanentes injetadas no agente de atendimento desta organização"
                />

                <div>
                  <Field label="Prompt de Contexto da Empresa">
                    <textarea
                      name="ai_context_prompt"
                      rows={6}
                      defaultValue={empresa?.ai_context_prompt ?? ''}
                      placeholder="Ex: Você é o assistente virtual oficial da Acme Soluções. Nossos horários de atendimento são de segunda a sexta, das 8h às 18h. Nosso tom deve ser profissional, direto e acolhedor..."
                      className={`${inputCls} resize-none`}
                    />
                  </Field>
                  <p className="mt-2 text-xs text-gray-500">
                    Estas diretrizes orientam o agente em todas as conversas do Omni/IA e funis automáticos.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              RODAPÉ UNIFICADO (MESMO DESIGN DO SKUFORM)
          ══════════════════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-3 border-t border-[#ffffff0a] bg-[#0A0A0A] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="order-2 sm:order-1 flex items-center gap-4 flex-wrap">
              {mode === 'edit' && deleteAction && (
                <div>
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500/70 hover:text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir Empresa
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span className="text-xs font-semibold text-red-500">Apagar tudo?</span>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isPending}
                        className="bg-red-500 hover:bg-red-600 text-white text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isPending ? '...' : 'Sim, Excluir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="text-gray-400 hover:text-white text-[10px] uppercase tracking-wider font-bold px-1"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-500">
                {mode === 'create' ? 'Nova Empresa' : 'Editando Empresa'} · {sectionMeta.label}
              </p>
            </div>

            <div className="order-1 sm:order-2 flex items-center justify-end gap-2.5">
              <Link
                href={cancelHref}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#ffffff12] px-4 text-sm font-medium text-gray-300 transition-colors hover:border-[#ffffff20] hover:bg-[#ffffff08] hover:text-white"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 text-sm font-semibold text-white shadow-[0_2px_12px_rgba(43,170,223,0.25)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {mode === 'create' ? 'Cadastrar Empresa' : 'Salvar Alterações'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}

export { EmpresaForm }
