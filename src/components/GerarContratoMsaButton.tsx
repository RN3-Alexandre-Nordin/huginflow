"use client"

import Link from "next/link"
import { FileText } from "lucide-react"

export default function GerarContratoMsaButton({
  empresaId,
  contratoId,
  disabled,
}: {
  empresaId: string
  contratoId?: string
  disabled?: boolean
}) {
  const href = contratoId
    ? `/cockpit/empresas/${empresaId}/contrato?contrato=${contratoId}`
    : `/cockpit/empresas/${empresaId}/contrato`
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-[#ffffff08] cursor-not-allowed">
        <FileText className="w-4 h-4" />
        Gerar contrato MSA
      </span>
    )
  }

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#ffffff08] hover:bg-[#2BAADF]/15 border border-[#ffffff12] hover:border-[#2BAADF]/40 text-gray-200 hover:text-white transition-all"
    >
      <FileText className="w-4 h-4 text-[#2BAADF]" />
      Gerar contrato MSA
    </Link>
  )
}
