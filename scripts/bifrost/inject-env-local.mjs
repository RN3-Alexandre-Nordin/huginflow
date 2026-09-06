/**
 * Injeta BIFROST_* no .env.local a partir de scripts/bifrost/.keys/
 * Não imprime a chave privada.
 *
 * Default: aponta para Bifrost produção + claim hugin_flow_dev (treino/local Hugin).
 * Para Bifrost local no PC, sobrescreva BIFROST_URL/ORIGIN depois do inject.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const envPath = join(root, '.env.local')
const pemPath = join(root, 'scripts/bifrost/.keys/hugin-bifrost-private.pem')

if (!existsSync(pemPath)) {
  console.error('PEM ausente. Rode: node scripts/bifrost/generate-keypair.mjs')
  process.exit(1)
}

const pem = readFileSync(pemPath, 'utf8').trim().replace(/\r\n/g, '\n')
const privateEnv = pem.replace(/\n/g, '\\n')

let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
env = env.replace(/\r\n/g, '\n')
env = env
  .split('\n')
  .filter((line) => !line.startsWith('BIFROST_') && line !== '# Bifrost SSO embed')
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trimEnd()

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://dev.huginflow.com').replace(/\/$/, '')

const block = [
  '',
  '# Bifrost SSO embed (Hugin local/treino → Bifrost prod)',
  'BIFROST_URL=https://bifrost.rn3.tec.br',
  'BIFROST_ORIGIN=https://bifrost.rn3.tec.br',
  'BIFROST_SISTEMA_ORIGEM=hugin_flow_dev',
  `BIFROST_JWT_ISSUER=${appUrl}/bifrost`,
  'BIFROST_JWT_KID=hugin-dev-1',
  `BIFROST_JWT_PRIVATE_KEY="${privateEnv}"`,
  '',
].join('\n')

writeFileSync(envPath, (env ? `${env}\n` : '') + block, 'utf8')

const check = readFileSync(envPath, 'utf8')
const keys = check
  .split('\n')
  .filter((l) => l.startsWith('BIFROST_'))
  .map((l) => l.split('=')[0])
const ok = /BIFROST_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n/.test(check)
console.log(JSON.stringify({ ok, keys, tip: 'Cadastre hugin_flow_dev no Bifrost com jwks_url público deste ambiente' }))
