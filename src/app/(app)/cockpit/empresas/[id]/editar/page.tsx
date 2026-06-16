import { createClient } from "@/utils/supabase/server"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  Building2, ArrowLeft, User, Phone, Mail, Globe, MapPin, Briefcase
} from "lucide-react"
import StatusToggle from "../StatusToggle"
import EditForm from "./EditForm"

export default async function EditarEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: empresa, error } = await supabase
    .from("empresas")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !empresa) notFound()

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
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
              Editar: {empresa.nome}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Atualize os dados cadastrais e o status de acesso da empresa.
            </p>
          </div>
        </div>
      </div>

      {/* Toggle de status — sempre visível no topo */}
      <StatusToggle empresa={empresa} />

      {/* Formulário de edição pré-preenchido */}
      <EditForm empresa={empresa} />
    </div>
  )
}
