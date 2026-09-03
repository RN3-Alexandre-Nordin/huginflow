import { createHmac, randomBytes, randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  shouldAlertChannelDisconnect,
  isChannelConnectedStatus,
  isMonitoredInboundProvider,
} from '@/lib/omnichannel/channel-connection'
import { isCanonicalEmpresaWebhookUrl } from '@/lib/omnichannel/empresa-webhook-url'

export const EMPRESA_WEBHOOK_EVENTS = [
  'channel.disconnected',
  'channel.connected',
  'webhook.ping',
] as const

export type EmpresaWebhookEvent = (typeof EMPRESA_WEBHOOK_EVENTS)[number]

const DELIVERY_TIMEOUT_MS = 8000

export function generateEmpresaWebhookSecret(): string {
  return randomBytes(32).toString('hex')
}

export function signEmpresaWebhookPayload(secret: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
}

export function isAllowedWebhookUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.username || url.password) return false
    return true
  } catch {
    return false
  }
}

type WebhookRow = {
  id: string
  empresa_id: string
  url: string
  secret: string
  events: string[] | null
}

async function postSignedWebhook(input: {
  url: string
  secret: string
  event: string
  deliveryId: string
  rawBody: string
}): Promise<{ statusCode: number | null; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)
  try {
    const response = await fetch(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HuginFlow-Webhook/1.0',
        'X-HuginFlow-Event': input.event,
        'X-HuginFlow-Delivery': input.deliveryId,
        'X-HuginFlow-Signature': signEmpresaWebhookPayload(input.secret, input.rawBody),
      },
      body: input.rawBody,
      signal: controller.signal,
    })
    if (!response.ok) {
      return { statusCode: response.status, error: `HTTP ${response.status}` }
    }
    return { statusCode: response.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha de rede'
    return { statusCode: null, error: message }
  } finally {
    clearTimeout(timer)
  }
}

export async function dispatchEmpresaWebhooks(input: {
  empresaId: string
  event: EmpresaWebhookEvent
  data: Record<string, unknown>
}): Promise<void> {
  const admin = createAdminClient()
  const { data: hooks, error } = await admin
    .from('empresa_webhooks')
    .select('id, empresa_id, url, secret, events')
    .eq('empresa_id', input.empresaId)
    .eq('ativo', true)

  if (error) {
    console.error('[EmpresaWebhooks] Falha ao listar destinos:', error.message)
    return
  }

  const targets = ((hooks ?? []) as WebhookRow[]).filter((row) =>
    (row.events ?? []).includes(input.event),
  )
  if (targets.length === 0) return

  const occurredAt = new Date().toISOString()

  await Promise.all(
    targets.map(async (hook) => {
      const deliveryId = randomUUID()
      const payload = {
        id: deliveryId,
        event: input.event,
        occurred_at: occurredAt,
        empresa_id: input.empresaId,
        data: input.data,
      }
      const rawBody = JSON.stringify(payload)
      const result = isCanonicalEmpresaWebhookUrl(hook.url)
        ? { statusCode: 204 as number | null, error: undefined }
        : await postSignedWebhook({
            url: hook.url,
            secret: hook.secret,
            event: input.event,
            deliveryId,
            rawBody,
          })

      const { error: logErr } = await admin.from('empresa_webhook_deliveries').insert({
        id: deliveryId,
        empresa_id: input.empresaId,
        webhook_id: hook.id,
        event: input.event,
        payload,
        status_code: result.statusCode,
        success: !result.error && (result.statusCode ?? 0) >= 200 && (result.statusCode ?? 0) < 300,
        error: result.error ?? null,
      })
      if (logErr) {
        console.error('[EmpresaWebhooks] Falha ao gravar delivery:', logErr.message)
      }
    }),
  )

  try {
    await admin.rpc('enqueue_event', {
      p_empresa_id: input.empresaId,
      p_topic: input.event,
      p_aggregate_type: 'crm_canais',
      p_aggregate_id:
        typeof input.data.channel === 'object' &&
        input.data.channel &&
        'id' in input.data.channel &&
        typeof (input.data.channel as { id?: string }).id === 'string'
          ? (input.data.channel as { id: string }).id
          : input.empresaId,
      p_payload: { event: input.event, data: input.data, occurred_at: occurredAt },
    })
  } catch (err) {
    console.error('[EmpresaWebhooks] enqueue_event ignorado:', err)
  }
}

export async function notifyInboundChannelStatusChange(input: {
  empresaId: string
  channelId: string
  channelName: string
  provider: string
  providerId: string | null
  previousStatus: string | null
  newStatus: string
}): Promise<void> {
  if (!isMonitoredInboundProvider(input.provider)) return

  let event: EmpresaWebhookEvent | null = null
  if (shouldAlertChannelDisconnect(input.previousStatus, input.newStatus, input.provider)) {
    event = 'channel.disconnected'
  } else if (
    !isChannelConnectedStatus(input.previousStatus) &&
    isChannelConnectedStatus(input.newStatus)
  ) {
    event = 'channel.connected'
  }
  if (!event) return

  await dispatchEmpresaWebhooks({
    empresaId: input.empresaId,
    event,
    data: {
      channel: {
        id: input.channelId,
        nome: input.channelName,
        provider: input.provider,
        provider_id: input.providerId,
        previous_status: input.previousStatus,
        status: input.newStatus,
      },
    },
  })
}

/** Atualiza status dos canais do provedor e dispara webhooks de saída. */
export async function applyInboundChannelStatus(input: {
  supabase: SupabaseClient
  provider: string
  providerId: string
  newStatus: string
}): Promise<{ updated: number; error?: string }> {
  const { data: channels, error } = await input.supabase
    .from('crm_canais')
    .select('id, empresa_id, nome, provider, provider_id, status')
    .eq('provider', input.provider)
    .eq('provider_id', input.providerId)

  if (error) return { updated: 0, error: error.message }
  if (!channels?.length) return { updated: 0 }

  let updated = 0
  for (const channel of channels) {
    if (channel.status === input.newStatus) continue
    const { error: upErr } = await input.supabase
      .from('crm_canais')
      .update({ status: input.newStatus })
      .eq('id', channel.id)
      .eq('empresa_id', channel.empresa_id)
    if (upErr) {
      console.error('[EmpresaWebhooks] Falha ao atualizar canal', channel.id, upErr)
      continue
    }
    updated += 1
    try {
      await notifyInboundChannelStatusChange({
        empresaId: channel.empresa_id,
        channelId: channel.id,
        channelName: channel.nome,
        provider: channel.provider,
        providerId: channel.provider_id,
        previousStatus: channel.status,
        newStatus: input.newStatus,
      })
    } catch (err) {
      console.error('[EmpresaWebhooks] Falha ao notificar desconexão', err)
    }
  }

  return { updated }
}
