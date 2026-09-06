'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  useChannelConnectionAlerts,
  type ChannelDisconnectAlert,
} from '@/hooks/useChannelConnectionAlerts'
import ChannelDisconnectModal from '@/components/channels/ChannelDisconnectModal'
import ChannelDisconnectBanner from '@/components/channels/ChannelDisconnectBanner'

type ChannelConnectionAlertContextValue = {
  alerts: ChannelDisconnectAlert[]
  hasAlerts: boolean
  showBanner: boolean
  isAdminOrSuperAdmin: boolean
}

const ChannelConnectionAlertContext = createContext<ChannelConnectionAlertContextValue>({
  alerts: [],
  hasAlerts: false,
  showBanner: false,
  isAdminOrSuperAdmin: false,
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
  const showBanner = ready && hasAlerts && dismissed

  const value = useMemo(
    () => ({ alerts, hasAlerts, showBanner, isAdminOrSuperAdmin }),
    [alerts, hasAlerts, showBanner, isAdminOrSuperAdmin],
  )

  return (
    <ChannelConnectionAlertContext.Provider value={value}>
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

/** Renderizar dentro de `<main>` para a tarja não ficar sob o menu. */
export function ChannelDisconnectBannerSlot() {
  const { alerts, showBanner, isAdminOrSuperAdmin } = useChannelConnectionAlertsContext()
  return (
    <ChannelDisconnectBanner
      visible={showBanner}
      channels={alerts}
      isAdminOrSuperAdmin={isAdminOrSuperAdmin}
    />
  )
}

export function useChannelConnectionAlertsContext() {
  return useContext(ChannelConnectionAlertContext)
}
