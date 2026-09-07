'use server'

import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'

export type AnalyticsFilters = {
  start: string
  end: string
  departmentId?: string
}

export type AnalyticsReport = {
  overview: Record<string, unknown>
  kpis: Record<string, unknown>
  daily: Array<Record<string, unknown>>
  heatmap: { max_count?: number; cells?: Array<Record<string, unknown>> }
}

export async function getAnalyticsReport(
  filters: AnalyticsFilters,
): Promise<{ data?: AnalyticsReport; error?: string }> {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Empresa não vinculada ao perfil.' }
  if (!hasPermission(me, 'relatorios', 'view')) {
    return { error: 'Sem permissão para visualizar relatórios.' }
  }

  const start = new Date(filters.start)
  const end = new Date(filters.end)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    return { error: 'Período inválido.' }
  }

  const rpcFilters = filters.departmentId
    ? { departamento_ids: [filters.departmentId] }
    : {}
  const args = {
    p_empresa_id: me.empresa_id,
    p_data_inicio: start.toISOString(),
    p_data_fim: end.toISOString(),
    p_filtros: rpcFilters,
  }
  const supabase = await createClient()
  const [overview, kpis, daily, heatmap] = await Promise.all([
    supabase.rpc('fn_analytics_overview', args),
    supabase.rpc('fn_analytics_conversations_kpis', args),
    supabase.rpc('fn_analytics_conversations_daily', args),
    supabase.rpc('fn_analytics_traffic_heatmap', args),
  ])
  const failed = [overview, kpis, daily, heatmap].find((result) => result.error)
  if (failed?.error) return { error: failed.error.message }

  return {
    data: {
      overview: (overview.data ?? {}) as Record<string, unknown>,
      kpis: (kpis.data ?? {}) as Record<string, unknown>,
      daily: (daily.data ?? []) as Array<Record<string, unknown>>,
      heatmap: (heatmap.data ?? {}) as AnalyticsReport['heatmap'],
    },
  }
}
