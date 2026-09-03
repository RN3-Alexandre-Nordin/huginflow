'use server'

import { randomUUID } from 'crypto'
import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { revalidatePath } from 'next/cache'
import {
  EMPRESA_WEBHOOK_EVENTS,
  dispatchEmpresaWebhooks,
  generateEmpresaWebhookSecret,
  type EmpresaWebhookEvent,
} from '@/lib/omnichannel/empresa-webhooks'
import {
  buildEmpresaWebhookUrl,
  cnpjWebhookSlug,
  fallbackAppOrigin,
} from '@/lib/omnichannel/empresa-webhook-url'

function canManageWebhooks(me: NonNullable<Awaited<ReturnType<typeof getMyProfile>>>) {
  return hasPermission(me, 'canais', 'edit') || hasPermission(me, 'canais', 'create')
}

function maskSecret(secret: string) {
  if (secret.length <= 8) return '••••'
  return `••••${secret.slice(-4)}`
}

async function resolveWebhookOrigin(): Promise<string> {
  try {
    const h = await headers()
    const host = (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0].trim()
    if (host) {
      const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
      return `${proto}://${host}`
    }
  } catch {
    // fora de request
  }
  return fallbackAppOrigin()
}

async function loadEmpresaCnpj(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: string,
): Promise<string | null> {
  const { data } = await supabase.from('empresas').select('cnpj').eq('id', empresaId).maybeSingle()
  return cnpjWebhookSlug(data?.cnpj)
}

export async function getEmpresaWebhookPreset() {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Não autenticado' as const }
  if (!hasPermission(me, 'canais', 'view')) return { error: 'Sem permissão' as const }

  const supabase = await createClient()
  const cnpj = await loadEmpresaCnpj(supabase, me.empresa_id)
  if (!cnpj) {
    return {
      error: null,
      cnpj: null,
      url: null,
      message: 'Cadastre o CNPJ da empresa para gerar a URL exclusiva do webhook.',
    }
  }

  const url = buildEmpresaWebhookUrl(await resolveWebhookOrigin(), cnpj)
  return { error: null, cnpj, url, message: null }
}

export async function listEmpresaWebhooks() {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Não autenticado', data: [] }
  if (!hasPermission(me, 'canais', 'view')) return { error: 'Sem permissão', data: [] }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('empresa_webhooks')
    .select('id, nome, url, secret, events, ativo, created_at')
    .eq('empresa_id', me.empresa_id)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message, data: [] }

  const cnpj = await loadEmpresaCnpj(supabase, me.empresa_id)
  const canonical = cnpj ? buildEmpresaWebhookUrl(await resolveWebhookOrigin(), cnpj) : null
  if (canonical && (data ?? []).some((row) => row.url !== canonical)) {
    await supabase
      .from('empresa_webhooks')
      .update({ url: canonical, updated_at: new Date().toISOString() })
      .eq('empresa_id', me.empresa_id)
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      nome: row.nome,
      url: canonical ?? row.url,
      secret_hint: maskSecret(row.secret),
      events: row.events ?? [],
      ativo: row.ativo,
      created_at: row.created_at,
    })),
  }
}

export async function listEmpresaWebhookDeliveries(limit = 15) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Não autenticado', data: [] }
  if (!hasPermission(me, 'canais', 'view')) return { error: 'Sem permissão', data: [] }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('empresa_webhook_deliveries')
    .select('id, event, success, status_code, error, created_at, webhook_id')
    .eq('empresa_id', me.empresa_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { error: error.message, data: [] }
  return { data: data ?? [] }
}

export async function createEmpresaWebhook(input: { nome: string; events: string[] }) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { success: false as const, error: 'Não autenticado' }
  if (!canManageWebhooks(me)) return { success: false as const, error: 'Sem permissão para criar webhook' }

  const supabase = await createClient()
  const cnpj = await loadEmpresaCnpj(supabase, me.empresa_id)
  if (!cnpj) {
    return {
      success: false as const,
      error: 'A empresa precisa de um CNPJ válido (14 dígitos) para gerar a URL do webhook.',
    }
  }

  const url = buildEmpresaWebhookUrl(await resolveWebhookOrigin(), cnpj)

  const { data: existing } = await supabase
    .from('empresa_webhooks')
    .select('id, url')
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()
  if (existing) {
    return {
      success: false as const,
      error: 'Esta empresa já tem uma URL de webhook. Ela é única e baseada no CNPJ.',
    }
  }

  const events = [
    ...new Set([
      ...input.events.filter((event): event is EmpresaWebhookEvent =>
        (EMPRESA_WEBHOOK_EVENTS as readonly string[]).includes(event),
      ),
      'webhook.ping' as const,
    ]),
  ]
  if (!events.includes('channel.disconnected') && !events.includes('channel.connected')) {
    return { success: false as const, error: 'Selecione ao menos um evento de canal.' }
  }

  const secret = generateEmpresaWebhookSecret()
  const { data, error } = await supabase
    .from('empresa_webhooks')
    .insert({
      empresa_id: me.empresa_id,
      nome: input.nome.trim() || 'Webhook de alarme',
      url,
      secret,
      events,
      ativo: true,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        success: false as const,
        error: 'Já existe um webhook com este CNPJ. Cada cliente tem uma URL exclusiva.',
      }
    }
    return { success: false as const, error: error.message }
  }

  revalidatePath('/cockpit/configuracoes/canais')
  return { success: true as const, id: data.id, secret }
}

export async function updateEmpresaWebhook(input: {
  id: string
  ativo?: boolean
  events?: string[]
  nome?: string
}) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { success: false as const, error: 'Não autenticado' }
  if (!canManageWebhooks(me)) return { success: false as const, error: 'Sem permissão' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof input.ativo === 'boolean') patch.ativo = input.ativo
  if (typeof input.nome === 'string') patch.nome = input.nome.trim() || 'Webhook'
  if (input.events) {
    const events = [
      ...new Set([
        ...input.events.filter((event): event is EmpresaWebhookEvent =>
          (EMPRESA_WEBHOOK_EVENTS as readonly string[]).includes(event),
        ),
        'webhook.ping' as const,
      ]),
    ]
    if (!events.includes('channel.disconnected') && !events.includes('channel.connected')) {
      return { success: false as const, error: 'Selecione ao menos um evento de canal.' }
    }
    patch.events = events
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('empresa_webhooks')
    .update(patch)
    .eq('id', input.id)
    .eq('empresa_id', me.empresa_id)

  if (error) return { success: false as const, error: error.message }
  revalidatePath('/cockpit/configuracoes/canais')
  return { success: true as const }
}

export async function deleteEmpresaWebhook(id: string) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { success: false as const, error: 'Não autenticado' }
  if (!hasPermission(me, 'canais', 'delete') && !canManageWebhooks(me)) {
    return { success: false as const, error: 'Sem permissão' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('empresa_webhooks')
    .delete()
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)

  if (error) return { success: false as const, error: error.message }
  revalidatePath('/cockpit/configuracoes/canais')
  return { success: true as const }
}

export async function rotateEmpresaWebhookSecret(id: string) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { success: false as const, error: 'Não autenticado' }
  if (!canManageWebhooks(me)) return { success: false as const, error: 'Sem permissão' }

  const secret = generateEmpresaWebhookSecret()
  const supabase = await createClient()
  const { error } = await supabase
    .from('empresa_webhooks')
    .update({ secret, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)

  if (error) return { success: false as const, error: error.message }
  revalidatePath('/cockpit/configuracoes/canais')
  return { success: true as const, secret }
}

export async function testEmpresaWebhook(id: string) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { success: false as const, error: 'Não autenticado' }
  if (!canManageWebhooks(me)) return { success: false as const, error: 'Sem permissão' }

  const supabase = await createClient()
  const { data: hook, error } = await supabase
    .from('empresa_webhooks')
    .select('id, ativo')
    .eq('id', id)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  if (error || !hook) return { success: false as const, error: 'Webhook não encontrado' }
  if (!hook.ativo) return { success: false as const, error: 'Ative o webhook antes de testar.' }

  await dispatchEmpresaWebhooks({
    empresaId: me.empresa_id,
    event: 'webhook.ping',
    data: {
      ping: true,
      requested_by: me.id,
      request_id: randomUUID(),
    },
  })

  return { success: true as const }
}
