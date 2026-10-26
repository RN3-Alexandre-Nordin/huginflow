import { NextResponse } from 'next/server'
import { getOmniConversas } from '@/app/(app)/cockpit/crm/omni-chat-actions'

/** Leitura do Omni fora da fila de server actions (que é sequencial por aba). */
export async function GET() {
  const result = await getOmniConversas()
  const status = result.error === 'Não autenticado' ? 401 : 200
  return NextResponse.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
}
