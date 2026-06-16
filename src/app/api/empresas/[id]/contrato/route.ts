import { NextResponse } from 'next/server'
import { getEmpresaContratoPayload } from '@/lib/contratos/getEmpresaContrato'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const contratoId = new URL(request.url).searchParams.get('contrato')
  const result = await getEmpresaContratoPayload(id, contratoId)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    empresaId: result.empresaId,
    empresaNome: result.empresaNome,
    missingFields: result.missingFields,
    html: result.html,
  })
}
