'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { format } from 'date-fns'
import { Bot, Loader2, MessageCircle, Send, User } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { sendOmniMessage } from '@/app/(app)/cockpit/crm/omni-actions'
import {
  getOmniConversaBySessao,
  getOmniMensagens,
  getSessaoIdByCardId,
} from '@/app/(app)/cockpit/crm/omni-chat-actions'
import { stripOutboundTags } from '@/lib/omnichannel/triage/parseTriageTags'
import StartOmniConversationPanel from '@/components/kanban/StartOmniConversationPanel'

type Mensagem = {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system'
  created_at: string
  user_id?: string
  metadata?: {
    is_ai?: boolean
    sent_by?: string
    media_type?: string
    transcription?: { status?: string; text?: string }
    document?: { status?: string; resumo?: string }
    file_name?: string
  } | null
  usuarios?: { nome_completo: string } | null
}

type Props = {
  cardId: string
  pipelineId: string
  conversaId?: string | null
  leadName?: string | null
  onCancel: () => void
}

function formatMessageContent(msg: Mensagem): string {
  const meta = msg.metadata
  if (meta?.media_type === 'audio') {
    const text = meta.transcription?.text
    if (text) return `🎤 ${text}`
    return msg.content || '🎤 Áudio'
  }
  if (meta?.media_type === 'document' || meta?.media_type === 'image') {
    if (meta.document?.resumo) return `📎 ${meta.document.resumo}`
    const fileName = meta.file_name
    if (fileName) return msg.content || `📎 ${fileName}`
  }
  if (msg.role === 'assistant' || msg.role === 'system') {
    return stripOutboundTags(msg.content)
  }
  return msg.content
}

function getResponderLabel(msg: Mensagem): string | null {
  if (msg.role === 'user') return null
  if (msg.role === 'system') return 'Sistema'
  const isAi =
    msg.metadata?.is_ai === true ||
    (msg.role === 'assistant' && !msg.user_id && !msg.metadata?.sent_by)
  if (isAi) return 'Agente de IA'
  if (msg.usuarios?.nome_completo) return msg.usuarios.nome_completo
  return 'Atendente'
}

export default function CardWhatsAppPanel({
  cardId,
  pipelineId,
  conversaId,
  leadName,
  onCancel,
}: Props) {
  const [sessaoId, setSessaoId] = useState<string | null>(conversaId ?? null)
  const [loading, setLoading] = useState(true)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [leadDisplayName, setLeadDisplayName] = useState(leadName || 'Contato')
  const [inputMessage, setInputMessage] = useState('')
  const [isSending, startSendTransition] = useTransition()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const loadThread = useCallback(async (sid: string) => {
    const [msgRes, convRes] = await Promise.all([
      getOmniMensagens(sid),
      getOmniConversaBySessao(sid),
    ])
    if (msgRes.data) setMensagens(msgRes.data as Mensagem[])
    const lead = (convRes.data as { crm_leads?: { nome?: string } })?.crm_leads
    if (lead?.nome) setLeadDisplayName(lead.nome)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      let sid = conversaId ?? null
      if (!sid) {
        const res = await getSessaoIdByCardId(cardId)
        sid = res.data ?? null
      }
      if (cancelled) return
      setSessaoId(sid)
      if (sid) await loadThread(sid)
      setLoading(false)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [cardId, conversaId, loadThread])

  useEffect(() => {
    if (!sessaoId) return

    const channel = supabase
      .channel(`card-wa-${cardId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crm_interacoes',
          filter: `conversa_id=eq.${sessaoId}`,
        },
        () => {
          loadThread(sessaoId)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cardId, sessaoId, loadThread, supabase])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  const handleSend = () => {
    const text = inputMessage.trim()
    if (!text || !sessaoId) return
    startSendTransition(async () => {
      const res = await sendOmniMessage(sessaoId, text)
      if (!res.success) {
        alert(res.error || 'Erro ao enviar')
        return
      }
      setInputMessage('')
      await loadThread(sessaoId)
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
        <p className="text-[11px] text-gray-500 uppercase font-black tracking-widest">Carregando WhatsApp…</p>
      </div>
    )
  }

  if (!sessaoId) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Este card ainda não tem conversa WhatsApp. Vincule um lead cadastrado e envie a mensagem inicial.
        </p>
        <StartOmniConversationPanel
          cardId={cardId}
          pipelineId={pipelineId}
          conversaId={null}
        />
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#ffffff08] text-gray-400 hover:text-white"
        >
          Voltar
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[min(520px,60vh)] animate-in fade-in duration-200">
      <div className="flex items-center gap-3 pb-3 border-b border-[#ffffff0a] shrink-0">
        <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-green-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{leadDisplayName}</p>
          <p className="text-[10px] text-gray-500">Histórico completo da conversa</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 custom-scrollbar min-h-0">
        {mensagens.length === 0 ? (
          <p className="text-center text-[11px] text-gray-600 py-8 italic">Nenhuma mensagem ainda.</p>
        ) : (
          mensagens.map((msg) => {
            const responderLabel = getResponderLabel(msg)
            const isAi = responderLabel === 'Agente de IA'
            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div className="max-w-[85%]">
                  <div
                    className={`flex items-center gap-1.5 mb-1 px-0.5 ${msg.role === 'user' ? '' : 'flex-row-reverse'}`}
                  >
                    {responderLabel && (
                      <span
                        className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 ${
                          isAi ? 'text-[#80B828]' : 'text-[#2BAADF]'
                        }`}
                      >
                        {isAi ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {responderLabel}
                      </span>
                    )}
                    <span className="text-[9px] text-gray-600 font-mono">
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </span>
                  </div>
                  <div
                    className={`p-3 rounded-2xl text-[13px] leading-relaxed border ${
                      msg.role === 'user'
                        ? 'bg-[#1A1A1A] text-gray-200 border-[#ffffff0a] rounded-tl-none'
                        : 'bg-gradient-to-br from-green-600 to-green-700 text-white border-green-500/20 rounded-tr-none'
                    }`}
                  >
                    {formatMessageContent(msg)}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="pt-3 border-t border-[#ffffff0a] shrink-0 space-y-2">
        <textarea
          rows={2}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Digite sua mensagem…"
          disabled={isSending}
          className="w-full bg-[#050505] border border-[#ffffff10] focus:border-green-500/40 rounded-xl p-3 text-sm text-white outline-none resize-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending || !inputMessage.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#ffffff08] text-gray-400 hover:text-white"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  )
}
