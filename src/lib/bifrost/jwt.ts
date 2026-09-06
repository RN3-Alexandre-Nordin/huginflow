import { createPublicKey, randomUUID } from 'crypto'
import {
  importPKCS8,
  SignJWT,
  type JWK,
} from 'jose'
import {
  BIFROST_JWT_AUDIENCE,
  BIFROST_JWT_TTL_SECONDS,
  BIFROST_SISTEMA_ORIGEM,
  getBifrostJwtIssuer,
  getBifrostJwtKid,
  getBifrostJwtPrivateKeyPem,
  getBifrostJwtPublicKeyPem,
} from '@/lib/bifrost/config'

export type BifrostEmbedClaimsInput = {
  userId: string
  email: string
  name: string
  tenantId: string
  empresaNome: string
}

type BifrostPrivateKey = Awaited<ReturnType<typeof importPKCS8>>

let cachedPrivateKey: BifrostPrivateKey | null = null
let cachedPublicJwk: JWK | null = null

async function loadPrivateKey(): Promise<BifrostPrivateKey> {
  if (cachedPrivateKey) return cachedPrivateKey
  const pem = getBifrostJwtPrivateKeyPem()
  if (!pem) {
    throw new Error('BIFROST_JWT_PRIVATE_KEY não configurada.')
  }
  cachedPrivateKey = await importPKCS8(pem, 'RS256')
  return cachedPrivateKey
}

/** Exporta JWKS via Node crypto (jose CryptoKey costuma ser non-extractable). */
function buildPublicJwk(): JWK {
  const kid = getBifrostJwtKid()
  const publicPem = getBifrostJwtPublicKeyPem()
  const privatePem = getBifrostJwtPrivateKeyPem()
  const sourcePem = publicPem || privatePem
  if (!sourcePem) {
    throw new Error('BIFROST_JWT_PRIVATE_KEY não configurada.')
  }

  const keyObject = createPublicKey(sourcePem)
  const jwk = keyObject.export({ format: 'jwk' }) as JWK

  return {
    kty: jwk.kty || 'RSA',
    kid,
    use: 'sig',
    alg: 'RS256',
    n: jwk.n,
    e: jwk.e,
  }
}

async function loadPublicJwk(): Promise<JWK> {
  if (cachedPublicJwk) return cachedPublicJwk
  cachedPublicJwk = buildPublicJwk()
  return cachedPublicJwk
}

export async function getBifrostJwks() {
  const key = await loadPublicJwk()
  return { keys: [key] }
}

export async function signBifrostEmbedToken(input: BifrostEmbedClaimsInput): Promise<string> {
  if (!input.name?.trim()) {
    throw new Error('Nome do usuário é obrigatório para o Bifrost.')
  }
  if (!input.email?.trim()) {
    throw new Error('E-mail do usuário é obrigatório para o Bifrost.')
  }
  if (!input.tenantId?.trim()) {
    throw new Error('Tenant/empresa é obrigatório para o Bifrost.')
  }

  const privateKey = await loadPrivateKey()
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({
    user_id: input.userId,
    email: input.email.trim(),
    name: input.name.trim(),
    tenant: input.tenantId,
    empresa: input.empresaNome.trim() || 'Empresa',
    sistema_origem: BIFROST_SISTEMA_ORIGEM,
  })
    .setProtectedHeader({ alg: 'RS256', kid: getBifrostJwtKid(), typ: 'JWT' })
    .setIssuer(getBifrostJwtIssuer())
    .setAudience(BIFROST_JWT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + BIFROST_JWT_TTL_SECONDS)
    .setJti(randomUUID())
    .sign(privateKey)
}
