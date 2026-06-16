'use client'

import { updateEmpresa, deleteEmpresa } from "@/app/(app)/cockpit/actions"
import { Building2, User, Phone, Mail, Globe, MapPin, Briefcase, Save, Trash2, AlertTriangle, AlertCircle, Sparkles, ShieldCheck, Cpu, Clock } from "lucide-react"
import { useTransition, useState } from "react"
import { maskCNPJ, maskPhone, maskCPF, validateCNPJ, validateCPF } from "@/utils/brasilian-formatters"
import { TIPOS_SOCIETARIOS, ESTADOS_CIVIS } from "@/constants/empresa-juridico"

const inputCls = "w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30"

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

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label} {required && <span className="text-[#2BAADF]">*</span>}
      </label>
      {children}
    </div>
  )
}

interface Empresa {
  id: string
  nome: string
  tipo_societario?: string | null
  cnpj: string | null
  email: string | null
  telefone: string | null
  website: string | null
  endereco: string | null
  cidade?: string | null
  ramo_atividade: string | null
  responsavel_nome: string | null
  responsavel_cargo: string | null
  responsavel_cpf?: string | null
  responsavel_nacionalidade?: string | null
  responsavel_estado_civil?: string | null
  responsavel_profissao?: string | null
  responsavel_email: string | null
  responsavel_telefone: string | null
  gemini_api_key?: string | null
  ai_context_prompt?: string | null
  ai_model?: string | null
  ia_silence_timeout?: number | null
  ativo: boolean
}

export default function EditForm({ empresa }: { empresa: Empresa }) {
  const [isPending, startTransition] = useTransition()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // States for masks and validation
  const [cnpj, setCnpj] = useState(maskCNPJ(empresa.cnpj ?? ""))
  const [phone, setPhone] = useState(maskPhone(empresa.telefone ?? ""))
  const [respPhone, setRespPhone] = useState(maskPhone(empresa.responsavel_telefone ?? ""))
  const [respCpf, setRespCpf] = useState(maskCPF(empresa.responsavel_cpf ?? ""))
  const [isValidCnpj, setIsValidCnpj] = useState(empresa.cnpj ? validateCNPJ(empresa.cnpj) : true)
  const [isValidCpf, setIsValidCpf] = useState(empresa.responsavel_cpf ? validateCPF(empresa.responsavel_cpf) : true)

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const masked = maskCNPJ(value)
    setCnpj(masked)
    
    const digits = value.replace(/\D/g, "")
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
    const digits = value.replace(/\D/g, "")
    if (digits.length === 11) {
      setIsValidCpf(validateCPF(digits))
    } else {
      setIsValidCpf(true)
    }
  }

  const handleSubmit = (formData: FormData) => {
    startTransition(() => {
      updateEmpresa(empresa.id, formData)
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      await deleteEmpresa(empresa.id)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">

      {/* ─── Seção 1: Dados Corporativos ─── */}
      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
        <SectionHeader icon={Building2} title="Dados Corporativos" subtitle="Informações oficiais para contrato e cadastro" />
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Razão Social" required>
              <input
                type="text" name="nome" required
                defaultValue={empresa.nome ?? ''}
                placeholder="Ex: Acme Soluções Ltda."
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Tipo Societário" required>
            <select
              name="tipo_societario"
              required
              defaultValue={empresa.tipo_societario ?? ''}
              className={`${inputCls} appearance-none bg-[#0A0A0A]`}
            >
              <option value="" disabled>Selecione...</option>
              {TIPOS_SOCIETARIOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="CNPJ" required>
            <div className="relative">
              <input
                type="text" name="cnpj" required
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
            <input
              type="text" name="cidade"
              defaultValue={empresa.cidade ?? ''}
              placeholder="Ex: São Paulo"
              className={inputCls}
            />
          </Field>
          <Field label="Ramo de Atividade">
            <input
              type="text" name="ramo_atividade"
              defaultValue={empresa.ramo_atividade ?? ''}
              placeholder="Ex: Tecnologia, Varejo, Saúde..."
              className={inputCls}
            />
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
              <input
                type="email" name="email"
                defaultValue={empresa.email ?? ''}
                placeholder="contato@empresa.com.br"
                className={`${inputCls} pl-10`}
              />
            </div>
          </Field>
          <Field label="Telefone Geral" required>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text" name="telefone" required
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
              <input
                type="text" name="website"
                defaultValue={empresa.website ?? ''}
                placeholder="www.empresa.com.br"
                className={`${inputCls} pl-10`}
              />
            </div>
          </Field>
          <div className="col-span-2">
            <Field label="Endereço Completo" required>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                <textarea
                  name="endereco" required rows={2}
                  defaultValue={empresa.endereco ?? ''}
                  placeholder="Rua, Número, Bairro, Cidade - Estado, CEP"
                  className={`${inputCls} pl-10 resize-none`}
                />
              </div>
            </Field>
          </div>
        </div>
      </div>

      {/* ─── Seção 3: Responsável ─── */}
      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
        <SectionHeader icon={User} title="Representante Legal" subtitle="Qualificação para contrato MSA (preâmbulo e assinaturas)" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nome Completo" required>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text" name="responsavel_nome" required
                defaultValue={empresa.responsavel_nome ?? ''}
                placeholder="Ex: João da Silva"
                className={`${inputCls} pl-10`}
              />
            </div>
          </Field>
          <Field label="CPF" required>
            <div className="relative">
              <input
                type="text" name="responsavel_cpf" required
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
            <input
              type="text" name="responsavel_nacionalidade" required
              defaultValue={empresa.responsavel_nacionalidade ?? 'brasileiro(a)'}
              placeholder="Ex: brasileiro(a)"
              className={inputCls}
            />
          </Field>
          <Field label="Estado Civil" required>
            <select
              name="responsavel_estado_civil"
              required
              defaultValue={empresa.responsavel_estado_civil ?? ''}
              className={`${inputCls} appearance-none bg-[#0A0A0A]`}
            >
              <option value="" disabled>Selecione...</option>
              {ESTADOS_CIVIS.map((ec) => (
                <option key={ec} value={ec}>{ec.charAt(0).toUpperCase() + ec.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Profissão" required>
            <input
              type="text" name="responsavel_profissao" required
              defaultValue={empresa.responsavel_profissao ?? ''}
              placeholder="Ex: administrador de empresas"
              className={inputCls}
            />
          </Field>
          <Field label="Cargo / Qualidade" required>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text" name="responsavel_cargo" required
                defaultValue={empresa.responsavel_cargo ?? ''}
                placeholder="Ex: Sócio Administrador, CEO..."
                className={`${inputCls} pl-10`}
              />
            </div>
          </Field>
          <Field label="E-mail do Representante" required>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email" name="responsavel_email" required
                defaultValue={empresa.responsavel_email ?? ''}
                placeholder="responsavel@empresa.com.br"
                className={`${inputCls} pl-10`}
              />
            </div>
          </Field>
          <Field label="WhatsApp / Celular" required>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text" name="responsavel_telefone" required
                value={respPhone}
                onChange={(e) => setRespPhone(maskPhone(e.target.value))}
                placeholder="(00) 90000-0000"
                className={`${inputCls} pl-10`}
              />
            </div>
          </Field>
        </div>
      </div>
      {/* ─── Seção 4: Cérebro IA (Gemini) ─── */}
      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.06] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
        
        <div className="flex items-center justify-between">
          <SectionHeader icon={Sparkles} title="Cérebro IA (Gemini)" subtitle="Configure o assistente virtual para esta empresa" />
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 shadow-sm animate-pulse">
             <ShieldCheck className="w-3 h-3 text-[#2BAADF]" />
             <span className="text-[10px] font-black text-[#2BAADF] uppercase tracking-widest">Credenciais Seguras</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Gemini API Key">
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="password" name="gemini_api_key"
                defaultValue={empresa.gemini_api_key ?? ''}
                placeholder="Pressione para colar sua chave secreta..."
                className={`${inputCls} pl-10`}
              />
            </div>
          </Field>

            <Field label="Modelo de IA">
              <div className="relative">
                 <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                 <select 
                    name="ai_model" 
                    defaultValue={empresa.ai_model || 'gemini-2.0-flash-latest'}
                    className={`${inputCls} pl-10 appearance-none bg-[#0A0A0A]`}
                 >
                    <option value="gemini-2.0-flash-latest">Gemini 2.0 Flash</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live (Novo)</option>

                 </select>
              </div>
            </Field>

            <Field label="Tempo de Silêncio IA (min)">
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="number" name="ia_silence_timeout"
                  defaultValue={empresa.ia_silence_timeout ?? 60}
                  placeholder="60"
                  className={`${inputCls} pl-10`}
                />
              </div>
            </Field>

          <div className="col-span-2">
            <Field label="Instruções de Contexto (System Prompt)">
              <textarea
                name="ai_context_prompt" rows={8}
                defaultValue={empresa.ai_context_prompt || 'Você é o assistente virtual inteligente da empresa.\nSua missão é atender os clientes com cordialidade, tirar dúvidas sobre os serviços e ajudar na conversão de novos leads.'}
                placeholder="Defina a personalidade e as regras de negócio da IA..."
                className={`${inputCls} resize-y p-4 min-h-[150px] leading-relaxed italic`}
              />
              <p className="text-[10px] text-gray-600 mt-1 ml-1 font-medium italic">As instruções acima definem o comportamento da IA em todas as interações do WhatsApp/Chat.</p>
            </Field>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-[#ffffff0a]">
        <div className="flex items-center gap-4">
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500/70 hover:text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Empresa
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 animate-in fade-in slide-in-from-left-2 transition-all">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-semibold text-red-500">Tem certeza? Isso apagará todos os dados!</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="bg-red-500 hover:bg-red-600 text-white text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? '...' : 'Sim, Excluir'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="text-gray-400 hover:text-white text-[10px] uppercase tracking-wider font-bold"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-600">
            <span className="text-[#2BAADF]">*</span> Campos obrigatórios
          </p>
          <button
            type="submit"
            disabled={isPending}
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          >
            {isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  )
}
