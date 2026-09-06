/**
 * Gera par RSA para o handoff Bifrost (JWT RS256).
 * Uso: node scripts/bifrost/generate-keypair.mjs
 *
 * Cole a privada no .env.local (BIFROST_JWT_PRIVATE_KEY) com \n escapado
 * ou multilinha entre aspas. Opcional: BIFROST_JWT_PUBLIC_KEY.
 */
import { generateKeyPairSync } from 'crypto'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const outDir = join(process.cwd(), 'scripts/bifrost/.keys')
mkdirSync(outDir, { recursive: true })

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const privatePath = join(outDir, 'hugin-bifrost-private.pem')
const publicPath = join(outDir, 'hugin-bifrost-public.pem')
writeFileSync(privatePath, privateKey, 'utf8')
writeFileSync(publicPath, publicKey, 'utf8')

const privateEnv = privateKey.trim().replace(/\r?\n/g, '\\n')

console.log('Chaves geradas em scripts/bifrost/.keys/ (não versionar).')
console.log('')
console.log('Adicione ao .env.local:')
console.log('')
console.log('BIFROST_URL=http://localhost:3000')
console.log('BIFROST_ORIGIN=http://localhost:3000')
console.log('BIFROST_JWT_ISSUER=https://app.huginflow.com/bifrost')
console.log('BIFROST_JWT_KID=hugin-1')
console.log(`BIFROST_JWT_PRIVATE_KEY="${privateEnv}"`)
console.log('')
console.log('JWKS público: GET /api/bifrost/jwks')
console.log('Issuer: https://app.huginflow.com/bifrost')
