/**
 * Configuração do handoff SSO Bifrost (abrir chamado embutido).
 * Secrets só no server — nunca expor BIFROST_JWT_PRIVATE_KEY ao client.
 *
 * Dual-ambiente contra o mesmo Bifrost prod (`https://bifrost.rn3.tec.br`):
 * - Hugin prod → sistema_origem `hugin_flow` + JWKS de app.huginflow.com
 * - Hugin dev/treino → sistema_origem `hugin_flow_dev` + JWKS deste ambiente
 */

import { createPrivateKey, createPublicKey } from 'crypto'

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

/**
 * Normaliza PEM vindo de env/Swarm/GitHub Secrets:
 * aspas, `\n`/`\\n`, PKCS#1 → PKCS#8.
 */
export function normalizePemKey(raw: string, kind: 'private' | 'public'): string {
  let pem = raw.trim()
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1).trim()
  }

  pem = pem.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // Expand escaped newlines (pode vir duplo do Swarm: \\n)
  for (let i = 0; i < 4 && pem.includes('\\n'); i += 1) {
    pem = pem.replace(/\\n/g, '\n')
  }
  pem = pem.replace(/\\r/g, '').trim()

  if (!pem.includes('BEGIN') && /^[A-Za-z0-9+/=\s]+$/.test(pem)) {
    const body = pem.replace(/\s+/g, '')
    const lines = body.match(/.{1,64}/g)?.join('\n') ?? body
    pem =
      kind === 'private'
        ? `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`
        : `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`
  }

  if (kind === 'private' && /BEGIN RSA PRIVATE KEY/.test(pem)) {
    pem = createPrivateKey(pem).export({ type: 'pkcs8', format: 'pem' }).toString()
  }

  if (kind === 'public' && /BEGIN RSA PUBLIC KEY/.test(pem)) {
    pem = createPublicKey(pem).export({ type: 'spki', format: 'pem' }).toString()
  }

  return pem.trim() + '\n'
}

function readPemFromEnv(
  plainName: string,
  b64Name: string,
  kind: 'private' | 'public',
): string | null {
  const b64 = process.env[b64Name]?.trim()
  if (b64) {
    const decoded = Buffer.from(b64.replace(/\s+/g, ''), 'base64').toString('utf8')
    const pem = normalizePemKey(decoded, kind)
    const expect =
      kind === 'private' ? /BEGIN (RSA )?PRIVATE KEY/ : /BEGIN (RSA )?PUBLIC KEY/
    if (!expect.test(pem)) {
      throw new Error(
        `${b64Name} não decodifica para PEM válido (${kind}). Refaça o deploy / secret.`,
      )
    }
    try {
      if (kind === 'private') createPrivateKey(pem)
      else createPublicKey(pem)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`${b64Name} PEM ilegível: ${msg}`)
    }
    return pem
  }

  const raw = process.env[plainName]?.trim()
  if (!raw) return null
  const pem = normalizePemKey(raw, kind)
  try {
    if (kind === 'private') createPrivateKey(pem)
    else createPublicKey(pem)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `${plainName} inválida (${kind}). Use PKCS#8 (BEGIN PRIVATE KEY) ou *_B64. ${msg}`,
    )
  }
  return pem
}

/** PEM PKCS8; aceita `\n` literal, aspas, ou `BIFROST_JWT_PRIVATE_KEY_B64`. */
export function getBifrostJwtPrivateKeyPem(): string | null {
  return readPemFromEnv('BIFROST_JWT_PRIVATE_KEY', 'BIFROST_JWT_PRIVATE_KEY_B64', 'private')
}

/** PEM SPKI público opcional (se ausente, deriva da privada). */
export function getBifrostJwtPublicKeyPem(): string | null {
  return readPemFromEnv('BIFROST_JWT_PUBLIC_KEY', 'BIFROST_JWT_PUBLIC_KEY_B64', 'public')
}
