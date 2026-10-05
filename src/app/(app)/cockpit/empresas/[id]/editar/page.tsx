import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { notFound } from "next/navigation"
import { Building2 } from "lucide-react"
import BackButton from '@/components/BackButton'
import EmpresaForm from "@/components/empresas/EmpresaForm"
import { getMyProfile } from "@/lib/auth/getMyProfile"
import {
  ensureEmpresaAddonRows,
  getEmpresaAddonLines,
} from "@/lib/addons/entitlements"
import {
  updateEmpresa,
  deleteEmpresa,
  updateEmpresaStatus,
} from "@/app/(app)/cockpit/actions"

export const metadata = { title: 'Editar Empresa | HuginFlow' }

export default async function EditarEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const me = await getMyProfile()
  const canEditAddons = me?.role_global === 'superadmin'
  const admin = canEditAddons ? createAdminClient() : null

  const { data: empresa, error } = await supabase
    .from("empresas")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !empresa) notFound()

  // SKU novo no registry aparece na ficha sem deploy de React (ensure + list dinâmico)
  if (admin) {
    await ensureEmpresaAddonRows(id, admin, me?.id ?? null)
  }

  const addonLines = await getEmpresaAddonLines(id, admin ?? undefined)

  async function handleUpdate(formData: FormData) {
    'use server'
    return updateEmpresa(id, formData)
  }

  async function handleDelete() {
    'use server'
    return deleteEmpresa(id)
  }

  async function handleToggleStatus(novoStatus: boolean) {
    'use server'
    return updateEmpresaStatus(id, novoStatus)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Header Externo Padronizado */}
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/empresas" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Building2 className="w-6 h-6 text-[#2BAADF]" />
            Editar Empresa: {empresa.nome}
          </h2>
          <p className="text-sm text-gray-400 mt-1 font-medium">
            {empresa.cnpj ? `CNPJ: ${empresa.cnpj}` : 'Sem CNPJ'} · {empresa.cidade || 'Sede'} · {empresa.ramo_atividade || 'Cadastro corporativo'}
          </p>
        </div>
      </div>

      {/* Formulário Unificado com Abas e Blocos de Afinidade */}
      <EmpresaForm
        mode="edit"
        empresa={empresa}
        addonLines={addonLines}
        canEditAddons={canEditAddons}
        cancelHref="/cockpit/empresas"
        action={handleUpdate}
        deleteAction={handleDelete}
        toggleStatusAction={handleToggleStatus}
      />
    </div>
  )
}
