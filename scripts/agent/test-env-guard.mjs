const DEFAULT_DEV_PROJECT_REF = 'vujqukqsfwmoezwyuoum'
const PROD_PROJECT_REF = 'zmypzexefjbovuknjlid'

export function assertDevTarget() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!raw) throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente')
  const url = new URL(raw)
  const expectedRef = process.env.TEST_DEV_SUPABASE_REF || DEFAULT_DEV_PROJECT_REF
  if (url.hostname.startsWith(`${PROD_PROJECT_REF}.`)) {
    throw new Error('Suite DEV recusou o projeto Supabase de produção')
  }
  if (!url.hostname.startsWith(`${expectedRef}.`)) {
    throw new Error(`Supabase não corresponde ao project ref DEV ${expectedRef}`)
  }
  if (process.env.TEST_TARGET_ENV === 'prod' || process.env.TEST_PROD_SMOKE === '1') {
    throw new Error('Suite DEV recusa flags de produção')
  }
}
