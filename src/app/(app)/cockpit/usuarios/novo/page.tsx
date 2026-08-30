'use client'

import { useTransition, useEffect, useState } from "react"
import { createUsuario, getGruposByEmpresa } from "@/app/(app)/cockpit/actions"
import Link from "next/link"
import { Users, ArrowLeft, Building2, Mail, Shield, User as UserIcon, Phone, MapPin, Hash, Calendar, KeyRound, Eye, EyeOff, UserPlus } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import SearchableSelect from "@/components/SearchableSelect"
import { maskPhone } from "@/utils/brasilian-formatters"

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label} {required && <span className="text-[#2BAADF]">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-gray-600 italic mt-0.5">{hint}</p>}
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-0.5 pb-4 border-b border-[#ffffff08]">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
  )
}

const inputCls = "w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30 shadow-inner"

export default function NovoUsuarioPage() {
  const [isPending, startTransition] = useTransition()
  const [empresas, setEmpresas] = useState<any[]>([])
  const [grupos, setGrupos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [selectedEmpresa, setSelectedEmpresa] = useState("")
  const [selectedGrupoId, setSelectedGrupoId] = useState("")
  const [telefone, setTelefone] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [senha, setSenha] = useState("")
  const [senhaConfirm, setSenhaConfirm] = useState("")
  const [senhaError, setSenhaError] = useState("")
  const [formError, setFormError] = useState("")

  useEffect(() => {
    async function loadInitialData() {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: userData } = await supabase
        .from('usuarios')
        .select('role_global, empresa_id')
        .eq('auth_user_id', authUser?.id ?? '')
        .single()
      const superAdmin = userData?.role_global === 'superadmin'
      setIsSuperAdmin(superAdmin)

      // Sempre pré-seleciona a empresa do usuário logado
      if (userData?.empresa_id) {
        setSelectedEmpresa(userData.empresa_id)
      }

      if (superAdmin) {
        // Busca todas as empresas para o select do superadmin
        const { data } = await supabase.from('empresas').select('id, nome').eq('ativo', true).order('nome')
        if (data) setEmpresas(data)
      }
      // Para não-superadmin: hidden input já usa selectedEmpresa, não precisa carregar a lista
      
      setLoading(false)
    }
    loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedEmpresa) {
      async function loadGroups() {
        const data = await getGruposByEmpresa(selectedEmpresa)
        if (data) setGrupos(data)
      }
      loadGroups()
    } else {
      setGrupos([])
    }
  }, [selectedEmpresa])

  const handleSubmit = (formData: FormData) => {
    if (senha !== senhaConfirm) {
      setSenhaError("As senhas não coincidem.")
      return
    }
    if (senha.length < 6) {
      setSenhaError("A senha deve ter no mínimo 6 caracteres.")
      return
    }
    setSenhaError("")
    setFormError("")
    startTransition(async () => {
      const result = await createUsuario(formData)
      if (result?.error) {
        setFormError(result.error)
      }
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/cockpit/usuarios"
          className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <UserPlus className="w-6 h-6 text-[#2BAADF]" />
            Novo Usuário
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            O usuário poderá fazer login imediatamente após o cadastro.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-5" autoComplete="off">
        {/* ─── Seção 1: Acesso ─── */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative shadow-xl">
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04]"
                 style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
          </div>
          
          <SectionHeader title="Dados de Acesso" subtitle="Login, senha e permissões do usuário na plataforma" />

          <div className="grid grid-cols-1 gap-5">
            {isSuperAdmin && (
              <Field label="Empresa do Usuário" required>
                <SearchableSelect
                  name="empresa_id"
                  required
                  icon={Building2}
                  options={empresas}
                  value={selectedEmpresa}
                  onChange={setSelectedEmpresa}
                  placeholder="Pesquisar empresa..."
                  disabled={loading}
                />
              </Field>
            )}
            
            {!isSuperAdmin && <input type="hidden" name="empresa_id" value={selectedEmpresa} />}

            <Field label="Nome Completo" required>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="text" 
                  name="nome_completo" 
                  required 
                  autoComplete="off"
                  placeholder="Ex: Alexandre Nordin" 
                  className={`${inputCls} pl-10`} 
                />
              </div>
            </Field>

            <Field label="E-mail (Login)" required hint="Pode ser um e-mail interno ou simplificado — é usado apenas para login">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="email" 
                  name="email" 
                  required 
                  autoComplete="off"
                  placeholder="usuario@empresa.com" 
                  className={`${inputCls} pl-10`} 
                />
              </div>
            </Field>

            {/* Senha e Confirmação */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Senha de Acesso" required>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="senha"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={senha}
                    onChange={(e) => { setSenha(e.target.value); setSenhaError("") }}
                    placeholder="Mínimo 6 caracteres"
                    className={`${inputCls} pl-10 pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>

              <Field label="Confirmar Senha" required>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={senhaConfirm}
                    onChange={(e) => { setSenhaConfirm(e.target.value); setSenhaError("") }}
                    placeholder="Repita a senha"
                    className={`${inputCls} pl-10 pr-10 ${senhaError ? 'border-red-500/50 focus:border-red-500' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {senhaError && <p className="text-xs text-red-400 mt-1 flex items-center gap-1">⚠ {senhaError}</p>}
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Level (Role Global)" required>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <select
                    name="role_global"
                    required
                    className={`${inputCls} pl-10 appearance-none`}
                  >
                    <option value="operador">Operador (Padrão)</option>
                    <option value="admin">Administrador Empresa</option>
                    <option value="visualizador">Apenas Visualização</option>
                    {isSuperAdmin && <option value="superadmin">SuperAdmin (Hugin Flow)</option>}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </div>
                </div>
              </Field>

              <Field label="Grupo de Acesso">
                <SearchableSelect
                  name="grupo_id"
                  icon={Shield}
                  options={grupos}
                  value={selectedGrupoId}
                  onChange={setSelectedGrupoId}
                  placeholder="Pesquisar grupo..."
                  disabled={!selectedEmpresa || grupos.length === 0}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* ─── Seção 2: Informações Pessoais ─── */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative">
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute -top-20 -left-20 w-48 h-48 rounded-full opacity-[0.04]"
                 style={{ background: 'radial-gradient(circle, #80B828 0%, transparent 70%)', filter: 'blur(30px)' }} />
          </div>
          
          <SectionHeader title="Informações Pessoais" subtitle="Dados de contato e identificação do colaborador (opcionais)" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Telefone / WhatsApp">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="tel"
                  name="telefone"
                  value={telefone}
                  onChange={(e) => setTelefone(maskPhone(e.target.value))}
                  placeholder="(11) 98765-4321"
                  maxLength={16}
                  className={`${inputCls} pl-10`}
                />
              </div>
            </Field>

            <Field label="Ramal">
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  name="ramal"
                  placeholder="Ex: 4002"
                  maxLength={10}
                  className={`${inputCls} pl-10`}
                />
              </div>
            </Field>

            <Field label="Data de Nascimento">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  name="data_nascimento"
                  className={`${inputCls} pl-10`}
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </Field>
          </div>

          <Field label="Endereço">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                name="endereco"
                placeholder="Rua, número, bairro, cidade – UF"
                className={`${inputCls} pl-10`}
              />
            </div>
          </Field>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-3 pt-4 border-t border-[#ffffff0a]">
          {formError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {formError}
            </div>
          )}
          <div className="flex items-center justify-between">
          <p className="text-xs text-gray-600">
            <span className="text-[#2BAADF]">*</span> Campos obrigatórios
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/cockpit/usuarios"
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-[#ffffff0a] transition-all"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isPending || (isSuperAdmin && !selectedEmpresa)}
              className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Cadastrando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Cadastrar Usuário
                </>
              )}
            </button>
          </div>
          </div>
        </div>
      </form>
    </div>
  )
}
