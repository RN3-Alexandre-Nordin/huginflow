import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { cnpjWebhookSlug } from '@/lib/omnichannel/empresa-webhook-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function extractSecret(request: Request): string | null {
  const headerSecret = request.headers.get('x-huginflow-secret')?.trim()
  if (headerSecret) return headerSecret
  const auth = request.headers.get('authorization') ?? ''
  const bearer = auth.match(/^Bearer\s+(.+)$/i)
  return bearer?.[1]?.trim() || null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cnpj: string }> },
) {
  const { cnpj: raw } = await params
  const cnpj = cnpjWebhookSlug(raw)
  if (!cnpj) {
    return NextResponse.json({ error: 'CNPJ inválido na URL' }, { status: 400 })
  }

  const secret = extractSecret(request)
  if (!secret) {
    return NextResponse.json(
      { error: 'Informe o secret no header X-HuginFlow-Secret ou Authorization: Bearer' },
      { status: 401 },
    )
  }

  const admin = createAdminClient()
  const { data: hook } = await admin
    .from('empresa_webhooks')
    .select('id, secret, ativo, url, empresa_id')
    .like('url', `%/api/webhooks/empresa/${cnpj}`)
    .maybeSingle()

  if (!hook || hook.secret !== secret) {
    return NextResponse.json({ error: 'Secret inválido' }, { status: 401 })
  }
  if (!hook.ativo) {
    return NextResponse.json({ error: 'Webhook pausado' }, { status: 403 })
  }

  const { data: deliveries } = await admin
    .from('empresa_webhook_deliveries')
    .select('id, event, payload, success, created_at')
    .eq('empresa_id', hook.empresa_id)
    .eq('webhook_id', hook.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    empresa_id: hook.empresa_id,
    cnpj,
    url: hook.url,
    events: deliveries ?? [],
  })
}
