/**
 * Smoke test Bifrost JWT (sem deploy).
 * Uso: node scripts/bifrost/smoke-jwt.mjs
 *
 * Valida: PEM → B64 (como o CI) → normalize → importPKCS8 → SignJWT → verify.
 * Também simula o bug do SSH truncando multilinha.
 */
import { createPublicKey, createPrivateKey } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { importPKCS8, importSPKI, SignJWT, jwtVerify, exportJWK } from 'jose'
import { config } from 'dotenv'

const root = process.cwd()
config({ path: join(root, '.env.local') })

function expandEscapes(s) {
  let pem = s.trim().replace(/^["']|["']$/g, '')
  for (let i = 0; i < 4 && pem.includes('\\n'); i++) pem = pem.replace(/\\n/g, '\n')
  return pem.replace(/\\r/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim() + '\n'
}

function toB64(pem) {
  return Buffer.from(pem, 'utf8').toString('base64')
}

function fromB64(b64) {
  return Buffer.from(b64.replace(/\s+/g, ''), 'base64').toString('utf8')
}

function loadPem() {
  const envKey = process.env.BIFROST_JWT_PRIVATE_KEY
  if (envKey?.trim()) return expandEscapes(envKey)

  const file = join(root, 'scripts/bifrost/.keys/hugin-bifrost-private.pem')
  if (existsSync(file)) return expandEscapes(readFileSync(file, 'utf8'))

  throw new Error('Sem BIFROST_JWT_PRIVATE_KEY no .env.local nem scripts/bifrost/.keys/')
}

async function signAndVerify(label, pem) {
  createPrivateKey(pem) // Node aceita?
  const key = await importPKCS8(pem, 'RS256')
  const pub = createPublicKey(pem)
  const spki = pub.export({ type: 'spki', format: 'pem' }).toString()
  const verifyKey = await importSPKI(spki, 'RS256')
  const jwk = await exportJWK(pub)

  const token = await new SignJWT({
    user_id: 'smoke-user',
    email: 'smoke@example.com',
    name: 'Smoke Test',
    tenant: '00000000-0000-0000-0000-000000000001',
    empresa: 'Smoke Co',
    sistema_origem: process.env.BIFROST_SISTEMA_ORIGEM || 'hugin_flow_dev',
  })
    .setProtectedHeader({ alg: 'RS256', kid: process.env.BIFROST_JWT_KID || 'hugin-dev-1', typ: 'JWT' })
    .setIssuer(process.env.BIFROST_JWT_ISSUER || 'https://dev.huginflow.com/bifrost')
    .setAudience('bifrost')
    .setIssuedAt()
    .setExpirationTime('60s')
    .setJti(crypto.randomUUID())
    .sign(key)

  const { payload } = await jwtVerify(token, verifyKey, {
    audience: 'bifrost',
    issuer: process.env.BIFROST_JWT_ISSUER || 'https://dev.huginflow.com/bifrost',
  })

  console.log(`✅ ${label}`)
  console.log(`   claims: sistema_origem=${payload.sistema_origem} aud=${payload.aud} iss=${payload.iss}`)
  console.log(`   jwk.kty=${jwk.kty} n_len=${String(jwk.n || '').length}`)
  return true
}

async function main() {
  const pem = loadPem()
  const hasBegin = pem.includes('BEGIN PRIVATE KEY') || pem.includes('BEGIN RSA PRIVATE KEY')
  const hasEnd = pem.includes('END PRIVATE KEY') || pem.includes('END RSA PRIVATE KEY')
  console.log(`PEM local: begin=${hasBegin} end=${hasEnd} lines=${pem.split('\n').length} chars=${pem.length}`)

  if (!hasBegin || !hasEnd) {
    console.error('❌ PEM incompleto (falta BEGIN/END).')
    process.exit(1)
  }

  // 1) caminho feliz (arquivo / env completo)
  await signAndVerify('PEM direto', pem)

  // 2) caminho do CI: encode no runner → B64 one-line → decode no app
  const b64 = toB64(pem)
  const roundtrip = expandEscapes(fromB64(b64))
  await signAndVerify('CI runner B64 → app', roundtrip)

  // 3) simula bug antigo: SSH/env truncando na 1ª linha
  const truncated = pem.split('\n')[0] + '\n'
  try {
    await signAndVerify('PEM truncado (bug SSH)', truncated)
    console.error('❌ Truncado não deveria funcionar')
    process.exit(1)
  } catch (e) {
    console.log(`✅ Truncado falha como esperado: ${e.message.slice(0, 80)}`)
  }

  // 4) JWKS prod atual
  const res = await fetch('https://app.huginflow.com/api/bifrost/jwks')
  const body = await res.json()
  console.log(`\nJWKS prod HTTP ${res.status}:`, JSON.stringify(body).slice(0, 160))
  if (res.status !== 200 || !body.keys?.length) {
    console.log('⚠️  Prod ainda sem JWKS válido — esperado até o deploy novo terminar com B64 do runner.')
  } else {
    console.log('✅ JWKS prod responde com keys')
  }

  console.log('\nSmoke Bifrost JWT: OK (local). Aguardando deploy para prod.')
}

main().catch((e) => {
  console.error('❌', e.message)
  process.exit(1)
})
