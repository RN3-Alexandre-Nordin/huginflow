import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

for (const f of ['.env.local', '.env']) {
  if (existsSync(f)) loadDotenv({ path: f, override: false })
}

const id = process.argv[2] || '1b138173-ee1a-430b-954d-4412c2ce91e1'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const organizationId = process.env.TEST_TENANT_ID
if (!url || !key || !organizationId) {
  console.error('Missing Supabase URL, service role key, or TEST_TENANT_ID')
  process.exit(1)
}

const summary = JSON.parse(
  readFileSync(resolve('docs/homologacao/execucoes', id, 'summary.json'), 'utf8'),
)

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const payload = {
    id,
    organization_id: organizationId,
    started_at: summary.startedAt,
    finished_at: new Date().toISOString(),
    status: 'passed',
    suite: 'e2e-core',
    headed: false,
    base_url: summary.baseUrl,
    commit_sha: summary.commit,
    passed: summary.summary.passed,
    failed: summary.summary.failed,
    skipped: summary.summary.skipped,
    report_path: resolve('docs/homologacao/execucoes', id, 'report.html'),
    events_path: resolve('docs/homologacao/execucoes', id, 'events.ndjson'),
    summary_json: summary,
}

const existing = await sb
  .from('test_runs')
  .select('id')
  .eq('id', id)
  .eq('organization_id', organizationId)
  .maybeSingle()
if (existing.error) {
  console.error(existing.error.message)
  process.exit(1)
}

const { data, error } = existing.data
  ? await sb
      .from('test_runs')
      .update(payload)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id, status, passed, failed')
  : await sb.from('test_runs').insert(payload).select('id, status, passed, failed')

console.log(JSON.stringify({ data, error }, null, 2))
if (error) process.exit(1)
