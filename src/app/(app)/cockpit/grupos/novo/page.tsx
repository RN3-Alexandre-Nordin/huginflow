'use client'

import { useTransition, useEffect, useState } from "react"
import { createGrupoAcesso } from "@/app/(app)/cockpit/actions"
import Link from "next/link"
import { ShieldCheck, Building2, AlignLeft, Info } from "lucide-react"
import { BackButton } from '@/components/BackButton'
import { createClient } from "@/utils/supabase/client"
import SearchableSelect from "@/components/SearchableSelect"
import PermissionsMatrix from "../PermissionsMatrix"

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

export default function NovoGrupoAcessoPage() {
  const [isPending, startTransition] = useTransition()
  const [empresas, setEmpresas] = useState<any[]>([])
  const [selectedEmpresa, setSelectedEmpresa] = useState("")
  const [loading, setLoading] = useState(true)
  const [permissoes, setPermissoes] = useState<Record<string, string[]>>({})
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    async function loadInitialData() {
      const supabase = createClient()
      
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: userData } = await supabase
        .from('usuarios')
        .select('role_global')
        .eq('auth_user_id', authUser?.id ?? '')
        .single()
      const superAdmin = userData?.role_global === 'superadmin'
      setIsSuperAdmin(superAdmin)

      if (superAdmin) {
        const { data } = await supabase.from('empresas').select('id, nome').eq('ativo', true).order('nome')
        if (data) setEmpresas(data)
      }
      
      setLoading(false)
    }
    loadInitialData()
  }, [])

  const handleSubmit = (formData: FormData) => {
    setErrorMsg(null)
    // Append JSONB permissions and isAdmin flag
    formData.append('permissoes', JSON.stringify(permissoes))
    formData.append('is_admin', isAdmin ? 'true' : 'false')
    
    startTransition(async () => {
      const result = await createGrupoAcesso(formData)
      if (result?.error) {
        setErrorMsg(result.error)
      }
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/grupos" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-[#2BAADF]" />
            Novo Grupo de Acesso
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Defina um conjunto de permissões para atribuir a múltiplos usuários da empresa.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-8">
        {/* Dados Básicos */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
               style={{ background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)', filter: 'blur(30px)' }} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {isSuperAdmin && (
              <Field label="Vincular à Empresa" required>
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

            <div className={!isSuperAdmin ? "md:col-span-2" : ""}>
              <Field label="Nome do Grupo" required>
                <input 
                  type="text" 
                  name="nome" 
                  required 
                  placeholder="Ex: Comercial, Financeiro, Admin Empresa..." 
                  className={inputCls} 
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Descrição Interna">
                <div className="relative">
                  <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                  <textarea 
                    name="descricao" 
                    placeholder="Para que serve este grupo? Quais usuários ele abrange?" 
                    rows={3}
                    className={`${inputCls} pl-10 resize-none`} 
                  />
                </div>
              </Field>
            </div>

            <div className="md:col-span-2 pt-2 pb-4">
              <label className="flex items-center gap-3 cursor-pointer group w-fit">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-[#ffffff05] peer-focus:outline-none rounded-full peer border border-[#ffffff12] peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-500 peer-checked:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2BAADF] transition-all"></div>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white group-hover:text-[#2BAADF] transition-colors">Grupo de Administradores?</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-tight">Ative se os usuários deste grupo tiverem poderes administrativos na empresa</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Matriz de Permissões */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6">
          <PermissionsMatrix value={permissoes} onChange={setPermissoes} disabled={isAdmin} />
        </div>

        {/* Tip/Info Box */}
        <div className="bg-[#2BAADF]/5 border border-[#2BAADF]/10 rounded-xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-[#2BAADF] mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-300">Dica de Segurança:</strong> Recomendamos o princípio do acesso mínimo. Garanta apenas o que for estritamente necessário para a função de cada usuário.
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium animate-in fade-in flex items-center gap-2">
            <Info className="w-5 h-5 flex-shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#ffffff0a]">
          <p className="text-xs text-gray-600">
            <span className="text-[#2BAADF]">*</span> Campos obrigatórios
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/cockpit/grupos"
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-[#ffffff0a] transition-all"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isPending || loading}
              className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando Grupo...
                </>
              ) : (
                "Criar Grupo de Acesso"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
