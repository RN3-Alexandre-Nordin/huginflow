import { redirect } from 'next/navigation'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { isRn3SuperAdmin } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { isTestRunnerEnabled } from '@/lib/testes/auth'
import TestesClient from './TestesClient'

export const metadata = { title: 'Testes | HuginFlow' }
export const dynamic = 'force-dynamic'

export default async function TestesPage() {
  const me = await getMyProfile()
  if (!isRn3SuperAdmin(me)) redirect('/cockpit/acesso-negado')

  const supabase = await createClient()
  const { data: runs } = await supabase
    .from('test_runs')
    .select(
      'id, started_at, finished_at, status, suite, headed, base_url, commit_sha, passed, failed, skipped, error_message',
    )
    .order('started_at', { ascending: false })
    .limit(50)

  return (
    <TestesClient initialRuns={(runs as any) || []} runnerEnabled={isTestRunnerEnabled()} />
  )
}
