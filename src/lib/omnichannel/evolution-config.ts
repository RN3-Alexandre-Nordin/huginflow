import { getEvolutionCredentials, getRagnarEnvironment } from '@/lib/config/environment'
import type { ProviderConfig } from '@/types/omnichannel'

type CanalEvolutionFields = {
  provider_id: string
  provider_token?: string | null
  settings?: Record<string, unknown> | null
}

/**
 * Monta config do Evolution para envio de mensagens.
 * Em development, credenciais vêm sempre do .env.local (evo-dev),
 * ignorando settings/token clonados de produção no Supabase.
 */
export function buildEvolutionProviderConfig(canal: CanalEvolutionFields): ProviderConfig {
  const envCreds = getEvolutionCredentials()
  const isDev = getRagnarEnvironment() === 'development'
  const canalSettings = (canal.settings ?? {}) as { apiUrl?: string }

  const apiUrl = isDev ? envCreds.apiUrl : canalSettings.apiUrl || envCreds.apiUrl
  const apiKey = isDev ? envCreds.apiKey : canal.provider_token || envCreds.apiKey

  return {
    provider: 'evolution',
    provider_id: canal.provider_id,
    provider_token: apiKey,
    settings: {
      ...canal.settings,
      apiUrl,
    },
  }
}

/** URL + token já resolvidos para chamadas diretas à Evolution API. */
export function getResolvedEvolutionCreds(canal: CanalEvolutionFields) {
  const config = buildEvolutionProviderConfig(canal)
  return {
    apiUrl: (config.settings as { apiUrl?: string })?.apiUrl ?? '',
    apiKey: config.provider_token ?? '',
    instance: config.provider_id,
  }
}
