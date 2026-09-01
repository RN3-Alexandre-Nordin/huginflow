'use client'

import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AlertTriangle, MessageSquare, X } from 'lucide-react'
import type { ChannelDisconnectAlert } from '@/hooks/useChannelConnectionAlerts'

const PROVIDER_LABELS: Record<string, string> = {
  evolution: 'WhatsApp (Evolution)',
  zapi: 'WhatsApp (Z-API)',
  meta: 'WhatsApp Oficial',
  instagram: 'Instagram',
  email: 'E-mail',
}

type Props = {
  isOpen: boolean
  channels: ChannelDisconnectAlert[]
  isAdminOrSuperAdmin: boolean
  onDismiss: () => void
}

export default function ChannelDisconnectModal({
  isOpen,
  channels,
  isAdminOrSuperAdmin,
  onDismiss,
}: Props) {
  if (!isOpen || channels.length === 0 || typeof document === 'undefined') return null

  const channelList = channels.map((channel) => ({
    ...channel,
    label: PROVIDER_LABELS[channel.provider] ?? channel.provider,
  }))

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#000000e6] p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="channel-disconnect-title"
      aria-describedby="channel-disconnect-description"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-red-500/30 bg-[#111111] shadow-2xl">
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-red-600/10 blur-[80px]" />

        <div className="relative border-b border-[#ffffff0a] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="channel-disconnect-title"
                className="text-xl font-black tracking-tight text-white uppercase italic"
              >
                Canal inbound desconectado
              </h2>
              <p
                id="channel-disconnect-description"
                className="mt-2 text-sm leading-relaxed text-gray-400"
              >
                {channelList.length === 1
                  ? 'Um canal ativo perdeu a conexão com o provedor. Mensagens podem deixar de chegar até a reconexão.'
                  : `${channelList.length} canais ativos perderam a conexão. Mensagens podem deixar de chegar até a reconexão.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 rounded-full p-2 text-gray-500 transition-colors hover:bg-[#ffffff0a] hover:text-white"
              aria-label="Fechar aviso"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative max-h-[40vh] space-y-3 overflow-y-auto p-6">
          {channelList.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3"
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-red-400" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{channel.nome}</p>
                <p className="text-xs text-gray-500">{channel.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex flex-col gap-3 border-t border-[#ffffff0a] p-6 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-[#ffffff10] px-5 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-[#ffffff08] hover:text-white"
          >
            Entendi por agora
          </button>
          {isAdminOrSuperAdmin ? (
            <Link
              href="/cockpit/configuracoes/canais"
              onClick={onDismiss}
              className="rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-5 py-3 text-center text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              Reconectar canais
            </Link>
          ) : (
            <p className="text-center text-xs text-gray-500 sm:text-right">
              Solicite a um administrador que refaça a conexão em Canais Inbound.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
