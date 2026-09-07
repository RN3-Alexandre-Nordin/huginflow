/** Credenciais e URL — só tenant de teste em DEV. */

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

export function assertDevTestTarget() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!raw) throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente')
  const expectedRef = process.env.TEST_DEV_SUPABASE_REF || 'vujqukqsfwmoezwyuoum'
  const hostname = new URL(raw).hostname
  if (!hostname.startsWith(`${expectedRef}.`)) {
    throw new Error(`E2E mutável recusa Supabase fora do DEV ${expectedRef}`)
  }
  if (process.env.TEST_TARGET_ENV === 'prod' || process.env.TEST_PROD_SMOKE === '1') {
    throw new Error('E2E mutável recusa flags de produção')
  }
}
