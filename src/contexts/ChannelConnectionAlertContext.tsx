'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  useChannelConnectionAlerts,
  type ChannelDisconnectAlert,
} from '@/hooks/useChannelConnectionAlerts'
import ChannelDisconnectModal from '@/components/channels/ChannelDisconnectModal'

type ChannelConnectionAlertContextValue = {
  alerts: ChannelDisconnectAlert[]
  hasAlerts: boolean
}

const ChannelConnectionAlertContext = createContext<ChannelConnectionAlertContextValue>({
  alerts: [],
  hasAlerts: false,
})

export function ChannelConnectionAlertProvider({
  empresaId,
  isAdminOrSuperAdmin,
  children,
}: {
  empresaId?: string
  isAdminOrSuperAdmin: boolean
  children: React.ReactNode
}) {
  const { alerts, hasAlerts, ready } = useChannelConnectionAlerts(empresaId)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (hasAlerts) setDismissed(false)
  }, [hasAlerts, alerts])

  const showModal = ready && hasAlerts && !dismissed

  return (
    <ChannelConnectionAlertContext.Provider value={{ alerts, hasAlerts }}>
      {children}
      <ChannelDisconnectModal
        isOpen={showModal}
        channels={alerts}
        isAdminOrSuperAdmin={isAdminOrSuperAdmin}
        onDismiss={() => setDismissed(true)}
      />
    </ChannelConnectionAlertContext.Provider>
  )
}

export function useChannelConnectionAlertsContext() {
  return useContext(ChannelConnectionAlertContext)
}
