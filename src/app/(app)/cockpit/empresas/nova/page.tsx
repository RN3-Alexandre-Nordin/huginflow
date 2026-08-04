'use client'

import { useTransition, useState, useEffect } from "react"
import { createEmpresa, getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"
import { maskCNPJ, maskPhone, maskCPF, validateCNPJ, validateCPF } from "@/utils/brasilian-formatters"
import { TIPOS_SOCIETARIOS, ESTADOS_CIVIS } from "@/constants/empresa-juridico"
import Link from "next/link"
import { Building2, ArrowLeft, User, Phone, Mail, Globe, MapPin, Briefcase, AlertCircle, Lock } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import EmpresaAiConfigFields from "@/components/empresas/EmpresaAiConfigFields"

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-[#ffffff08]">
      <div className="w-8 h-8 rounded-lg bg-[#2BAADF]/10 border border-[#2BAADF]/20 flex items-center justify-center">
        <Icon className="w-4 h-4 text-[#2BAADF]" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label} {required && <span className="text-[#2BAADF]">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = "w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30"

export default function NovaEmpresaPage() {
  const [isPending, startTransition] = useTransition()
  const [isSuperuser, setIsSuperuser] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  // States for masks and validation
  const [cnpj, setCnpj] = useState("")
  const [phone, setPhone] = useState("")
  const [respPhone, setRespPhone] = useState("")
  const [respCpf, setRespCpf] = useState("")
  const [isValidCnpj, setIsValidCnpj] = useState(true)
  const [isValidCpf, setIsValidCpf] = useState(true)

  useEffect(() => {
    async function checkAccess() {
      const profile = await getMyProfile()
      const isSuperadmin = profile?.role_global === 'superadmin'
      const canCreate = hasPermission(profile, 'empresas', 'create')
      setIsSuperuser(isSuperadmin || canCreate)
    }
    checkAccess()
  }, [])

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const masked = maskCNPJ(value)
    setCnpj(masked)
    
    // Validate only when full length is typed
    const digits = value.replace(/\D/g, "")
    if (digits.length === 14) {
      setIsValidCnpj(validateCNPJ(digits))
    } else {
      setIsValidCnpj(true) // Reset while typing
    }
  }

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const masked = maskCPF(value)
    setRespCpf(masked)
    const digits = value.replace(/\D/g, "")
    if (digits.length === 11) {
      setIsValidCpf(validateCPF(digits))
    } else {
      setIsValidCpf(true)
    }
  }

  const handleSubmit = (formData: FormData) => {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await createEmpresa(formData)
      if (result?.error) {
        setErrorMsg(result.error)
      }
    })
  }

  // Loading state while checking permissions
  if (isSuperuser === null) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-6 h-6 border-2 border-[#2BAADF]/30 border-t-[#2BAADF] rounded-full animate-spin" />
      </div>
    )
  }

  // Access denied screen
  if (!isSuperuser) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Acesso Restrito</h2>
          <p className="text-sm text-gray-400 mt-2">Apenas superusuários da RN3 podem cadastrar novas empresas na plataforma.</p>
        </div>
        <Link
          href="/cockpit/empresas"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#2BAADF] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Empresas
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/cockpit/empresas"
          className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Building2 className="w-6 h-6 text-[#2BAADF]" />
            Cadastrar Nova Empresa
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Preencha os dados do novo cliente/tenant para ativá-lo no sistema HuginFlow.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {/* ─── Seção 1: Dados Corporativos ─── */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
               style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
          <SectionHeader icon={Building2} title="Dados Corporativos" subtitle="Informações oficiais para contrato e cadastro" />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Razão Social" required>
                <input type="text" name="nome" required placeholder="Ex: Acme Soluções Ltda." className={inputCls} />
              </Field>
            </div>
            <Field label="Tipo Societário" required>
              <select name="tipo_societario" required defaultValue="" className={`${inputCls} appearance-none bg-[#0A0A0A]`}>
                <option value="" disabled>Selecione...</option>
                {TIPOS_SOCIETARIOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
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
                  className={`${inputCls} font-mono tracking-wider ${!isValidCnpj ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`} 
                />
                {!isValidCnpj && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-red-500 animate-in fade-in zoom-in duration-200">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Inválido</span>
                  </div>
                )}
              </div>
            </Field>
            <Field label="Cidade (sede)">
              <input type="text" name="cidade" placeholder="Ex: São Paulo" className={inputCls} />
            </Field>
            <Field label="Ramo de Atividade">
              <input type="text" name="ramo_atividade" placeholder="Ex: Tecnologia, Varejo, Saúde..." className={inputCls} />
            </Field>
          </div>
        </div>

        {/* ─── Seção 2: Contato da Empresa ─── */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
               style={{ background: 'radial-gradient(circle, #80B828 0%, transparent 70%)', filter: 'blur(30px)' }} />
          <SectionHeader icon={Phone} title="Contato da Empresa" subtitle="Canais de comunicação corporativos" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="E-mail Corporativo">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="email" name="email" placeholder="contato@empresa.com.br" className={`${inputCls} pl-10`} />
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
            <Field label="Website">
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" name="website" placeholder="www.empresa.com.br" className={`${inputCls} pl-10`} />
              </div>
            </Field>
            <div className="col-span-2">
              <Field label="Endereço Completo" required>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                  <textarea name="endereco" required placeholder="Rua, Número, Bairro, Cidade - Estado, CEP" rows={2}
                    className={`${inputCls} pl-10 resize-none`} />
                </div>
              </Field>
            </div>
          </div>
        </div>

        {/* ─── Seção 3: Responsável / Ponto de Contato RN3 ─── */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
               style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
          <SectionHeader icon={User} title="Representante Legal" subtitle="Qualificação para contrato MSA (preâmbulo e assinaturas)" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome Completo" required>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" name="responsavel_nome" required placeholder="Ex: João da Silva" className={`${inputCls} pl-10`} />
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
                  className={`${inputCls} font-mono tracking-wider ${!isValidCpf ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                />
                {!isValidCpf && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Inválido</span>
                  </div>
                )}
              </div>
            </Field>
            <Field label="Nacionalidade" required>
              <input type="text" name="responsavel_nacionalidade" required defaultValue="brasileiro(a)" placeholder="Ex: brasileiro(a)" className={inputCls} />
            </Field>
            <Field label="Estado Civil" required>
              <select name="responsavel_estado_civil" required defaultValue="" className={`${inputCls} appearance-none bg-[#0A0A0A]`}>
                <option value="" disabled>Selecione...</option>
                {ESTADOS_CIVIS.map((ec) => (
                  <option key={ec} value={ec}>{ec.charAt(0).toUpperCase() + ec.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="Profissão" required>
              <input type="text" name="responsavel_profissao" required placeholder="Ex: administrador de empresas" className={inputCls} />
            </Field>
            <Field label="Cargo / Qualidade" required>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" name="responsavel_cargo" required placeholder="Ex: Sócio Administrador, CEO..." className={`${inputCls} pl-10`} />
              </div>
            </Field>
            <Field label="E-mail do Representante" required>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="email" name="responsavel_email" required placeholder="responsavel@empresa.com.br" className={`${inputCls} pl-10`} />
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
 
        <EmpresaAiConfigFields />

        {/* ─── Footer de Ações ─── */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium animate-in fade-in flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-600">
            <span className="text-[#2BAADF]">*</span> Campos obrigatórios
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/cockpit/empresas"
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-[#ffffff0a] transition-all"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isPending}
              className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Cadastrando...
                </>
              ) : (
                "Cadastrar Empresa"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
