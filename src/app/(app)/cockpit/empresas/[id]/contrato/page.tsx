import { redirect } from 'next/navigation'
import { getEmpresaContratoPayload } from '@/lib/contratos/getEmpresaContrato'
import ContractViewer from './ContractViewer'

export const metadata = {
  title: 'Gerar Contrato MSA | Ragnar',
}

export default async function EmpresaContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ contrato?: string }>
}) {
  const { id } = await params
  const { contrato: contratoId } = await searchParams
  const result = await getEmpresaContratoPayload(id, contratoId)

  if (!result.ok) {
    if (result.status === 403) redirect('/cockpit/acesso-negado')
    redirect('/cockpit/empresas')
  }

  return (
    <ContractViewer
      empresaId={result.empresaId}
      empresaNome={result.empresaNome}
      missingFields={result.missingFields}
      html={result.html}
    />
  )
}
