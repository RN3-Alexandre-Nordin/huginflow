import { NextResponse } from 'next/server'
import { getOmnichannelConfig, getOmnichannelHealthSummary } from '@/lib/config/environment'

/**
 * GET /api/health/omnichannel
 * Diagnóstico de configuração dev/prod (sem expor tokens).
 */
export async function GET() {
  try {
    const summary = getOmnichannelHealthSummary()
    const config = getOmnichannelConfig()

    let evolutionStatus: 'ok' | 'error' | 'unknown' = 'unknown'
    let evolutionHttpStatus: number | null = null

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const response = await fetch(`${config.evolutionApiUrl}/`, {
        method: 'GET',
        headers: { apikey: config.evolutionApiToken },
        signal: controller.signal,
      })
      clearTimeout(timeout)
      evolutionHttpStatus = response.status
      evolutionStatus = response.ok ? 'ok' : 'error'
    } catch {
      evolutionStatus = 'error'
    }

    const checks = {
      evolutionReachable: evolutionStatus === 'ok',
      evolutionTokenConfigured: summary.evolutionTokenConfigured,
      webhookUrlIsPublic: summary.webhookUrl.startsWith('https://'),
      supabaseConfigured:
        summary.supabaseUrlConfigured && summary.supabaseServiceRoleConfigured,
      openaiApiKeyConfigured: summary.openaiApiKeyConfigured,
      localDevWebhookWarning:
        summary.environment === 'development' &&
        summary.webhookUrl.includes('localhost'),
    }

    const healthy =
      checks.evolutionTokenConfigured &&
      checks.webhookUrlIsPublic &&
      checks.supabaseConfigured &&
      !checks.localDevWebhookWarning

    return NextResponse.json({
      healthy,
      ...summary,
      evolutionHttpStatus,
      evolutionStatus,
      checks,
      hints: [
        ...(checks.localDevWebhookWarning
          ? [
              'Em npm run dev, a Evolution (VPS) não alcança localhost.',
              'Use Cloudflare Tunnel ou aponte HUGINFLOW_WEBHOOK_URL_DEV para uma URL HTTPS pública.',
            ]
          : []),
        ...(!checks.openaiApiKeyConfigured
          ? ['OPENAI_API_KEY ausente: IA automática do omnichannel não funcionará (configure no .env do servidor).']
          : []),
      ],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Configuração inválida'
    return NextResponse.json({ healthy: false, error: message }, { status: 500 })
  }
}
