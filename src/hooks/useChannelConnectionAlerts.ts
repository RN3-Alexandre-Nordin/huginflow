'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
  isChannelConnectedStatus,
  shouldAlertChannelDisconnect,
  shouldShowChannelInDisconnectAlert,
} from '@/lib/omnichannel/channel-connection'

export type ChannelDisconnectAlert = {
  id: string
  nome: string
  provider: string
}

function mergeAlerts(
  current: ChannelDisconnectAlert[],
  incoming: ChannelDisconnectAlert[],
): ChannelDisconnectAlert[] {
  const map = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) {
    map.set(item.id, item)
  }
  return Array.from(map.values())
}

export function useChannelConnectionAlerts(empresaId?: string) {
  const [alerts, setAlerts] = useState<ChannelDisconnectAlert[]>([])
  const [ready, setReady] = useState(false)
  const statusByChannelRef = useRef<Map<string, string>>(new Map())

  const loadDisconnectedChannels = useCallback(async () => {
    if (!empresaId) {
      setAlerts([])
      setReady(true)
      return
    }

    const supabase = createClient()
    const { data, error } = await supabase
      .from('crm_canais')
      .select('id, nome, provider, status')
      .eq('empresa_id', empresaId)

    if (error) {
      console.error('[ChannelConnectionAlerts] Falha ao carregar canais:', error.message)
      setReady(true)
      return
    }

    const statusMap = new Map<string, string>()
    for (const row of data ?? []) {
      statusMap.set(row.id, row.status)
    }
    statusByChannelRef.current = statusMap

    const disconnected = (data ?? [])
      .filter((row) => shouldShowChannelInDisconnectAlert(row.status, row.provider))
      .map((row) => ({
        id: row.id,
        nome: row.nome,
        provider: row.provider,
      }))

    setAlerts(disconnected)
    setReady(true)
  }, [empresaId])

  useEffect(() => {
    void loadDisconnectedChannels()
  }, [loadDisconnectedChannels])

  useEffect(() => {
    if (!empresaId || !ready) return

    const supabase = createClient()

    const channel = supabase
      .channel(`cockpit-channel-status-${empresaId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crm_canais',
          filter: `empresa_id=eq.${empresaId}`,
        },
        (payload) => {
          const newRow = payload.new as {
            id: string
            nome: string
            provider: string
            status: string
          }

          const previousStatus = statusByChannelRef.current.get(newRow.id)
          statusByChannelRef.current.set(newRow.id, newRow.status)

          if (shouldAlertChannelDisconnect(previousStatus, newRow.status, newRow.provider)) {
            setAlerts((current) =>
              mergeAlerts(current, [
                { id: newRow.id, nome: newRow.nome, provider: newRow.provider },
              ]),
            )
            return
          }

          if (isChannelConnectedStatus(newRow.status)) {
            setAlerts((current) => current.filter((item) => item.id !== newRow.id))
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [empresaId, ready])

  const clearAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  const hasAlerts = alerts.length > 0

  return useMemo(
    () => ({
      alerts,
      hasAlerts,
      ready,
      clearAlerts,
      reload: loadDisconnectedChannels,
    }),
    [alerts, hasAlerts, ready, clearAlerts, loadDisconnectedChannels],
  )
}
