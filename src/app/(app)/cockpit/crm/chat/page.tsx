'use client'

import { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/utils/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  Search, MessageSquare, Bot, User, 
  Send, Phone, Navigation, PanelRight, 
  Paperclip, Smile, ShieldCheck, Loader2,
  X, ChevronUp, ChevronDown, Trash2,
} from 'lucide-react'
import { format } from 'date-fns'
import { sendOmniMessage, sendOmniAttachment, deleteOmniMessage } from '../omni-actions'
import {
  getOmniConversas,
  getOmniMensagens,
  getOmniConversaBySessao,
  getSessaoIdByCardId,
  getLinkedCardBySessao,
  getCardForOmniRedirect,
  getOmniCustomerContext,
  type OmniCustomerContext,
} from '../omni-chat-actions'
import { OMNI_SESSAO_STORAGE_KEY } from '@/lib/omni/chat-deep-link'
import { isOmniMessageDeleted, markOmniMetadataDeleted } from '@/lib/omnichannel/omni-message-deleted'
import { DOCUMENT_MAX_BYTES } from '@/lib/omnichannel/document-constants'
import { stripOutboundTags } from '@/lib/omnichannel/triage/parseTriageTags'
import { maskPhone } from '@/utils/brasilian-formatters'
import { hasPermission } from '@/utils/permissions'
import ChatCardRedirectModal from '@/components/omni/ChatCardRedirectModal'
import OmniCustomerContextPanel from '@/components/omni/OmniCustomerContextPanel'
import CardConsultaDrawer from '@/components/crm/CardConsultaDrawer'

interface Conversa {
  id: string
  sessao_id?: string
  status: 'ai' | 'human' | 'closed'
  last_message: string
  updated_at: string
  /** Última mensagem da sessão (crm_conversas). */
  role?: 'user' | 'assistant' | 'system' | string | null
  direcao?: 'inbound' | 'outbound' | string | null
  crm_leads: {
    nome: string
    telefone: string
    whatsapp: string
  }
}

/** Verde = cliente ainda sem resposta; laranja = já respondida (IA ou humano). */
function conversaAwaitingReply(chat: Conversa): boolean {
  if (chat.direcao === 'inbound' || chat.role === 'user') return true
  if (chat.direcao === 'outbound' || chat.role === 'assistant') return false
  // Sem metadado: status ai costuma ser fila ainda não tratada pelo humano
  return chat.status === 'ai'
}

function leadInitials(nome?: string | null): string {
  const parts = (nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

/** Exibe telefone BR legível (aceita 55 + DDD + número). */
function formatLeadPhone(telefone?: string | null, whatsapp?: string | null): string {
  const raw = (whatsapp || telefone || '').trim()
  if (!raw) return 'Sem telefone'
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2)
  if (digits.length >= 10 && digits.length <= 11) return maskPhone(digits)
  return raw
}

function LeadListAvatar({
  nome,
  awaitingReply,
}: {
  nome?: string | null
  awaitingReply: boolean
}) {
  return (
    <div
      className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-[#ffffff12] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
      aria-hidden
    >
      <span
        className={`text-[11px] font-black tracking-tight ${
          awaitingReply ? 'text-[#80B828]' : 'text-orange-500'
        }`}
      >
        {leadInitials(nome)}
      </span>
    </div>
  )
}

function conversaMatchesSessao(conversa: Conversa, sessaoId: string): boolean {
  return conversa.id === sessaoId || conversa.sessao_id === sessaoId
}

function readStoredSessao(): string | null {
  try {
    return sessionStorage.getItem(OMNI_SESSAO_STORAGE_KEY)
  } catch {
    return null
  }
}

function clearStoredSessao(): void {
  try {
    sessionStorage.removeItem(OMNI_SESSAO_STORAGE_KEY)
  } catch {
    // ignore
  }
}

interface Mensagem {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system'
  created_at: string
  conversa_id: string
  user_id?: string
  metadata?: {
    is_ai?: boolean
    sent_by?: string
    media_type?: string
    file_name?: string
    transcription?: {
      status?: 'pending' | 'completed' | 'failed'
      text?: string
      error?: string
    }
    document?: {
      status?: string
      resumo?: string
    }
    deleted?: boolean
    whatsapp_deleted?: boolean
    original_content?: string
    sent_by?: string
  } | null
  usuarios?: {
    nome_completo: string
  } | null
}

function formatMessageContent(msg: Mensagem): string {
  const meta = msg.metadata
  if (meta?.media_type === 'audio') {
    const status = meta.transcription?.status
    if (status === 'pending') {
      return msg.content || '🎤 Áudio recebido — transcrevendo…'
    }
    if (status === 'failed') {
      return msg.content || 'Recebi seu áudio, mas não consegui transcrever.'
    }
    const text = meta.transcription?.text
    if (text) return `🎤 ${text}`
  }
  if (meta?.media_type === 'document' || meta?.media_type === 'image') {
    const doc = meta.document
    if (doc?.status === 'pending') return msg.content || '📎 Documento recebido — processando…'
    if (doc?.resumo) return `📎 ${doc.resumo}`
    const fileName = meta.file_name
    if (fileName) return msg.content || `📎 ${fileName}`
  }
  if (msg.role === 'assistant' || msg.role === 'system') {
    return stripOutboundTags(msg.content)
  }
  return msg.content
}

function canDeleteOmniMessage(msg: Mensagem, profile: { id?: string; role_global?: string } | null): boolean {
  if (!profile || msg.role === 'user') return false
  if (isOmniMessageDeleted(msg.metadata)) return false
  if (profile.role_global && profile.role_global !== 'operador') return true
  return msg.user_id === profile.id || msg.metadata?.sent_by === profile.id
}

const DELETED_MSG_STORAGE_KEY = 'huginflow.omni.deleted-message-ids'

function readDeletedMessageIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = sessionStorage.getItem(DELETED_MSG_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function rememberDeletedMessageId(id: string) {
  const ids = readDeletedMessageIds()
  ids.add(id)
  sessionStorage.setItem(DELETED_MSG_STORAGE_KEY, JSON.stringify([...ids]))
}

function applyDeletedFlags(rows: Mensagem[]): Mensagem[] {
  const remembered = readDeletedMessageIds()
  return rows.map((row) => {
    if (isOmniMessageDeleted(row.metadata) || !remembered.has(row.id)) return row
    return {
      ...row,
      metadata: markOmniMetadataDeleted(row.metadata),
    }
  })
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

function ChatLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-200px)]">
      <div className="w-10 h-10 border-4 border-[#2BAADF]/20 border-t-[#2BAADF] rounded-full animate-spin" />
    </div>
  )
}

const OMNI_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '😉', '😍', '🥰', '😘', '😗', '😋', '😛', '😜', '🤪',
  '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔',
  '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭',
  '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨',
  '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄',
  '😴', '🤤', '😪', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥴',
  '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '🤝',
  '🙏', '💪', '🫶', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤',
  '🤍', '💔', '💯', '✨', '🔥', '⭐', '🎉', '✅', '❌', '⚠️',
  '📌', '📎', '📷', '📱', '💬', '👋', '🙏', '💸', '📄', '📦',
] as const

function ChatOmnichannelInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessaoParam = searchParams.get('sessao')
  const cardParam = searchParams.get('card')

  const [conversas, setConversas] = useState<Conversa[]>([])
  const [selectedChat, setSelectedChat] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [threadSearchOpen, setThreadSearchOpen] = useState(false)
  const [threadSearchQuery, setThreadSearchQuery] = useState('')
  const [threadMatchIndex, setThreadMatchIndex] = useState(0)
  const [inputMessage, setInputMessage] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [emojiPickerPos, setEmojiPickerPos] = useState({ left: 12, bottom: 80 })
  const [isSending, setIsSending] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [linkedCard, setLinkedCard] = useState<{ id: string; titulo: string } | null>(null)
  const [redirectOpen, setRedirectOpen] = useState(false)
  const [redirectLoading, setRedirectLoading] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [customerContext, setCustomerContext] = useState<OmniCustomerContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)
  const [consultaCardId, setConsultaCardId] = useState<string | null>(null)
  const [redirectCtx, setRedirectCtx] = useState<{
    card: {
      id: string
      titulo: string
      cliente_nome?: string | null
      valor?: number | null
      descricao?: string | null
      observacao?: string | null
      responsavel_id?: string | null
      data_prazo?: string | null
      stage_id: string
      lead_id?: string | null
    }
    pipelineId: string
    pipelineName: string
    stages: { id: string; nome: string; ordem?: number | null }[]
  } | null>(null)

  const canEditCards = profile ? hasPermission(profile, 'cards', 'edit') : false
  const encaminharCardTitulo =
    linkedCard?.titulo ??
    customerContext?.currentSessionCard?.titulo ??
    'card do atendimento'

  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const threadSearchInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const targetSessaoRef = useRef<string | null>(null)
  const selectedChatRef = useRef<Conversa | null>(null)
  const selectingRef = useRef(false)
  const userPickedSessaoRef = useRef(false)
  const syncingUrlFromPickRef = useRef(false)

  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

  // Pesquisa só na conversa aberta — limpa ao trocar de chat
  useEffect(() => {
    setThreadSearchOpen(false)
    setThreadSearchQuery('')
    setThreadMatchIndex(0)
    setEmojiPickerOpen(false)
  }, [selectedChat?.id])

  useEffect(() => {
    if (!emojiPickerOpen) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (emojiPickerRef.current?.contains(target)) return
      if (emojiButtonRef.current?.contains(target)) return
      setEmojiPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [emojiPickerOpen])

  useLayoutEffect(() => {
    if (!emojiPickerOpen) return
    const place = () => {
      const btn = emojiButtonRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const width = 288
      let left = r.left
      if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12
      if (left < 12) left = 12
      setEmojiPickerPos({
        left,
        bottom: Math.max(12, window.innerHeight - r.top + 8),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [emojiPickerOpen])

  useEffect(() => {
    if (threadSearchOpen) {
      const t = window.setTimeout(() => threadSearchInputRef.current?.focus(), 50)
      return () => window.clearTimeout(t)
    }
  }, [threadSearchOpen])

  const threadSearchNeedle = threadSearchQuery.trim().toLowerCase()
  const threadMatchIds = useMemo(() => {
    if (!threadSearchNeedle) return [] as string[]
    return mensagens
      .filter((msg) => formatMessageContent(msg).toLowerCase().includes(threadSearchNeedle))
      .map((msg) => msg.id)
  }, [mensagens, threadSearchNeedle])

  useEffect(() => {
    setThreadMatchIndex(0)
  }, [threadSearchNeedle, selectedChat?.id])

  useEffect(() => {
    if (!threadSearchOpen || threadMatchIds.length === 0) return
    const id = threadMatchIds[Math.min(threadMatchIndex, threadMatchIds.length - 1)]
    const el = document.getElementById(`omni-msg-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [threadSearchOpen, threadMatchIds, threadMatchIndex])

  // Sincroniza alvo de deep link: ?sessao= > sessionStorage (click no card)
  useLayoutEffect(() => {
    if (syncingUrlFromPickRef.current) {
      syncingUrlFromPickRef.current = false
      return
    }

    if (sessaoParam) {
      targetSessaoRef.current = sessaoParam
      userPickedSessaoRef.current = false
      clearStoredSessao()
      return
    }

    if (cardParam) {
      userPickedSessaoRef.current = false
      return
    }

    const stored = readStoredSessao()
    if (stored) {
      targetSessaoRef.current = stored
      userPickedSessaoRef.current = false
      clearStoredSessao()
    }
  }, [sessaoParam, cardParam])

  const selectChatManually = useCallback(
    (chat: Conversa) => {
      userPickedSessaoRef.current = true
      targetSessaoRef.current = null
      setSelectedChat(chat)

      const params = new URLSearchParams(searchParams.toString())
      params.set('sessao', chat.id)
      params.delete('card')
      syncingUrlFromPickRef.current = true
      router.replace(`/cockpit/crm/chat?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const resolveSessaoFromUrl = useCallback(async (list: Conversa[], sessaoId: string): Promise<boolean> => {
    const inList = list.find((c) => conversaMatchesSessao(c, sessaoId))
    if (inList) {
      setSelectedChat(inList)
      return true
    }

    const res = await getOmniConversaBySessao(sessaoId)
    if (res.data) {
      const conv = res.data as Conversa
      setConversas((prev) => {
        if (prev.some((c) => conversaMatchesSessao(c, sessaoId))) return prev
        return [conv, ...prev]
      })
      setSelectedChat(conv)
      return true
    }

    return false
  }, [])

  const tryAutoSelect = useCallback(async (list: Conversa[]): Promise<boolean> => {
    if (selectingRef.current || userPickedSessaoRef.current) return false
    selectingRef.current = true
    try {
      let sessaoId = targetSessaoRef.current ?? sessaoParam

      if (!sessaoId && cardParam) {
        const cardRes = await getSessaoIdByCardId(cardParam)
        if (cardRes.data) {
          sessaoId = cardRes.data
          targetSessaoRef.current = sessaoId
        }
      }

      if (!sessaoId) return false

      if (selectedChatRef.current && conversaMatchesSessao(selectedChatRef.current, sessaoId)) {
        targetSessaoRef.current = null
        return true
      }

      const resolved = await resolveSessaoFromUrl(list, sessaoId)
      if (resolved) targetSessaoRef.current = null
      return resolved
    } finally {
      selectingRef.current = false
    }
  }, [sessaoParam, cardParam, resolveSessaoFromUrl])

  async function fetchConversas(me: any, options?: { applyAutoSelect?: boolean }) {
    const { data, error } = await getOmniConversas()
    if (error) console.error('[Chat] Erro ao listar conversas:', error)
    const list = data || []
    setConversas(list)
    if (options?.applyAutoSelect) {
      await tryAutoSelect(list)
    }
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: me } = await supabase
        .from('usuarios')
        .select('*, grupos_acesso(is_admin, permissoes)')
        .eq('auth_user_id', user.id)
        .single()
      
      setProfile(me)
      if (me) fetchConversas(me, { applyAutoSelect: true })
    }
    init()
  }, [])

  // Deep link externo (?sessao= / ?card=) — não reexecutar a cada refresh da lista
  useEffect(() => {
    if (loading) return
    if (userPickedSessaoRef.current) return
    if (!sessaoParam && !cardParam && !targetSessaoRef.current) return
    void tryAutoSelect(conversas)
  }, [loading, sessaoParam, cardParam, tryAutoSelect, conversas.length])

  useEffect(() => {
    if (!profile) return

    const isSuperadmin = profile.role_global === 'superadmin'
    const interacoesFilter = isSuperadmin
      ? undefined
      : `empresa_id=eq.${profile.empresa_id}`
    const conversasFilter = isSuperadmin
      ? undefined
      : `empresa_id=eq.${profile.empresa_id}`

    const channel = supabase.channel('chat-updates')

    const interacoesInsertConfig: {
      event: 'INSERT'
      schema: 'public'
      table: 'crm_interacoes'
      filter?: string
    } = {
      event: 'INSERT',
      schema: 'public',
      table: 'crm_interacoes',
    }
    if (interacoesFilter) interacoesInsertConfig.filter = interacoesFilter

    channel.on('postgres_changes', interacoesInsertConfig, (payload) => {
      const row = payload.new as { conversa_id?: string; empresa_id?: string }
      if (!isSuperadmin && row.empresa_id !== profile.empresa_id) return
      if (selectedChatRef.current && row.conversa_id === selectedChatRef.current.id) {
        fetchMensagens(selectedChatRef.current.id)
      }
      fetchConversas(profile)
    })

    const interacoesUpdateConfig: {
      event: 'UPDATE'
      schema: 'public'
      table: 'crm_interacoes'
      filter?: string
    } = {
      event: 'UPDATE',
      schema: 'public',
      table: 'crm_interacoes',
    }
    if (interacoesFilter) interacoesUpdateConfig.filter = interacoesFilter

    channel.on('postgres_changes', interacoesUpdateConfig, (payload) => {
      const row = payload.new as { conversa_id?: string; empresa_id?: string }
      if (!isSuperadmin && row.empresa_id !== profile.empresa_id) return
      if (selectedChatRef.current && row.conversa_id === selectedChatRef.current.id) {
        fetchMensagens(selectedChatRef.current.id)
      }
    })

    const conversasConfig: {
      event: '*'
      schema: 'public'
      table: 'crm_conversas'
      filter?: string
    } = {
      event: '*',
      schema: 'public',
      table: 'crm_conversas',
    }
    if (conversasFilter) conversasConfig.filter = conversasFilter

    channel.on('postgres_changes', conversasConfig, (payload) => {
      const row = payload.new as { sessao_id?: string; empresa_id?: string } | null
      if (!isSuperadmin && row?.empresa_id && row.empresa_id !== profile.empresa_id) return
      if (selectedChatRef.current && row?.sessao_id === selectedChatRef.current.id) {
        fetchMensagens(selectedChatRef.current.id)
      }
      fetchConversas(profile)
    })
    channel.subscribe()

    return () => { 
      supabase.removeChannel(channel) 
    }
  }, [profile])

  useEffect(() => {
    if (selectedChat) {
      fetchMensagens(selectedChat.id)
    }
  }, [selectedChat])

  useEffect(() => {
    if (!selectedChat) {
      setLinkedCard(null)
      return
    }

    let cancelled = false
    void (async () => {
      const res = await getLinkedCardBySessao(selectedChat.id, cardParam)
      if (!cancelled) {
        setLinkedCard(res.data ?? null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedChat?.id, cardParam])

  useEffect(() => {
    if (!selectedChat || !contextOpen) {
      if (!contextOpen) {
        setCustomerContext(null)
        setContextError(null)
      }
      return
    }

    let cancelled = false
    setContextLoading(true)
    setContextError(null)

    void (async () => {
      const res = await getOmniCustomerContext(selectedChat.id, linkedCard?.id ?? cardParam)
      if (cancelled) return
      setContextLoading(false)
      if ('error' in res && res.error) {
        setContextError(res.error)
        setCustomerContext(null)
      } else if (res.data) {
        setCustomerContext(res.data)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedChat?.id, contextOpen, linkedCard?.id, cardParam])

  async function openRedirectModal() {
    if (!selectedChat || redirectLoading) return
    setRedirectLoading(true)
    const cardHint =
      linkedCard?.id ??
      customerContext?.currentSessionCard?.id ??
      cardParam
    const res = await getCardForOmniRedirect(selectedChat.id, cardHint)
    setRedirectLoading(false)
    if (res.error) {
      alert(res.error)
      return
    }
    if (res.data) {
      setRedirectCtx(res.data)
      setRedirectOpen(true)
    }
  }

  function handleRedirectDone() {
    setRedirectOpen(false)
    setRedirectCtx(null)
    if (selectedChat) {
      void getLinkedCardBySessao(selectedChat.id, linkedCard?.id ?? cardParam).then((res) => {
        setLinkedCard(res.data ?? null)
      })
    }
  }

  // Fallback: Realtime pode falhar se a tabela não estiver na publication
  useEffect(() => {
    if (!profile) return
    const interval = setInterval(() => {
      fetchConversas(profile)
      if (selectedChatRef.current) {
        fetchMensagens(selectedChatRef.current.id)
      }
    }, 8000)
    return () => clearInterval(interval)
  }, [profile])

  async function fetchMensagens(chatId: string) {
    const { data, error } = await getOmniMensagens(chatId)
    if (error) {
      console.error('[Chat] Erro ao carregar mensagens:', error)
      setMensagens([])
      return
    }
    setMensagens(applyDeletedFlags((data || []) as Mensagem[]))
    setTimeout(scrollToBottom, 50)
  }

  async function handleSendMessage() {
    if (!selectedChat || !inputMessage.trim() || isSending) return

    setIsSending(true)
    const content = inputMessage.trim()
    
    const result = await sendOmniMessage(selectedChat.id, content)

    if (result.success) {
      setInputMessage('')
    } else {
      alert('Erro ao enviar mensagem: ' + result.error)
    }
    setIsSending(false)
  }

  function insertEmoji(emoji: string) {
    const el = replyInputRef.current
    const start = el?.selectionStart ?? inputMessage.length
    const end = el?.selectionEnd ?? inputMessage.length
    const next = inputMessage.slice(0, start) + emoji + inputMessage.slice(end)
    setInputMessage(next)
    requestAnimationFrame(() => {
      const cursor = start + emoji.length
      el?.focus()
      el?.setSelectionRange(cursor, cursor)
    })
  }

  async function handleDeleteMessage(msg: Mensagem) {
    if (!selectedChat || deletingMessageId) return
    const ok = window.confirm(
      'Apagar esta mensagem no WhatsApp do cliente? Ela continua visível aqui para o operador, marcada como apagada.',
    )
    if (!ok) return
    setDeletingMessageId(msg.id)
    const result = await deleteOmniMessage(selectedChat.id, msg.id)
    setDeletingMessageId(null)
    if (!result.success) {
      alert(result.error || 'Não foi possível apagar a mensagem.')
      return
    }
    rememberDeletedMessageId(msg.id)
    setMensagens((prev) =>
      prev.map((row) =>
        row.id === msg.id
          ? {
              ...row,
              metadata: markOmniMetadataDeleted(row.metadata, {
                original_content: row.metadata?.original_content ?? row.content,
              }),
            }
          : row,
      ),
    )
    await fetchMensagens(selectedChat.id)
  }

  useEffect(() => {
    setAttachError(null)
  }, [selectedChat?.id])

  async function handleAttachmentSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedChat || isSending) return

    setAttachError(null)

    const maxMb = Math.round(DOCUMENT_MAX_BYTES / 1024 / 1024)
    if (file.size > DOCUMENT_MAX_BYTES) {
      setAttachError(
        `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). O limite é ${maxMb} MB.`,
      )
      return
    }

    const mimeType = file.type || ''
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      setAttachError('Formato não suportado. Envie PDF ou imagem (PNG, JPG, WEBP).')
      return
    }

    setIsSending(true)
    try {
      const fd = new FormData()
      fd.set('sessaoId', selectedChat.id)
      fd.set('file', file)
      const caption = inputMessage.trim()
      if (caption) fd.set('caption', caption)

      const result = await sendOmniAttachment(fd)
      if (result.success) {
        setInputMessage('')
        setAttachError(null)
        await fetchMensagens(selectedChat.id)
      } else {
        const err = result.error || 'Falha ao enviar anexo.'
        // Next.js body limit residual / genérico
        if (/Body exceeded|bodySizeLimit|too large|Payload Too Large/i.test(err)) {
          setAttachError(`Arquivo excede o limite de ${maxMb} MB.`)
        } else {
          setAttachError(err)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar anexo.'
      if (/Body exceeded|bodySizeLimit|too large|Payload Too Large/i.test(msg)) {
        setAttachError(`Arquivo excede o limite de ${maxMb} MB.`)
      } else {
        setAttachError(msg)
      }
    } finally {
      setIsSending(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const filteredConversas = conversas.filter(c => 
    c.crm_leads?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.crm_leads?.telefone?.includes(searchTerm)
  )

  if (loading) {
    return <ChatLoadingFallback />
  }

  return (
    <div
      data-testid="omni-chat-page"
      className="flex flex-col flex-1 min-h-0 h-0 gap-2 overflow-hidden animate-in fade-in duration-500"
    >
      <div className="flex flex-1 min-h-0 overflow-hidden bg-[#111111] border border-[#ffffff0a] rounded-2xl shadow-2xl relative">
        <div className="w-60 md:w-64 shrink-0 border-r border-[#ffffff0a] flex flex-col min-h-0 bg-[#111111]">
          <div className="p-3 border-b border-[#ffffff0a]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input 
                type="text" 
                data-testid="omni-search"
                placeholder="Buscar lead..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#ffffff0a] rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:border-[#2BAADF] transition-all outline-none"
              />
            </div>
          </div>

          <div data-testid="omni-conversa-list" className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredConversas.length === 0 ? (
              <div className="p-6 text-center text-gray-600 text-xs italic">Nenhuma conversa encontrada</div>
            ) : (
              filteredConversas.map((chat) => (
                <div 
                  key={chat.sessao_id ?? chat.id}
                  data-testid="omni-conversa-item"
                  onClick={() => selectChatManually(chat)}
                  className={`p-3 border-b border-[#ffffff05] cursor-pointer transition-all hover:bg-[#ffffff03] group relative ${selectedChat && conversaMatchesSessao(chat, selectedChat.id) ? 'bg-[#2BAADF]/10' : ''}`}
                >
                  {selectedChat && conversaMatchesSessao(chat, selectedChat.id) && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2BAADF]" />}
                  <div className="flex items-center gap-2.5">
                    <div className="relative shrink-0">
                       <LeadListAvatar
                         nome={chat.crm_leads?.nome}
                         awaitingReply={conversaAwaitingReply(chat)}
                       />
                       <div
                         className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#111111] ${
                           conversaAwaitingReply(chat)
                             ? 'bg-[#80B828] shadow-[0_0_6px_rgba(128,184,40,0.55)]'
                             : 'bg-orange-500'
                         }`}
                         title={conversaAwaitingReply(chat) ? 'Aguardando resposta' : 'Já respondida'}
                         aria-label={conversaAwaitingReply(chat) ? 'Aguardando resposta' : 'Já respondida'}
                       />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-white truncate group-hover:text-[#2BAADF] transition-colors">
                          {chat.crm_leads?.nome || 'Desconhecido'}
                        </p>
                        <span className="text-[9px] text-gray-600 font-medium shrink-0">
                          {format(new Date(chat.updated_at), 'HH:mm')}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5 font-medium opacity-70 tabular-nums">
                        {formatLeadPhone(chat.crm_leads?.telefone, chat.crm_leads?.whatsapp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[#0D0D0D]">
          {selectedChat ? (
            <>
              <div className="h-20 shrink-0 border-b border-[#ffffff0a] flex items-center justify-between px-6 bg-[#111111]/80 backdrop-blur-md z-10">
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#2BAADF]/10 border border-[#2BAADF]/20 flex items-center justify-center">
                        <Phone className="w-5 h-5 text-[#2BAADF]" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-[15px]">{selectedChat.crm_leads?.nome || 'Desconhecido'}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                         <span className={`w-2 h-2 rounded-full ${selectedChat.status === 'ai' ? 'bg-[#80B828] animate-pulse' : 'bg-orange-500'}`} />
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            {selectedChat.status === 'ai' ? 'Atendimento Robotizado' : 'Gestão Humana'}
                         </span>
                      </div>
                    </div>
                 </div>
                 <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setThreadSearchOpen((v) => !v)}
                      title="Pesquisar nesta conversa"
                      className={`p-2.5 rounded-xl transition-all border ${
                        threadSearchOpen
                          ? 'bg-[#2BAADF]/15 border-[#2BAADF]/30 text-[#2BAADF]'
                          : 'bg-[#ffffff05] hover:bg-[#ffffff0a] border-transparent text-gray-400 hover:text-white'
                      }`}
                      aria-label="Pesquisar nesta conversa"
                      aria-pressed={threadSearchOpen}
                      data-testid="omni-thread-search-toggle"
                    >
                      <Search className="w-5 h-5" />
                    </button>
                    {canEditCards && selectedChat && (
                      <button
                        type="button"
                        onClick={() => void openRedirectModal()}
                        disabled={redirectLoading}
                        title={`Encaminhar card: ${encaminharCardTitulo}`}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 transition-all border border-orange-500/25 disabled:opacity-50"
                      >
                        {redirectLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Navigation className="w-4 h-4" />
                        )}
                        <span className="text-[11px] font-black uppercase tracking-wider">
                          Encaminhar
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setContextOpen((v) => !v)}
                      title="Contexto do cliente"
                      className={`p-2.5 rounded-xl transition-all border ${
                        contextOpen
                          ? 'bg-[#2BAADF]/15 border-[#2BAADF]/30 text-[#2BAADF]'
                          : 'bg-[#ffffff05] hover:bg-[#ffffff0a] border-transparent text-gray-400 hover:text-white'
                      }`}
                      aria-label="Contexto do cliente"
                      aria-pressed={contextOpen}
                    >
                       <PanelRight className="w-5 h-5" />
                    </button>
                 </div>
              </div>

              {threadSearchOpen && (
                <div className="shrink-0 border-b border-[#ffffff0a] bg-[#111111] px-4 py-2.5 flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <input
                      ref={threadSearchInputRef}
                      type="search"
                      value={threadSearchQuery}
                      onChange={(e) => setThreadSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setThreadSearchOpen(false)
                          setThreadSearchQuery('')
                          return
                        }
                        if (e.key === 'Enter' && threadMatchIds.length > 0) {
                          e.preventDefault()
                          setThreadMatchIndex((i) =>
                            e.shiftKey
                              ? (i - 1 + threadMatchIds.length) % threadMatchIds.length
                              : (i + 1) % threadMatchIds.length,
                          )
                        }
                      }}
                      placeholder="Pesquisar nesta conversa..."
                      data-testid="omni-thread-search"
                      className="w-full bg-[#0A0A0A] border border-[#ffffff0a] rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:border-[#2BAADF] outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium tabular-nums shrink-0 min-w-[4.5rem] text-center">
                    {threadSearchNeedle
                      ? threadMatchIds.length > 0
                        ? `${Math.min(threadMatchIndex, threadMatchIds.length - 1) + 1}/${threadMatchIds.length}`
                        : '0/0'
                      : '—'}
                  </span>
                  <button
                    type="button"
                    disabled={threadMatchIds.length === 0}
                    onClick={() =>
                      setThreadMatchIndex((i) =>
                        (i - 1 + threadMatchIds.length) % threadMatchIds.length,
                      )
                    }
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#ffffff08] disabled:opacity-30"
                    aria-label="Resultado anterior"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={threadMatchIds.length === 0}
                    onClick={() =>
                      setThreadMatchIndex((i) => (i + 1) % threadMatchIds.length)
                    }
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#ffffff08] disabled:opacity-30"
                    aria-label="Próximo resultado"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setThreadSearchOpen(false)
                      setThreadSearchQuery('')
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#ffffff08]"
                    aria-label="Fechar pesquisa"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
              <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-6 space-y-6 custom-scrollbar-chat bg-grid-white/[0.01]">
                {mensagens.map((msg) => {
                  const responderLabel = getResponderLabel(msg)
                  const isAiResponder = responderLabel === 'Agente de IA'
                  const isMatch =
                    threadSearchOpen &&
                    Boolean(threadSearchNeedle) &&
                    threadMatchIds.includes(msg.id)
                  const isActiveMatch =
                    isMatch &&
                    threadMatchIds[Math.min(threadMatchIndex, threadMatchIds.length - 1)] === msg.id
                  const isDeleted = isOmniMessageDeleted(msg.metadata)
                  const showDelete = canDeleteOmniMessage(msg, profile)
                  return (
                  <div 
                    key={msg.id}
                    id={`omni-msg-${msg.id}`}
                    className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                      threadSearchOpen && threadSearchNeedle && !isMatch ? 'opacity-35' : ''
                    }`}
                  >
                    <div className={`max-w-[75%] group relative`}>
                       <div className={`flex items-center gap-2 mb-1.5 px-1 ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                          {msg.role === 'user' && selectedChat?.crm_leads?.nome && (
                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.1em]">
                              {selectedChat.crm_leads.nome}
                            </span>
                          )}
                          {responderLabel && (
                            <span
                              className={`text-[9px] font-black uppercase tracking-[0.1em] flex items-center gap-1 ${
                                isAiResponder ? 'text-[#80B828]' : 'text-[#2BAADF]'
                              }`}
                            >
                              {isAiResponder ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                              {responderLabel}
                            </span>
                          )}
                          <span className="text-[9px] text-gray-700 font-mono">
                             {format(new Date(msg.created_at), 'HH:mm')}
                          </span>
                          {isDeleted && (
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-amber-500/90">
                              Apagada no WhatsApp
                            </span>
                          )}
                          {showDelete && (
                            <button
                              type="button"
                              title="Apagar no WhatsApp do cliente"
                              disabled={deletingMessageId === msg.id}
                              onClick={() => void handleDeleteMessage(msg)}
                              className="p-0.5 rounded text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                              aria-label="Apagar mensagem"
                            >
                              {deletingMessageId === msg.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </button>
                          )}
                       </div>
                       <div className={`p-4 rounded-2xl shadow-xl text-[14px] leading-relaxed border ${
                          isDeleted
                            ? msg.role === 'user'
                              ? 'bg-[#1A1A1A] text-gray-400 border-[#ffffff0a] rounded-tl-none opacity-70'
                              : 'bg-gradient-to-br from-[#2BAADF]/55 to-[#1A8FBF]/55 text-white/80 border-[#2BAADF]/10 rounded-tr-none'
                            : msg.role === 'user' 
                            ? 'bg-[#1A1A1A] text-gray-200 border-[#ffffff0a] rounded-tl-none' 
                            : 'bg-gradient-to-br from-[#2BAADF] to-[#1A8FBF] text-white border-[#2BAADF]/20 rounded-tr-none'
                       } ${
                          isActiveMatch
                            ? 'ring-2 ring-[#80B828] ring-offset-2 ring-offset-[#0D0D0D]'
                            : isMatch
                              ? 'ring-1 ring-[#80B828]/50'
                              : ''
                       }`}>
                          {formatMessageContent(msg)}
                       </div>
                    </div>
                  </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {contextOpen && (
                <OmniCustomerContextPanel
                  context={customerContext}
                  loading={contextLoading}
                  error={contextError}
                  onClose={() => setContextOpen(false)}
                  onSelectCard={setConsultaCardId}
                />
              )}
              </div>

              <div className="shrink-0 overflow-visible p-4 sm:p-5 bg-[#111111]/90 border-t border-[#ffffff0a] backdrop-blur-sm">
                 {attachError && (
                   <div
                     role="alert"
                     className="mb-2 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300"
                   >
                     <span className="flex-1 leading-relaxed">{attachError}</span>
                     <button
                       type="button"
                       onClick={() => setAttachError(null)}
                       className="shrink-0 p-0.5 text-red-400/80 hover:text-red-200"
                       aria-label="Fechar aviso"
                     >
                       <X className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 )}
                 <div className="bg-[#0A0A0A] border border-[#ffffff0a] rounded-2xl px-2 py-2 focus-within:border-[#2BAADF]/50 transition-all shadow-inner">
                    <div className="flex items-end gap-1.5">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={handleAttachmentSelect}
                      />
                      <button
                        type="button"
                        disabled={isSending || !selectedChat}
                        onClick={() => fileInputRef.current?.click()}
                        title="Enviar PDF ou imagem (máx. 5 MB)"
                        className="shrink-0 p-2 mb-0.5 text-gray-500 hover:text-[#2BAADF] hover:bg-[#2BAADF]/10 rounded-xl transition-all disabled:opacity-40"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                      <button
                        ref={emojiButtonRef}
                        type="button"
                        disabled={isSending || !selectedChat}
                        onClick={() => setEmojiPickerOpen((v) => !v)}
                        title="Inserir emoji"
                        aria-label="Inserir emoji"
                        aria-pressed={emojiPickerOpen}
                        className={`shrink-0 p-2 mb-0.5 rounded-xl transition-all disabled:opacity-40 ${
                          emojiPickerOpen
                            ? 'text-[#2BAADF] bg-[#2BAADF]/10'
                            : 'text-gray-500 hover:text-[#2BAADF] hover:bg-[#2BAADF]/10'
                        }`}
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      <textarea
                        ref={replyInputRef}
                        data-testid="omni-reply-input"
                        placeholder="Responda aqui para assumir o controle... (IA pausará)"
                        rows={1}
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape' && emojiPickerOpen) {
                            e.preventDefault()
                            setEmojiPickerOpen(false)
                            return
                          }
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            setEmojiPickerOpen(false)
                            handleSendMessage()
                          }
                        }}
                        className="flex-1 min-h-[44px] max-h-32 bg-transparent border-none text-white text-sm px-2 py-2.5 outline-none resize-none placeholder-gray-600 font-medium leading-relaxed"
                        disabled={isSending}
                      />
                      <button
                        type="button"
                        onClick={handleSendMessage}
                        disabled={isSending || !inputMessage.trim()}
                        title={isSending ? 'Enviando...' : 'Enviar mensagem'}
                        className={`shrink-0 mb-0.5 w-11 h-11 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_20px_rgba(43,170,223,0.4)] text-white flex items-center justify-center transition-all transform active:scale-95 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none`}
                      >
                        {isSending ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                 </div>
                 <div className="mt-2 flex items-center justify-center gap-4 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] flex items-center gap-2">
                       <ShieldCheck className="w-3 h-3 text-[#2BAADF]" /> Criptografia Ponta-a-Ponta HuginFlow
                    </span>
                 </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-grid-white/[0.01]">
               <div className="w-24 h-24 rounded-3xl bg-[#ffffff02] border border-[#ffffff0a] flex items-center justify-center mb-8 relative group">
                  <div className="absolute inset-0 bg-[#2BAADF]/5 blur-3xl rounded-full group-hover:bg-[#2BAADF]/15 transition-all duration-700" />
                  <MessageSquare className="w-12 h-12 text-[#2BAADF] opacity-30 group-hover:opacity-60 transition-all" />
               </div>
               <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-3">Central Omnichannel</h2>
               <p className="text-gray-500 max-w-xs text-sm font-medium leading-relaxed italic opacity-80">
                 Selecione uma conversa ao lado para visualizar o histórico completo e gerenciar o atendimento híbrido.
               </p>
               <div className="mt-12 flex flex-wrap justify-center gap-4">
                  <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-[#ffffff03] border border-[#ffffff08] shadow-sm">
                     <ShieldCheck className="w-4 h-4 text-[#80B828]" />
                     <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Triagem Proativa Ativada</span>
                  </div>
               </div>
            </div>
          )}
          {consultaCardId && (
            <CardConsultaDrawer
              cardId={consultaCardId}
              onClose={() => setConsultaCardId(null)}
            />
          )}
        </div>
      </div>

      {emojiPickerOpen &&
        createPortal(
          <div
            ref={emojiPickerRef}
            role="listbox"
            aria-label="Emojis"
            style={{
              position: 'fixed',
              left: emojiPickerPos.left,
              bottom: emojiPickerPos.bottom,
              width: 288,
              zIndex: 80,
              backgroundColor: '#1C1C1C',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 16,
              padding: 10,
              boxShadow: '0 18px 50px rgba(0,0,0,0.7)',
            }}
          >
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#9CA3AF',
              }}
            >
              Emojis
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 32px)',
                justifyContent: 'space-between',
                gap: 4,
                maxHeight: 176,
                overflowY: 'auto',
              }}
            >
              {OMNI_EMOJIS.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  aria-label={`Inserir ${emoji}`}
                  style={{
                    width: 32,
                    height: 32,
                    border: 0,
                    borderRadius: 8,
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 20,
                    lineHeight: '32px',
                    padding: 0,
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}

      {redirectCtx && (
        <ChatCardRedirectModal
          open={redirectOpen}
          onClose={() => {
            setRedirectOpen(false)
            setRedirectCtx(null)
          }}
          onDone={handleRedirectDone}
          card={redirectCtx.card}
          pipelineId={redirectCtx.pipelineId}
          pipelineName={redirectCtx.pipelineName}
          stages={redirectCtx.stages}
          leadName={selectedChat?.crm_leads?.nome}
        />
      )}
    </div>
  )
}

export default function ChatOmnichannelPage() {
  return (
    <Suspense fallback={<ChatLoadingFallback />}>
      <ChatOmnichannelInner />
    </Suspense>
  )
}
