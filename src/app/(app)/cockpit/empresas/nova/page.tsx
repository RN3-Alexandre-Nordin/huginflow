import { getMyProfile } from "@/app/(app)/cockpit/actions"
import { hasPermission } from "@/utils/permissions"
import { Building2, Lock } from "lucide-react"
import { BackButton } from '@/components/BackButton'
import EmpresaForm from "@/components/empresas/EmpresaForm"
import { createEmpresa } from "@/app/(app)/cockpit/actions"

export const metadata = { title: 'Nova Empresa | HuginFlow' }

export default async function NovaEmpresaPage() {
  const profile = await getMyProfile()
  const isSuperadmin = profile?.role_global === 'superadmin'
  const canCreate = hasPermission(profile, 'empresas', 'create')
  const isSuperuser = isSuperadmin || canCreate

  // Access denied screen
  if (!isSuperuser) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Acesso Restrito</h2>
          <p className="text-sm text-gray-400 mt-2">
            Apenas superusuários da RN3 podem cadastrar novas empresas na plataforma.
          </p>
        </div>
        <BackButton
          fallbackHref="/cockpit/empresas"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#2BAADF] hover:underline"
          iconClassName="w-4 h-4"
          label="Voltar para Empresas"
        />
      </div>
    )
  }

  async function handleCreate(formData: FormData) {
    'use server'
    return createEmpresa(formData)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Header Externo Padronizado */}
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/empresas" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Building2 className="w-6 h-6 text-[#2BAADF]" />
            Cadastrar Nova Empresa
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Preencha os dados oficiais corporativos, endereço, representante legal e IA da nova organização.
          </p>
        </div>
      </div>

      {/* Formulário Unificado com Abas e Blocos de Afinidade */}
      <EmpresaForm
        mode="create"
        cancelHref="/cockpit/empresas"
        action={handleCreate}
      />
    </div>
  )
}
