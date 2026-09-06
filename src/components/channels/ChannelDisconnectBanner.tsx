'use client'

import Link from 'next/link'
import { AlertTriangle, WifiOff } from 'lucide-react'
import type { ChannelDisconnectAlert } from '@/hooks/useChannelConnectionAlerts'

const PROVIDER_LABELS: Record<string, string> = {
  evolution: 'WhatsApp',
  zapi: 'WhatsApp',
  meta: 'WhatsApp Oficial',
  instagram: 'Instagram',
  email: 'E-mail',
}

type Props = {
  visible: boolean
  channels: ChannelDisconnectAlert[]
  isAdminOrSuperAdmin: boolean
}

/**
 * Tarja na base da área de conteúdo (não sob o menu lateral).
 * Some automaticamente quando o canal reconecta.
 */
export default function ChannelDisconnectBanner({
  visible,
  channels,
  isAdminOrSuperAdmin,
}: Props) {
  if (!visible || channels.length === 0) return null

  const names = channels.map((c) => c.nome).join(', ')
  const providers = Array.from(
    new Set(channels.map((c) => PROVIDER_LABELS[c.provider] ?? c.provider)),
  ).join(', ')

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative z-40 shrink-0 border-t border-red-500/50 bg-red-950 text-red-50 shadow-[0_-6px_24px_rgba(127,29,29,0.35)]"
    >
      <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-300">
          <WifiOff className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-bold text-red-100">
            <AlertTriangle className="hidden h-3.5 w-3.5 shrink-0 text-red-400 sm:inline" />
            <span className="uppercase tracking-wide">
              {channels.length === 1 ? 'Canal fora do ar' : `${channels.length} canais fora do ar`}
            </span>
            <span className="font-semibold text-red-200/90">· {providers}</span>
          </p>
          <p className="truncate text-xs text-red-200/80">
            {names}
            {' — '}
            mensagens podem não chegar até reconectar.
          </p>
        </div>
        {isAdminOrSuperAdmin ? (
          <Link
            href="/cockpit/configuracoes/canais"
            className="shrink-0 rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-50 transition-colors hover:bg-red-500/35"
          >
            Reconectar
          </Link>
        ) : null}
      </div>
    </div>
  )
}
