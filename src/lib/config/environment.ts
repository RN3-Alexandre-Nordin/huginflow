/**
 * Ambientes Ragnar (dev vs produção).
 *
 * | Onde roda          | RAGNAR_ENV     | Evolution (_DEV / _PROD) | Webhook Ragnar        |
 * |--------------------|----------------|--------------------------|------------------------|
 * | npm run dev (local)| development    | VPS Evolution DEV        | URL público (túnel*)  |
 * | Docker VPS prod    | production     | VPS Evolution PROD       | app.ragnar.ia.br      |
 *
 * * A Evolution na VPS não alcança localhost. Em dev local use Cloudflare Tunnel
 *   ou teste recebimento de mensagens no deploy de produção.
 *
 * Supabase: hoje um único projeto (credenciais em ambos os envs). Quando existir
 * projeto Supabase de produção, troque apenas NEXT_PUBLIC_* e SERVICE_ROLE na VPS.
 *
 * Prioridade RAGNAR_ENV: variável explícita > NODE_ENV.
 * Credenciais: WHATSAPP_*_DEV|_PROD e RAGNAR_WEBHOOK_URL_DEV|_PROD > genéricas.
 */

export type RagnarEnvironment = 'development' | 'production'

export interface OmnichannelConfig {
  environment: RagnarEnvironment
  evolutionApiUrl: string
  evolutionApiToken: string
  webhookUrl: string
  appUrl: string
}

const DEFAULTS: Record<
  RagnarEnvironment,
  { evolutionApiUrl: string; webhookUrl: string; appUrl: string }
> = {
  development: {
    evolutionApiUrl: 'https://evo-dev.rn3.tec.br',
    webhookUrl: 'https://dev-ragnar.rn3.tec.br/api/webhooks/evolution',
    appUrl: 'http://localhost:3000',
  },
  production: {
    evolutionApiUrl: 'https://evo.rn3.tec.br',
    webhookUrl: 'https://app.ragnar.ia.br/api/webhooks/evolution',
    appUrl: 'https://app.ragnar.ia.br',
  },
}

export function getRagnarEnvironment(): RagnarEnvironment {
  const explicit = process.env.RAGNAR_ENV?.trim().toLowerCase()
  if (explicit === 'development' || explicit === 'dev') return 'development'
  if (explicit === 'production' || explicit === 'prod') return 'production'
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

function readEnv(
  genericKey: string,
  env: RagnarEnvironment,
): string | undefined {
  const suffix = env === 'development' ? 'DEV' : 'PROD'
  const scoped = process.env[`${genericKey}_${suffix}`]?.trim()
  const generic = process.env[genericKey]?.trim()
  return scoped || generic
}

export function getAppPublicUrl(): string {
  const env = getRagnarEnvironment()
  const suffix = env === 'development' ? 'DEV' : 'PROD'
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env[`NEXT_PUBLIC_APP_URL_${suffix}`]?.trim() ||
    DEFAULTS[env].appUrl
  )
}

/**
 * Configuração omnichannel do ambiente atual (Evolution + webhook do Ragnar).
 */
export function getOmnichannelConfig(): OmnichannelConfig {
  const environment = getRagnarEnvironment()
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
    readEnv('RAGNAR_WEBHOOK_URL', environment) ?? defaults.webhookUrl

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
  return {
    environment: config.environment,
    appUrl: config.appUrl,
    evolutionApiUrl: config.evolutionApiUrl,
    webhookUrl: config.webhookUrl,
    evolutionTokenConfigured: Boolean(config.evolutionApiToken),
    supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseServiceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    openaiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  }
}

export function isRagnarDevelopment(): boolean {
  return getRagnarEnvironment() === 'development'
}
