import { BarChart3, Lock } from 'lucide-react'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import ReportsClient from './ReportsClient'
import { getAnalyticsReport, type AnalyticsFilters } from './actions'

export const metadata = { title: 'Relatórios | HuginFlow' }
export const dynamic = 'force-dynamic'

function toInputDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export default async function ReportsPage() {
  const me = await getMyProfile()
  if (!me?.empresa_id || !hasPermission(me, 'relatorios', 'view')) {
    return (
      <div data-testid="access-denied" className="flex flex-col items-center py-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-red-400" />
        <h2 className="text-2xl font-black text-white">Acesso Interditado</h2>
        <p className="mt-2 text-gray-400">Seu grupo não possui permissão para Relatórios.</p>
      </div>
    )
  }

  const end = new Date()
  const start = new Date(end.getTime() - 7 * 86_400_000)
  const initialFilters: AnalyticsFilters = {
    start: toInputDate(start),
    end: toInputDate(end),
  }
  const [report, departmentsResult] = await Promise.all([
    getAnalyticsReport(initialFilters),
    (await createClient())
      .from('departamentos')
      .select('id, nome')
      .eq('empresa_id', me.empresa_id)
      .order('nome'),
  ])

  if (report.error || !report.data) {
    throw new Error(report.error ?? 'Relatórios indisponíveis.')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-7 w-7 text-orange-400" />
        <div>
          <h1 className="text-2xl font-black text-white">Relatórios & Analytics</h1>
          <p className="text-sm text-gray-400">Indicadores operacionais isolados por empresa.</p>
        </div>
      </div>
      <ReportsClient
        initial={report.data}
        initialFilters={initialFilters}
        departments={departmentsResult.data ?? []}
      />
    </div>
  )
}
