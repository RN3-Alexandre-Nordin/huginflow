/** Credenciais e URL — tenant de teste em DEV ou empresa de teste da homologação em PROD. */
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

export function getBaseUrl() {
  return (
    process.env.TEST_BASE_URL ||
    process.env.MANUAL_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  )
}

export function getTestEmail() {
  const value = process.env.TEST_EMAIL || process.env.MANUAL_EMAIL
  if (!value) throw new Error('TEST_EMAIL ausente')
  return value
}

export function getTestPassword() {
  const value = process.env.TEST_PASSWORD || process.env.MANUAL_PASSWORD
  if (!value) throw new Error('TEST_PASSWORD ausente')
  return value
}

export function getTestTenantId() {
  const value = process.env.TEST_TENANT_ID?.trim()
  if (!value) throw new Error('TEST_TENANT_ID ausente')
  return value
}

const PROD_PROJECT_REF = 'zmypzexefjbovuknjlid'
const PROD_TEST_TENANT_PREFIX = 'Empresa Teste Go-Live'

/** DEV, ou PROD somente na empresa de teste criada pela homologação. */
export function assertDevTestTarget() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!raw) throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente')
  const hostname = new URL(raw).hostname
  if (process.env.TEST_PROD_SMOKE === '1') {
    throw new Error('E2E mutável recusa TEST_PROD_SMOKE=1')
  }

  if (process.env.TEST_TARGET_ENV === 'prod') {
    if (process.env.TEST_PROD_TEST_TENANT !== '1') {
      throw new Error('TEST_TARGET_ENV=prod exige TEST_PROD_TEST_TENANT=1')
    }
    if (!hostname.startsWith(`${PROD_PROJECT_REF}.`)) {
      throw new Error('TEST_TARGET_ENV=prod exige o Supabase de produção')
    }
    const file = resolve(process.cwd(), 'scripts/supabase/out/prod-test-tenant.json')
    const tenant = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
    if (
      !tenant?.empresa_id ||
      !String(tenant.empresa_nome || '').startsWith(PROD_TEST_TENANT_PREFIX) ||
      process.env.TEST_TENANT_ID !== tenant.empresa_id
    ) {
      throw new Error('E2E em PROD só roda na empresa de teste da homologação')
    }
    return
  }

  const expectedRef = process.env.TEST_DEV_SUPABASE_REF || 'vujqukqsfwmoezwyuoum'
  if (!hostname.startsWith(`${expectedRef}.`)) {
    throw new Error(`E2E mutável recusa Supabase fora do DEV ${expectedRef}`)
  }
}
