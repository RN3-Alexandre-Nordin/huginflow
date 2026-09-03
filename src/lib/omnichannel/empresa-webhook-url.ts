import { cleanDigits } from '@/utils/brasilian-formatters'
import { getAppPublicUrl } from '@/lib/config/environment'

export const EMPRESA_WEBHOOK_PATH = '/api/webhooks/empresa'

export function cnpjWebhookSlug(cnpj: string | null | undefined): string | null {
  const digits = cleanDigits(cnpj ?? '')
  return digits.length === 14 ? digits : null
}

export function empresaWebhookPath(cnpjDigits: string): string {
  return `${EMPRESA_WEBHOOK_PATH}/${cnpjDigits}`
}

export function buildEmpresaWebhookUrl(origin: string, cnpjDigits: string): string {
  return `${origin.replace(/\/$/, '')}${empresaWebhookPath(cnpjDigits)}`
}

export function isCanonicalEmpresaWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return /^\/api\/webhooks\/empresa\/\d{14}$/.test(parsed.pathname)
  } catch {
    return false
  }
}

export function fallbackAppOrigin(): string {
  return getAppPublicUrl().replace(/\/$/, '')
}
