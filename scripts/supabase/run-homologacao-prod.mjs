/**
 * Runner — homologação prod blocos 1–11 (automatizados).
 *
 * Uso:
 *   npm run homologacao:prod
 *   node scripts/supabase/run-homologacao-prod.mjs --skip-bootstrap   # reutiliza tenant
 */
import { spawn } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getAppPublicUrl, getWebhookUrl } from './_platform-env.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envProd = resolve(root, '.env.production')
const tenantFile = resolve(__dirname, 'out/prod-test-tenant.json')

const skipBootstrap = process.argv.includes('--skip-bootstrap')

function loadEnv(path) {
  if (!existsSync(path)) return {}
  const o = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}

function runNode(script) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(__dirname, script)], {
      stdio: 'inherit',
      cwd: root,
    })
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${script} exit ${code}`))
    })
  })
}

async function block1Health() {
  const env = loadEnv(envProd)
  const APP_URL = getAppPublicUrl(env, { production: true })
  const res = await fetch(`${APP_URL}/api/health/omnichannel`)
  const body = await res.json()
  if (!res.ok || !body.healthy) {
    throw new Error(`Bloco 1 falhou: HTTP ${res.status} ${JSON.stringify(body)}`)
  }
  console.log('[bloco 1] OK — health omnichannel')
}

async function main() {
  console.log('=== Homologação PROD — blocos 1–11 ===\n')
  await block1Health()

  if (!skipBootstrap || !existsSync(tenantFile)) {
    console.log('\n[bloco 3] bootstrap tenant teste…')
    await runNode('block3-bootstrap-test-empresa-prod.mjs')
  } else {
    console.log('\n[bloco 3] skip bootstrap — tenant existente')
  }

  const scripts = [
    'block2-test-auth-prod.mjs',
    'block3-test-empresa-prod.mjs',
    'block4-test-funil-cards-prod.mjs',
    'block5-test-leads-prod.mjs',
    'block6-test-canais-prod.mjs',
    'block7-test-conhecimento-prod.mjs',
    'block8-test-simulador-prod.mjs',
    'block9-test-whatsapp-prod.mjs',
    'block10-test-dashboard-prod.mjs',
    'block10a-test-chat-interno-prod.mjs',
    'block11-test-permissoes-prod.mjs',
  ]

  for (const script of scripts) {
    console.log(`\n[run] ${script}`)
    await runNode(script)
  }

  console.log('\n=== Homologação automatizada OK (blocos 1–11) ===')
  console.log('Manual: bloco 9.2 QR WhatsApp → block9-verify-whatsapp-connected-prod.mjs')
  console.log('Manual: bloco 12 UAT cliente')
}

main().catch((e) => {
  console.error('\nHomologação FALHOU:', e.message || e)
  process.exit(1)
})
