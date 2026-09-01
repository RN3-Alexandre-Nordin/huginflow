/** Status que indicam canal conectado e operacional. */
export const CHANNEL_CONNECTED_STATUSES = ['connected', 'open'] as const

/** Status de perda de conexão com o provedor (diferente de desligamento manual `inactive`). */
export const CHANNEL_DISCONNECTED_STATUS = 'disconnected'

const MONITORED_PROVIDERS = new Set(['evolution', 'zapi', 'meta', 'instagram', 'email'])

export function isMonitoredInboundProvider(provider: string | null | undefined): boolean {
  if (!provider) return false
  return MONITORED_PROVIDERS.has(provider)
}

export function isChannelConnectedStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return (CHANNEL_CONNECTED_STATUSES as readonly string[]).includes(status)
}

export function shouldAlertChannelDisconnect(
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined,
  provider: string | null | undefined,
): boolean {
  if (!isMonitoredInboundProvider(provider)) return false
  if (newStatus !== CHANNEL_DISCONNECTED_STATUS) return false
  return isChannelConnectedStatus(oldStatus)
}

export function shouldShowChannelInDisconnectAlert(
  status: string | null | undefined,
  provider: string | null | undefined,
): boolean {
  if (!isMonitoredInboundProvider(provider)) return false
  return status === CHANNEL_DISCONNECTED_STATUS
}
