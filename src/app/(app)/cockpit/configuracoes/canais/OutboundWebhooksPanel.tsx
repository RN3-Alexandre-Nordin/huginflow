'use client'

import { useEffect, useState } from 'react'
import { Bell, Copy, Loader2, Plus, Trash2, Webhook } from 'lucide-react'
import {
  createEmpresaWebhook,
  deleteEmpresaWebhook,
  getEmpresaWebhookPreset,
  listEmpresaWebhookDeliveries,
  listEmpresaWebhooks,
  rotateEmpresaWebhookSecret,
  testEmpresaWebhook,
  updateEmpresaWebhook,
} from './webhook-actions'

type WebhookRow = {
  id: string
  nome: string
  url: string
  secret_hint: string
  events: string[]
  ativo: boolean
  created_at: string
}

type DeliveryRow = {
  id: string
  event: string
  success: boolean
  status_code: number | null
  error: string | null
  created_at: string
}

const EVENT_OPTIONS = [
  { id: 'channel.disconnected', label: 'Canal desconectado' },
  { id: 'channel.connected', label: 'Canal reconectado' },
] as const

export default function OutboundWebhooksPanel({ canManage }: { canManage: boolean }) {
  const [hooks, setHooks] = useState<WebhookRow[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [presetUrl, setPresetUrl] = useState<string | null>(null)
  const [presetMessage, setPresetMessage] = useState<string | null>(null)
  const [cnpj, setCnpj] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nome, setNome] = useState('Alarme WhatsApp')
  const [events, setEvents] = useState<string[]>(['channel.disconnected'])
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    const [hooksRes, deliveriesRes, presetRes] = await Promise.all([
      listEmpresaWebhooks(),
      listEmpresaWebhookDeliveries(12),
      getEmpresaWebhookPreset(),
    ])
    setHooks((hooksRes.data ?? []) as WebhookRow[])
    setDeliveries((deliveriesRes.data ?? []) as DeliveryRow[])
    if ('url' in presetRes) {
      setCnpj(presetRes.cnpj)
      setPresetUrl(presetRes.url)
      setPresetMessage(presetRes.message)
    } else {
      setPresetMessage(presetRes.error)
    }
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  function toggleEvent(id: string) {
    setEvents((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  async function handleCreate() {
    setSaving(true)
    setMessage(null)
    const result = await createEmpresaWebhook({ nome, events })
    setSaving(false)
    if (!result.success) {
      setMessage(result.error)
      return
    }
    setRevealedSecret(result.secret)
    setMessage('Webhook ativado com a URL exclusiva do CNPJ. Copie o secret agora.')
    await reload()
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value)
    setMessage('Copiado.')
  }

  return (
    <section className="rounded-3xl border border-[#ffffff10] bg-[#ffffff03] p-6 space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
          <Webhook className="w-5 h-5 text-amber-400" />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-black text-white uppercase tracking-tight italic flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            Webhooks de saída
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Cada cliente recebe uma URL exclusiva com o CNPJ da empresa. O outro sistema consulta
            essa URL com o secret. Não é possível repetir a mesma URL em empresas diferentes.
          </p>
        </div>
      </div>

      {presetUrl && (
        <div className="rounded-2xl border border-[#ffffff12] bg-[#0D0D0D] p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            URL exclusiva {cnpj ? `· CNPJ ${cnpj}` : ''}
          </p>
          <div className="flex items-start gap-2">
            <code className="flex-1 break-all text-xs text-amber-100">{presetUrl}</code>
            <button
              type="button"
              onClick={() => void copyText(presetUrl)}
              className="p-2 rounded-lg text-amber-200 hover:bg-[#ffffff10]"
              aria-label="Copiar URL"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {presetMessage && !presetUrl && <p className="text-xs text-amber-300">{presetMessage}</p>}

      {canManage && hooks.length === 0 && presetUrl && (
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-xl bg-[#0D0D0D] border border-[#ffffff12] px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate()}
            className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-200 hover:bg-amber-500/25 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Ativar webhook
          </button>
        </div>
      )}

      {canManage && hooks.length === 0 && presetUrl && (
        <div className="flex flex-wrap gap-3">
          {EVENT_OPTIONS.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={events.includes(option.id)}
                onChange={() => toggleEvent(option.id)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}

      {revealedSecret && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <p className="text-xs font-bold text-amber-100 uppercase tracking-widest">Secret (copie agora)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-xs text-amber-50">{revealedSecret}</code>
            <button
              type="button"
              onClick={() => void copyText(revealedSecret)}
              className="p-2 rounded-lg text-amber-200 hover:bg-[#ffffff10]"
              aria-label="Copiar secret"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {message && <p className="text-xs text-gray-400">{message}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando webhooks…</p>
      ) : hooks.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum webhook de saída cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {hooks.map((hook) => (
            <div
              key={hook.id}
              className="rounded-2xl border border-[#ffffff0c] bg-[#0D0D0D] p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{hook.nome}</p>
                <p className="text-xs text-gray-500 break-all">{hook.url}</p>
                <p className="text-[10px] text-gray-600 mt-1">
                  {hook.events.filter((event) => event !== 'webhook.ping').join(', ') || 'sem eventos'}
                  {' · '}secret {hook.secret_hint}
                  {hook.ativo ? '' : ' · pausado'}
                </p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await updateEmpresaWebhook({ id: hook.id, ativo: !hook.ativo })
                      await reload()
                    }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-[#ffffff15] text-gray-300 hover:text-white"
                  >
                    {hook.ativo ? 'Pausar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await testEmpresaWebhook(hook.id)
                      setMessage(result.success ? 'Ping enviado. Veja o log abaixo.' : result.error)
                      await reload()
                    }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-amber-500/30 text-amber-200"
                  >
                    Testar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await rotateEmpresaWebhookSecret(hook.id)
                      if (result.success) {
                        setRevealedSecret(result.secret)
                        setMessage('Novo secret gerado. Copie agora.')
                      } else {
                        setMessage(result.error)
                      }
                      await reload()
                    }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-[#ffffff15] text-gray-300"
                  >
                    Novo secret
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm('Excluir este webhook?')) return
                      await deleteEmpresaWebhook(hook.id)
                      await reload()
                    }}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"
                    aria-label="Excluir webhook"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Últimas entregas</p>
          {deliveries.map((row) => (
            <p key={row.id} className="text-xs text-gray-500">
              <span className={row.success ? 'text-emerald-400' : 'text-red-400'}>
                {row.success ? 'OK' : 'FALHA'}
              </span>
              {' · '}
              {row.event}
              {row.status_code != null ? ` · HTTP ${row.status_code}` : ''}
              {row.error ? ` · ${row.error}` : ''}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
