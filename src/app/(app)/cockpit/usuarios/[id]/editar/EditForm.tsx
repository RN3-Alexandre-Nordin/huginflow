'use client'

import { useTransition, useState, useEffect } from "react"
import { updateUsuario, deleteUsuario, setUsuarioAtivo, getGruposByEmpresa } from "@/app/(app)/cockpit/actions"
import Link from "next/link"
import { Users, Building2, Shield, User as UserIcon, Save, Trash2, ShieldAlert, Phone, Hash, MapPin, Calendar, KeyRound, Eye, EyeOff, UserX, UserCheck } from "lucide-react"
import { BackButton } from '@/components/BackButton'
import { maskPhone } from "@/utils/brasilian-formatters"
import SearchableSelect from "@/components/SearchableSelect"

interface UserProfile {
  id: string
  auth_user_id: string
  nome_completo: string | null
  email: string | null
  role_global: string
  grupo_id: string | null
  empresa_id: string
  is_superuser: boolean
  ativo?: boolean | null
  telefone: string | null
  ramal: string | null
  endereco: string | null
  data_nascimento: string | null
  empresas?: { id: string, nome: string }
}

interface EditFormProps {
  user: UserProfile
  companies: { id: string, nome: string }[]
  groups: { id: string, nome: string }[]
  isSuperAdmin: boolean
  currentUserIsSuperuser: boolean
  cardsAsResponsavel: number
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

export default function EditForm({
  user,
  companies,
  groups: initialGroups,
  isSuperAdmin,
  currentUserIsSuperuser,
  cardsAsResponsavel,
}: EditFormProps) {
  const [isPending, startTransition] = useTransition()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showInactivateConfirm, setShowInactivateConfirm] = useState(false)
  const [selectedEmpresa, setSelectedEmpresa] = useState(user.empresa_id)
  const [isAtivo, setIsAtivo] = useState(user.ativo !== false)
  const canHardDelete = cardsAsResponsavel === 0
  const [selectedGrupoId, setSelectedGrupoId] = useState(user.grupo_id || "")
  const [groups, setGroups] = useState(initialGroups)
  const [telefone, setTelefone] = useState(user.telefone || "")
  const [novaSenha, setNovaSenha] = useState("")
  const [confirmarSenha, setConfirmarSenha] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [senhaError, setSenhaError] = useState("")
  const [formError, setFormError] = useState("")

  // Load groups whenever empresa changes (if superadmin)
  useEffect(() => {
    if (isSuperAdmin && selectedEmpresa !== user.empresa_id) {
      async function loadGroups() {
        const data = await getGruposByEmpresa(selectedEmpresa)
        if (data) setGroups(data)
      }
      loadGroups()
    } else if (selectedEmpresa === user.empresa_id) {
      setGroups(initialGroups)
    }
  }, [selectedEmpresa, isSuperAdmin, user.empresa_id, initialGroups])

  const handleSubmit = (formData: FormData) => {
    setFormError("")
    if (novaSenha || confirmarSenha) {
      if (novaSenha !== confirmarSenha) {
        setSenhaError("As senhas não coincidem.")
        return
      }
      if (novaSenha.length < 6) {
        setSenhaError("A senha deve ter no mínimo 6 caracteres.")
        return
      }
    }
    setSenhaError("")
    startTransition(async () => {
      const result = await updateUsuario(user.id, formData)
      if (result?.error) setFormError(result.error)
    })
  }

  const handleDelete = () => {
    setFormError("")
    startTransition(async () => {
      const result = await deleteUsuario(user.id, user.auth_user_id)
      if (result?.error) {
        setFormError(result.error)
        setShowDeleteConfirm(false)
      }
    })
  }

  const handleToggleAtivo = () => {
    setFormError("")
    const next = !isAtivo
    startTransition(async () => {
      const result = await setUsuarioAtivo(user.id, next)
      if (result?.error) {
        setFormError(result.error)
        setShowInactivateConfirm(false)
        return
      }
      setIsAtivo(next)
      setShowInactivateConfirm(false)
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/usuarios" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-[#2BAADF]" />
            Configurar Perfil
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            E-mail: <span className="text-white/80">{user.email}</span>
            <span
              className={`ml-3 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                isAtivo
                  ? 'bg-[#80B828]/15 text-[#80B828] border border-[#80B828]/25'
                  : 'bg-red-500/15 text-red-400 border border-red-500/25'
              }`}
            >
              {isAtivo ? 'Ativo' : 'Inativo'}
            </span>
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-6">
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-6 relative shadow-xl">
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04]"
                 style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
          </div>
          
          <div className="grid grid-cols-1 gap-5">
            {isSuperAdmin && (
              <Field label="Empresa (Tenant)" required>
                <SearchableSelect
                  name="empresa_id"
                  required
                  icon={Building2}
                  options={companies}
                  value={selectedEmpresa}
                  onChange={setSelectedEmpresa}
                  placeholder="Pesquisar empresa..."
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
                  defaultValue={user.nome_completo || ""}
                  className={`${inputCls} pl-10`} 
                />
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Level (Role Global)" required>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <select
                    name="role_global"
                    required
                    defaultValue={user.role_global}
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
                  options={groups || []}
                  value={selectedGrupoId}
                  onChange={setSelectedGrupoId}
                  placeholder="Pesquisar grupo..."
                />
              </Field>
            </div>

            {/* Superusuário Toggle — visível apenas para quem já é superuser */}
            {currentUserIsSuperuser && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold text-amber-300">Superusuário RN3</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Apenas RN3</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="hidden"
                      name="is_superuser"
                      value="false"
                    />
                    <input
                      type="checkbox"
                      name="is_superuser"
                      value="true"
                      defaultChecked={user.is_superuser}
                      className="sr-only peer"
                      onChange={(e) => {
                        // Update the hidden input when checkbox changes
                        const hiddenInput = e.currentTarget.previousElementSibling as HTMLInputElement
                        if (hiddenInput) hiddenInput.disabled = e.currentTarget.checked
                      }}
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
                  </label>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Superusuários têm acesso irrestrito a todas as empresas e podem criar novos tenants na plataforma. Use com extrema cautela.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Seção 2: Informações Pessoais ─── */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative">
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute -top-20 -left-20 w-48 h-48 rounded-full opacity-[0.04]"
                 style={{ background: 'radial-gradient(circle, #80B828 0%, transparent 70%)', filter: 'blur(30px)' }} />
          </div>

          <div className="flex flex-col gap-0.5 pb-4 border-b border-[#ffffff08]">
            <p className="text-sm font-semibold text-white">Informações Pessoais</p>
            <p className="text-xs text-gray-500">Dados de contato e identificação do colaborador</p>
          </div>

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
                  defaultValue={user.ramal || ""}
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
                  defaultValue={user.data_nascimento?.slice(0, 10) || ""}
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
                defaultValue={user.endereco || ""}
                placeholder="Rua, número, bairro, cidade – UF"
                className={`${inputCls} pl-10`}
              />
            </div>
          </Field>
        </div>

        {/* ─── Seção 3: Redefinir senha ─── */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative">
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04]"
                 style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
          </div>

          <div className="flex flex-col gap-0.5 pb-4 border-b border-[#ffffff08]">
            <p className="text-sm font-semibold text-white">Redefinir senha de acesso</p>
            <p className="text-xs text-gray-500">Opcional — deixe em branco para manter a senha atual do usuário</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Nova senha">
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="nova_senha"
                  minLength={6}
                  autoComplete="new-password"
                  value={novaSenha}
                  onChange={(e) => { setNovaSenha(e.target.value); setSenhaError(""); setFormError("") }}
                  placeholder="Mínimo 6 caracteres"
                  className={`${inputCls} pl-10 pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <Field label="Confirmar nova senha">
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type={showConfirm ? "text" : "password"}
                  name="confirmar_senha"
                  autoComplete="new-password"
                  value={confirmarSenha}
                  onChange={(e) => { setConfirmarSenha(e.target.value); setSenhaError(""); setFormError("") }}
                  placeholder="Repita a nova senha"
                  className={`${inputCls} pl-10 pr-10 ${senhaError ? 'border-red-500/50 focus:border-red-500' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {senhaError && <p className="text-xs text-red-400 mt-1 flex items-center gap-1">⚠ {senhaError}</p>}
            </Field>
          </div>
        </div>

        {formError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            {formError}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#ffffff0a] gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Com cards: inativar. Sem cards: excluir. Sempre: reativar se inativo. */}
            {!isAtivo ? (
              <button
                type="button"
                onClick={handleToggleAtivo}
                disabled={isPending}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-[#80B828]/90 hover:text-[#80B828] hover:bg-[#80B828]/10 transition-all border border-transparent hover:border-[#80B828]/20 disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4" />
                Reativar usuário
              </button>
            ) : canHardDelete ? (
              !showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500/70 hover:text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir usuário
                </button>
              ) : (
                <div className="flex flex-col gap-2 max-w-md animate-in fade-in slide-in-from-left-2">
                  <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-tight text-red-400">
                        Excluir definitivamente?
                      </p>
                      <p className="text-[11px] text-red-300/80 leading-snug font-medium normal-case tracking-normal">
                        Remove login e perfil. Sem cards como responsável — exclusão permanente.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isPending}
                      className="bg-red-500 hover:bg-red-600 text-white text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
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
                </div>
              )
            ) : !showInactivateConfirm ? (
              <button
                type="button"
                onClick={() => setShowInactivateConfirm(true)}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-all border border-transparent hover:border-orange-500/20"
              >
                <UserX className="w-4 h-4" />
                Inativar usuário
              </button>
            ) : (
              <div className="flex flex-col gap-2 max-w-md animate-in fade-in slide-in-from-left-2">
                <div className="flex items-start gap-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
                  <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-tight text-orange-400">
                      Inativar usuário?
                    </p>
                    <p className="text-[11px] text-orange-300/80 leading-snug font-medium normal-case tracking-normal">
                      Este usuário é responsável por <strong>{cardsAsResponsavel}</strong> card(s).
                      Ele não poderá mais entrar na plataforma; o histórico nos cards permanece.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-1">
                  <button
                    type="button"
                    onClick={handleToggleAtivo}
                    disabled={isPending}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isPending ? '...' : 'Sim, Inativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInactivateConfirm(false)}
                    className="text-gray-400 hover:text-white text-[10px] uppercase tracking-wider font-bold"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
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
                  Salvar Perfil
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
