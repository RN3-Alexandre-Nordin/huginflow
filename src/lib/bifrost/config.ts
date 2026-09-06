/**
 * Configuração do handoff SSO Bifrost (abrir chamado embutido).
 * Secrets só no server — nunca expor BIFROST_JWT_PRIVATE_KEY ao client.
 *
 * Dual-ambiente contra o mesmo Bifrost prod (`https://bifrost.rn3.tec.br`):
 * - Hugin prod → sistema_origem `hugin_flow` + JWKS de app.huginflow.com
 * - Hugin dev/treino → sistema_origem `hugin_flow_dev` + JWKS deste ambiente
 */

export const BIFROST_JWT_AUDIENCE = 'bifrost'
export const BIFROST_JWT_TTL_SECONDS = 60

const BIFROST_PROD_URL = 'https://bifrost.rn3.tec.br'

function isHuginProductionRuntime(): boolean {
  const env = (process.env.HUGINFLOW_ENV || '').toLowerCase()
  if (env === 'production') return true
  if (env === 'development' || env === 'dev' || env === 'training') return false
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').toLowerCase()
  if (appUrl.includes('app.huginflow.com')) return true
  if (appUrl.includes('dev.huginflow.com')) return false
  return process.env.NODE_ENV === 'production'
}

/** Claim JWT `sistema_origem` — cadastro distinto no Bifrost por ambiente. */
export function getBifrostSistemaOrigem(): string {
  const explicit = process.env.BIFROST_SISTEMA_ORIGEM?.trim()
  if (explicit) return explicit
  return isHuginProductionRuntime() ? 'hugin_flow' : 'hugin_flow_dev'
}

/**
 * Base do embed Bifrost.
 * Default: Bifrost produção (prod e treino). Override com localhost só no PC do dev.
 */
export function getBifrostUrl(): string {
  return (process.env.BIFROST_URL || BIFROST_PROD_URL).replace(/\/$/, '')
}

/** Origin esperado no postMessage (sem path). */
export function getBifrostOrigin(): string {
  const explicit = process.env.BIFROST_ORIGIN?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  try {
    return new URL(getBifrostUrl()).origin
  } catch {
    return BIFROST_PROD_URL
  }
}

/** Issuer canônico — deve bater com o cadastrado no Bifrost para o `sistema_origem`. */
export function getBifrostJwtIssuer(): string {
  const explicit = process.env.BIFROST_JWT_ISSUER?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  if (getBifrostSistemaOrigem() === 'hugin_flow') {
    return 'https://app.huginflow.com/bifrost'
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (appUrl) return `${appUrl}/bifrost`
  return 'https://dev.huginflow.com/bifrost'
}

export function getBifrostJwtKid(): string {
  const explicit = process.env.BIFROST_JWT_KID?.trim()
  if (explicit) return explicit
  return getBifrostSistemaOrigem() === 'hugin_flow' ? 'hugin-1' : 'hugin-dev-1'
}

/** PEM PKCS8; aceita `\n` literal na env. */
export function getBifrostJwtPrivateKeyPem(): string | null {
  const raw = process.env.BIFROST_JWT_PRIVATE_KEY?.trim()
  if (!raw) return null
  return raw.replace(/\\n/g, '\n')
}

/** PEM SPKI público opcional (se ausente, deriva da privada). */
export function getBifrostJwtPublicKeyPem(): string | null {
  const raw = process.env.BIFROST_JWT_PUBLIC_KEY?.trim()
  if (!raw) return null
  return raw.replace(/\\n/g, '\n')
}
