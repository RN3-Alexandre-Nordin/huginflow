'use client'

import { useTransition, useEffect, useState } from "react"
import { createDepartamento } from "@/app/(app)/cockpit/actions"
import Link from "next/link"
import { LayoutDashboard, Building2, AlignLeft } from "lucide-react"
import { BackButton } from '@/components/BackButton'
import { createClient } from "@/utils/supabase/client"
import SearchableSelect from "@/components/SearchableSelect"

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

const inputCls = "w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#80B828] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#80B828]/30"

export default function NovoDepartamentoPage() {
  const [isPending, startTransition] = useTransition()
  const [empresas, setEmpresas] = useState<any[]>([])
  const [selectedEmpresa, setSelectedEmpresa] = useState("")
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

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

      if (superAdmin) {
        const { data } = await supabase.from('empresas').select('id, nome').eq('ativo', true).order('nome')
        if (data) setEmpresas(data)
      }
      
      if (userData?.empresa_id) {
        setSelectedEmpresa(userData.empresa_id)
      }
      
      setLoading(false)
    }
    loadInitialData()
  }, [])

  const handleSubmit = (formData: FormData) => {
    startTransition(() => {
      createDepartamento(formData)
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/departamentos" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <LayoutDashboard className="w-6 h-6 text-[#80B828]" />
            Novo Departamento
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Crie uma nova unidade de negócio para organizar seus fluxos de trabalho.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-6">
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-6 relative shadow-xl">
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04]"
                 style={{ background: 'radial-gradient(circle, #80B828 0%, transparent 70%)', filter: 'blur(30px)' }} />
          </div>
          
          <div className="grid grid-cols-1 gap-5">
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

            <Field label="Nome do Departamento" required>
              <input 
                type="text" 
                name="nome" 
                required 
                placeholder="Ex: Comercial, Suporte Técnico, RH..." 
                className={inputCls} 
              />
            </Field>

            <Field label="Descrição Interna">
              <div className="relative">
                <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                <textarea 
                  name="descricao" 
                  placeholder="Explique o propósito deste departamento no ecossistema da empresa." 
                  rows={4}
                  className={`${inputCls} pl-10 resize-none`} 
                />
              </div>
            </Field>
          </div>
        </div>

        {/* Footer de Ações */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-600">
            <span className="text-[#2BAADF]">*</span> Campos obrigatórios
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/cockpit/departamentos"
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-[#ffffff0a] transition-all"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isPending || loading}
              className="bg-gradient-to-r from-[#80B828] to-[#5A8F1A] hover:shadow-[0_4px_24px_rgba(128,184,40,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                "Criar Departamento"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
