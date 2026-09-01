'use client'

import { useState, useEffect, useRef, useLayoutEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useSearchParams } from 'next/navigation'
import { 
  Search, MessageSquare, Bot, User, 
  Send, Phone, Navigation, MoreVertical, 
  Paperclip, Smile, ShieldCheck, Loader2
} from 'lucide-react'
import { format } from 'date-fns'
import { BackButton } from '@/components/BackButton'
import { sendOmniMessage, sendOmniAttachment } from '../omni-actions'
import {
  getOmniConversas,
  getOmniMensagens,
  getOmniConversaBySessao,
  getSessaoIdByCardId,
  getLinkedCardBySessao,
  getCardForOmniRedirect,
} from '../omni-chat-actions'
import { OMNI_SESSAO_STORAGE_KEY } from '@/lib/omni/chat-deep-link'
import { stripOutboundTags } from '@/lib/omnichannel/triage/parseTriageTags'
import { hasPermission } from '@/utils/permissions'
import ChatCardRedirectModal from '@/components/omni/ChatCardRedirectModal'

interface Conversa {
  id: string
  sessao_id?: string
  status: 'ai' | 'human' | 'closed'
  last_message: string
  updated_at: string
  crm_leads: {
    nome: string
    telefone: string
    whatsapp: string
  }
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
    transcription?: {
      status?: 'pending' | 'completed' | 'failed'
      text?: string
      error?: string
    }
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
    const doc = meta.document as { status?: string; resumo?: string } | undefined
    if (doc?.status === 'pending') return msg.content || '📎 Documento recebido — processando…'
    if (doc?.resumo) return `📎 ${doc.resumo}`
    const fileName = (meta as { file_name?: string }).file_name
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

function ChatLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-200px)]">
      <div className="w-10 h-10 border-4 border-[#2BAADF]/20 border-t-[#2BAADF] rounded-full animate-spin" />
    </div>
  )
}

function ChatOmnichannelInner() {
  const searchParams = useSearchParams()
  const sessaoParam = searchParams.get('sessao')
  const cardParam = searchParams.get('card')

  const [conversas, setConversas] = useState<Conversa[]>([])
  const [selectedChat, setSelectedChat] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [inputMessage, setInputMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [linkedCard, setLinkedCard] = useState<{ id: string; titulo: string } | null>(null)
  const [redirectOpen, setRedirectOpen] = useState(false)
  const [redirectLoading, setRedirectLoading] = useState(false)
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

  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const targetSessaoRef = useRef<string | null>(null)
  const selectedChatRef = useRef<Conversa | null>(null)
  const selectingRef = useRef(false)

  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

  // Sincroniza alvo de deep link: ?sessao= > sessionStorage (click no card)
  useLayoutEffect(() => {
    if (sessaoParam) {
      targetSessaoRef.current = sessaoParam
      clearStoredSessao()
      return
    }
    const stored = readStoredSessao()
    if (stored) {
      targetSessaoRef.current = stored
      clearStoredSessao()
    }
  }, [sessaoParam, cardParam])

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
    if (selectingRef.current) return false
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

  async function fetchConversas(me: any) {
    const { data, error } = await getOmniConversas()
    if (error) console.error('[Chat] Erro ao listar conversas:', error)
    const list = data || []
    setConversas(list)
    await tryAutoSelect(list)
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
      if (me) fetchConversas(me)
    }
    init()
  }, [])

  useEffect(() => {
    if (loading) return
    void tryAutoSelect(conversas)
  }, [loading, conversas, sessaoParam, cardParam, tryAutoSelect])

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

  async function openRedirectModal() {
    if (!selectedChat || redirectLoading) return
    setRedirectLoading(true)
    const res = await getCardForOmniRedirect(
      selectedChat.id,
      linkedCard?.id ?? cardParam,
    )
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
    setMensagens(data || [])
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

  async function handleAttachmentSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedChat || isSending) return

    setIsSending(true)
    const fd = new FormData()
    fd.set('sessaoId', selectedChat.id)
    fd.set('file', file)
    const caption = inputMessage.trim()
    if (caption) fd.set('caption', caption)

    const result = await sendOmniAttachment(fd)
    if (result.success) {
      setInputMessage('')
      await fetchMensagens(selectedChat.id)
    } else {
      alert('Erro ao enviar anexo: ' + result.error)
    }
    setIsSending(false)
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
    <div className="flex flex-col h-[calc(100vh-140px)] gap-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <MessageSquare className="w-6 h-6 text-[#2BAADF]" />
              Chat Omnichannel
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">Atendimento em tempo real via WhatsApp e outros canais.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl relative">
        <div className="w-80 md:w-96 border-r border-[#ffffff0a] flex flex-col bg-[#111111]">
          <div className="p-4 border-b border-[#ffffff0a]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="Buscar lead ou telefone..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#ffffff0a] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:border-[#2BAADF] transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredConversas.length === 0 ? (
              <div className="p-10 text-center text-gray-600 text-sm italic">Nenhuma conversa encontrada</div>
            ) : (
              filteredConversas.map((chat) => (
                <div 
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={`p-4 border-b border-[#ffffff05] cursor-pointer transition-all hover:bg-[#ffffff03] group relative ${selectedChat && conversaMatchesSessao(chat, selectedChat.id) ? 'bg-[#2BAADF]/10' : ''}`}
                >
                  {selectedChat && conversaMatchesSessao(chat, selectedChat.id) && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2BAADF]" />}
                  <div className="flex items-center gap-3">
                    <div className="relative">
                       <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-[#ffffff10] flex items-center justify-center text-white shadow-lg">
                          <User className="w-6 h-6 text-gray-500" />
                       </div>
                       <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#111111] flex items-center justify-center ${chat.status === 'ai' ? 'bg-[#80B828]' : 'bg-orange-500'}`}>
                          {chat.status === 'ai' ? <Bot className="w-2.5 h-2.5 text-white" /> : <User className="w-2.5 h-2.5 text-white" />}
                       </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-white truncate group-hover:text-[#2BAADF] transition-colors">
                          {chat.crm_leads?.nome || 'Desconhecido'}
                        </p>
                        <span className="text-[10px] text-gray-600 font-medium">
                          {format(new Date(chat.updated_at), 'HH:mm')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-1 italic font-medium opacity-70">
                        {stripOutboundTags(chat.last_message || '') || 'Nova conversa iniciada'}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col relative bg-[#0D0D0D]">
          {selectedChat ? (
            <>
              <div className="h-20 border-b border-[#ffffff0a] flex items-center justify-between px-6 bg-[#111111]/80 backdrop-blur-md z-10">
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
                 <div className="flex items-center gap-2">
                    {canEditCards && linkedCard && (
                      <button
                        type="button"
                        onClick={() => void openRedirectModal()}
                        disabled={redirectLoading}
                        title={`Encaminhar card: ${linkedCard.titulo}`}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 transition-all border border-orange-500/25 disabled:opacity-50"
                      >
                        {redirectLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Navigation className="w-4 h-4" />
                        )}
                        <span className="text-[11px] font-black uppercase tracking-wider hidden sm:inline">
                          Encaminhar
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="p-2.5 rounded-xl bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-all"
                      aria-label="Mais opções"
                    >
                       <MoreVertical className="w-5 h-5" />
                    </button>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar-chat bg-grid-white/[0.01]">
                {mensagens.map((msg) => {
                  const responderLabel = getResponderLabel(msg)
                  const isAiResponder = responderLabel === 'Agente de IA'
                  return (
                  <div 
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
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
                       </div>
                       <div className={`p-4 rounded-2xl shadow-xl text-[14px] leading-relaxed border ${
                          msg.role === 'user' 
                            ? 'bg-[#1A1A1A] text-gray-200 border-[#ffffff0a] rounded-tl-none' 
                            : 'bg-gradient-to-br from-[#2BAADF] to-[#1A8FBF] text-white border-[#2BAADF]/20 rounded-tr-none'
                       }`}>
                          {formatMessageContent(msg)}
                       </div>
                    </div>
                  </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-6 bg-[#111111]/90 border-t border-[#ffffff0a] backdrop-blur-sm">
                 <div className="bg-[#0A0A0A] border border-[#ffffff0a] rounded-2xl p-2.5 focus-within:border-[#2BAADF]/50 transition-all shadow-inner">
                    <textarea 
                      placeholder="Responda aqui para assumir o controle... (IA pausará)"
                      rows={2}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      className="w-full bg-transparent border-none text-white text-sm p-3 outline-none resize-none placeholder-gray-600 font-medium leading-relaxed italic"
                      disabled={isSending}
                    />
                    <div className="flex items-center justify-between border-t border-[#ffffff05] pt-3 mt-2 px-1">
                       <div className="flex items-center gap-1">
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
                            className="p-2 text-gray-500 hover:text-[#2BAADF] hover:bg-[#2BAADF]/10 rounded-xl transition-all disabled:opacity-40"
                          >
                            <Paperclip className="w-5 h-5" />
                          </button>
                          <button type="button" disabled className="p-2 text-gray-600 rounded-xl opacity-40 cursor-not-allowed" title="Em breve"><Smile className="w-5 h-5" /></button>
                       </div>
                       <button 
                         onClick={handleSendMessage}
                         disabled={isSending || !inputMessage.trim()}
                         className={`bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_20px_rgba(43,170,223,0.4)] text-white px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all transform active:scale-95 shadow-lg ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
                       >
                          {isSending ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          {isSending ? 'Enviando...' : 'Enviar Mensagem'}
                       </button>
                    </div>
                 </div>
                 <div className="mt-3 flex items-center justify-center gap-4 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
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
        </div>
      </div>

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
