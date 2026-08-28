/**
 * Ambientes da plataforma (dev vs produção).
 *
 * | Onde roda          | ENV            | Evolution (_DEV / _PROD) | Webhook app              |
 * |--------------------|----------------|--------------------------|---------------------------|
 * | npm run dev (local)| development    | VPS Evolution DEV        | URL público (túnel*)      |
 * | Docker VPS prod    | production     | VPS Evolution PROD       | app.huginflow.com         |
 *
 * Prioridade ENV: HUGINFLOW_ENV > NODE_ENV.
 * Webhook: HUGINFLOW_WEBHOOK_URL_* (ou genéricas WHATSAPP_*).
 */

import { getServerSupabaseUrl, getSupabaseCredentialDiagnostics } from '@/lib/supabase/env'

export type PlatformEnvironment = 'development' | 'production'

export interface OmnichannelConfig {
  environment: PlatformEnvironment
  evolutionApiUrl: string
  evolutionApiToken: string
  webhookUrl: string
  appUrl: string
}

const DEFAULTS: Record<
  PlatformEnvironment,
  { evolutionApiUrl: string; webhookUrl: string; appUrl: string }
> = {
  development: {
    evolutionApiUrl: 'https://evo-dev.rn3.tec.br',
    webhookUrl: 'https://huginflow-local.rn3.tec.br/api/webhooks/evolution',
    appUrl: 'http://localhost:3000',
  },
  production: {
    evolutionApiUrl: 'https://evo.rn3.tec.br',
    webhookUrl: 'https://app.huginflow.com/api/webhooks/evolution',
    appUrl: 'https://app.huginflow.com',
  },
}

export function getPlatformEnvironment(): PlatformEnvironment {
  const explicit = (process.env.HUGINFLOW_ENV || '').trim().toLowerCase()
  if (explicit === 'development' || explicit === 'dev') return 'development'
  if (explicit === 'production' || explicit === 'prod') return 'production'
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

function readEnv(
  genericKey: string,
  env: PlatformEnvironment,
): string | undefined {
  const suffix = env === 'development' ? 'DEV' : 'PROD'
  const scoped = process.env[`${genericKey}_${suffix}`]?.trim()
  const generic = process.env[genericKey]?.trim()
  return scoped || generic
}

export function getAppPublicUrl(): string {
  const env = getPlatformEnvironment()
  const suffix = env === 'development' ? 'DEV' : 'PROD'
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env[`NEXT_PUBLIC_APP_URL_${suffix}`]?.trim() ||
    DEFAULTS[env].appUrl
  )
}

/**
 * Configuração omnichannel do ambiente atual (Evolution + webhook do app).
 */
export function getOmnichannelConfig(): OmnichannelConfig {
  const environment = getPlatformEnvironment()
  const defaults = DEFAULTS[environment]

  const evolutionApiUrl =
    readEnv('WHATSAPP_API_URL', environment) ?? defaults.evolutionApiUrl

  const evolutionApiToken = readEnv('WHATSAPP_API_TOKEN', environment)
  if (!evolutionApiToken) {
    throw new Error(
      `WHATSAPP_API_TOKEN não configurado para "${environment}". ` +
        `Defina WHATSAPP_API_TOKEN_${environment === 'development' ? 'DEV' : 'PROD'}.`,
    )
  }

  const webhookUrl =
    readEnv('HUGINFLOW_WEBHOOK_URL', environment) || defaults.webhookUrl

  return {
    environment,
    evolutionApiUrl,
    evolutionApiToken,
    webhookUrl,
    appUrl: getAppPublicUrl(),
  }
}

/** URL/token/webhook do ambiente atual; falha se token ausente. */
export function getEvolutionCredentials(customUrl?: string, customKey?: string) {
  const config = getOmnichannelConfig()
  return {
    environment: config.environment,
    apiUrl: customUrl || config.evolutionApiUrl,
    apiKey: customKey || config.evolutionApiToken,
    webhookUrl: config.webhookUrl,
  }
}

/** Resumo seguro para logs e health check (sem expor token). */
export function getOmnichannelHealthSummary() {
  const config = getOmnichannelConfig()
  const supabaseDiag = getSupabaseCredentialDiagnostics()
  return {
    environment: config.environment,
    appUrl: config.appUrl,
    evolutionApiUrl: config.evolutionApiUrl,
    webhookUrl: config.webhookUrl,
    evolutionTokenConfigured: Boolean(config.evolutionApiToken),
    supabaseUrlConfigured: Boolean(getServerSupabaseUrl()),
    supabaseProjectRef: supabaseDiag.urlRef,
    supabaseAnonKeyRef: supabaseDiag.anonRef,
    supabaseKeysAligned: supabaseDiag.keysAligned,
    supabaseServiceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    openaiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  }
}

export function isPlatformDevelopment(): boolean {
  return getPlatformEnvironment() === 'development'
}
