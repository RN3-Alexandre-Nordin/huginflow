import { NextResponse } from 'next/server'
import { getOmniMensagens } from '@/app/(app)/cockpit/crm/omni-chat-actions'

/** Leitura do Omni fora da fila de server actions (que é sequencial por aba). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessaoId: string }> },
) {
  const { sessaoId } = await params
  const result = await getOmniMensagens(sessaoId)
  const status = result.error === 'Não autenticado' ? 401 : 200
  return NextResponse.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
}
