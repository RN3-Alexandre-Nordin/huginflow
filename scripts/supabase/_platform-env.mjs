/**
 * Helpers compartilhados para scripts de homolog / tunnels.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const o = {}
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}

/** Carrega .env.production (ou path) a partir da raiz do repo. */
export function loadProdEnv(root = resolve(__dirname, '../..')) {
  return {
    ...loadEnvFile(resolve(root, '.env.production')),
    ...process.env,
  }
}

export function getAppPublicUrl(env = process.env, { production = true } = {}) {
  const fromEnv =
    env.NEXT_PUBLIC_APP_URL ||
    env.HUGINFLOW_APP_URL ||
    (production ? env.NEXT_PUBLIC_APP_URL_PROD : env.NEXT_PUBLIC_APP_URL_DEV)
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return production ? 'https://app.huginflow.com' : 'http://localhost:3000'
}

export function getWebhookUrl(env = process.env, { production = true } = {}) {
  if (production) {
    return (
      env.HUGINFLOW_WEBHOOK_URL_PROD ||
      env.HUGINFLOW_WEBHOOK_URL ||
      `${getAppPublicUrl(env, { production: true })}/api/webhooks/evolution`
    )
  }
  return (
    env.HUGINFLOW_WEBHOOK_URL_DEV ||
    env.HUGINFLOW_WEBHOOK_URL ||
    'https://huginflow-local.rn3.tec.br/api/webhooks/evolution'
  )
}

export const PLATFORM_NAME = 'HuginFlow'
