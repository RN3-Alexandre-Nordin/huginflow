/**
 * Configuração do handoff SSO Bifrost (abrir chamado embutido).
 * Secrets só no server — nunca expor BIFROST_JWT_PRIVATE_KEY ao client.
 */

export const BIFROST_SISTEMA_ORIGEM = 'hugin_flow'
export const BIFROST_JWT_AUDIENCE = 'bifrost'
export const BIFROST_JWT_TTL_SECONDS = 60

export function getBifrostUrl(): string {
  return (process.env.BIFROST_URL || 'http://localhost:3000').replace(/\/$/, '')
}

/** Origin esperado no postMessage (sem path). */
export function getBifrostOrigin(): string {
  const explicit = process.env.BIFROST_ORIGIN?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  try {
    return new URL(getBifrostUrl()).origin
  } catch {
    return 'http://localhost:3000'
  }
}

/** Issuer canônico — deve bater com o cadastrado no Bifrost. */
export function getBifrostJwtIssuer(): string {
  const explicit = process.env.BIFROST_JWT_ISSUER?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return 'https://app.huginflow.com/bifrost'
}

export function getBifrostJwtKid(): string {
  return (process.env.BIFROST_JWT_KID || 'hugin-1').trim()
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
