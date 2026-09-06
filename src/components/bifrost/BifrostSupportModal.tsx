'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Copy, Headphones, ListTodo, Loader2, X } from 'lucide-react'

export type BifrostEmbedMode = 'abrir-chamado' | 'meus-chamados'

type Props = {
  open: boolean
  onClose: () => void
  mode: BifrostEmbedMode
}

type EmbedPayload = {
  embedUrl: string
  bifrostOrigin: string
}

type SuccessInfo = {
  protocolo: string
  message: string
  chamadoId?: string
}

const MODE_META: Record<
  BifrostEmbedMode,
  { title: string; subtitle: string; next: string; listenCreate: boolean }
> = {
  'abrir-chamado': {
    title: 'Abrir chamado de suporte',
    subtitle: 'Bifrost · formulário embutido',
    next: '/embed/chamados/novo',
    listenCreate: true,
  },
  'meus-chamados': {
    title: 'Meus chamados',
    subtitle: 'Bifrost · lista e detalhes',
    next: '/embed/chamados',
    listenCreate: false,
  },
}

export default function BifrostSupportModal({ open, onClose, mode }: Props) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [iframeLoading, setIframeLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [embed, setEmbed] = useState<EmbedPayload | null>(null)
  const [success, setSuccess] = useState<SuccessInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const meta = MODE_META[mode]
  const HeaderIcon = mode === 'meus-chamados' ? ListTodo : Headphones

  useEffect(() => {
    setMounted(true)
  }, [])

  const clearIframeTimer = useCallback(() => {
    if (iframeTimerRef.current) {
      clearTimeout(iframeTimerRef.current)
      iframeTimerRef.current = null
    }
  }, [])

  const loadEmbed = useCallback(async () => {
    setLoading(true)
    setIframeLoading(false)
    setError(null)
    setEmbed(null)
    setSuccess(null)
    setCopied(false)
    clearIframeTimer()
    try {
      const res = await fetch('/api/bifrost/embed-token', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next: meta.next }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        embedUrl?: string
        bifrostOrigin?: string
        error?: string
      }
      if (!res.ok || !data.embedUrl || !data.bifrostOrigin) {
        throw new Error(data.error || 'Não foi possível abrir o suporte.')
      }
      setEmbed({ embedUrl: data.embedUrl, bifrostOrigin: data.bifrostOrigin })
      setIframeLoading(true)
      iframeTimerRef.current = setTimeout(() => {
        setIframeLoading(false)
        setError(
          'O Bifrost demorou para responder no iframe. Confira se o sistema hugin_flow está cadastrado com o JWKS atual de app.huginflow.com e se o Bifrost não redireciona para URL inválida (0.0.0.0).',
        )
      }, 20000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao abrir suporte'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [meta.next, clearIframeTimer])

  useEffect(() => {
    if (!open) {
      setEmbed(null)
      setError(null)
      setSuccess(null)
      setCopied(false)
      setIframeLoading(false)
      clearIframeTimer()
      return
    }
    void loadEmbed()
    return () => clearIframeTimer()
  }, [open, mode, loadEmbed, clearIframeTimer])

  useEffect(() => {
    if (!open || !embed?.bifrostOrigin || success || !meta.listenCreate) return

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== embed.bifrostOrigin) return
      const data = event.data as {
        source?: string
        type?: string
        chamadoId?: string
        protocolo?: string
        message?: string
      } | null

      if (data?.source !== 'bifrost' || data?.type !== 'chamado-criado') return

      const protocolo = (data.protocolo || '').trim()
      const message =
        (data.message || '').trim() ||
        (protocolo
          ? `Chamado ${protocolo} aberto com sucesso.`
          : 'Chamado aberto com sucesso.')

      setSuccess({
        protocolo: protocolo || '—',
        message,
        chamadoId: data.chamadoId,
      })
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [open, embed?.bifrostOrigin, success, meta.listenCreate])

  useEffect(() => {
    if (!open) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEscape)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEscape)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const copyProtocolo = useCallback(async () => {
    if (!success?.protocolo || success.protocolo === '—') return
    try {
      await navigator.clipboard.writeText(success.protocolo)
      setCopied(true)
    } catch {
      window.alert(`Protocolo: ${success.protocolo}`)
    }
  }, [success])

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bifrost-support-title"
        className="bg-[#0F0F0F] border border-[#ffffff12] rounded-2xl w-full max-w-3xl h-[min(88vh,720px)] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#ffffff08] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#2BAADF]/15 border border-[#2BAADF]/25 flex items-center justify-center shrink-0">
              <HeaderIcon className="w-4 h-4 text-[#2BAADF]" />
            </div>
            <div className="min-w-0">
              <h3 id="bifrost-support-title" className="text-sm font-black text-white truncate">
                {meta.title}
              </h3>
              <p className="text-[10px] text-gray-500 truncate">{meta.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-[#ffffff08]"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 relative bg-[#0a0a0a] min-h-0">
          {(loading || iframeLoading) && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400 z-10 pointer-events-none">
              <Loader2 className="w-7 h-7 animate-spin text-[#2BAADF]" />
              <p className="text-xs font-medium">
                {loading ? 'Preparando sessão segura…' : 'Carregando Bifrost…'}
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center z-10">
              <p className="text-sm text-red-400 max-w-md">{error}</p>
              <button
                type="button"
                onClick={() => void loadEmbed()}
                className="px-4 py-2 rounded-lg bg-[#2BAADF] text-white text-xs font-bold hover:bg-[#2390c0]"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {!loading && embed?.embedUrl && !success && !error && (
            <iframe
              ref={iframeRef}
              title={meta.title}
              src={embed.embedUrl}
              className="w-full h-full border-0"
              allow="clipboard-write"
              onLoad={() => {
                clearIframeTimer()
                setIframeLoading(false)
              }}
            />
          )}

          {success && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#0a0a0a]/95 p-6 text-center animate-in fade-in zoom-in-95 duration-200"
              role="status"
              aria-live="polite"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div className="max-w-md space-y-2">
                <p className="text-base font-black text-white">{success.message}</p>
                <p className="text-xs text-gray-500">
                  Guarde o protocolo para acompanhar o atendimento.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#ffffff12] bg-[#141414] px-4 py-2.5">
                <span className="font-mono text-sm font-bold tracking-wide text-[#2BAADF]">
                  {success.protocolo}
                </span>
                {success.protocolo !== '—' ? (
                  <button
                    type="button"
                    onClick={() => void copyProtocolo()}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-400 hover:bg-[#ffffff08] hover:text-white"
                    title="Copiar protocolo"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-5 py-2.5 rounded-lg bg-[#2BAADF] text-white text-sm font-bold hover:bg-[#2390c0]"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
