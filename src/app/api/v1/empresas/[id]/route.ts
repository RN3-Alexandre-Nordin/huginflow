import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { assertAddonsInternalSecret } from '@/lib/addons/internal-api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Empresa canônica da plataforma (`empresas.id` = tenant Bifrost).
 * Não expõe billing RN3 (`finance_*`) como se fosse addon do cliente.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = assertAddonsInternalSecret(request)
  if (denied) return denied

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'empresa id obrigatório' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('empresas')
    .select('id, nome, cnpj, ativo, status, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
  }

  return NextResponse.json({
    empresa: {
      id: data.id,
      nome: data.nome,
      cnpj: data.cnpj,
      ativo: data.ativo,
      status: data.status,
      created_at: data.created_at,
      /** Alias explícito: tenant Bifrost = empresas.id */
      tenant_id: data.id,
    },
  })
}
