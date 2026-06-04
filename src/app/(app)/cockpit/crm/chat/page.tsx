'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { 
  Search, MessageSquare, Bot, User, 
  Send, Phone, Edit, MoreVertical, 
  Paperclip, Smile, ShieldCheck, ArrowLeft
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { sendOmniMessage } from '../omni-actions'
import { getOmniConversas, getOmniMensagens } from '../omni-chat-actions'

interface Conversa {
  id: string
  status: 'ai' | 'human' | 'closed'
  last_message: string
  updated_at: string
  crm_leads: {
    nome: string
    telefone: string
    whatsapp: string
  }
}

interface Mensagem {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system'
  created_at: string
  conversa_id: string
  user_id?: string
  metadata?: { is_ai?: boolean; sent_by?: string } | null
  usuarios?: {
    nome_completo: string
  } | null
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

export default function ChatOmnichannelPage() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [selectedChat, setSelectedChat] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [inputMessage, setInputMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  
  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  async function fetchConversas(me: any) {
    const { data, error } = await getOmniConversas()
    if (error) console.error('[Chat] Erro ao listar conversas:', error)
    setConversas(data || [])
    setLoading(false)
  }

  const selectedChatRef = useRef<Conversa | null>(null)

  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

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

    const interacoesConfig: {
      event: 'INSERT'
      schema: 'public'
      table: 'crm_interacoes'
      filter?: string
    } = {
      event: 'INSERT',
      schema: 'public',
      table: 'crm_interacoes',
    }
    if (interacoesFilter) interacoesConfig.filter = interacoesFilter

    channel.on('postgres_changes', interacoesConfig, (payload) => {
      const row = payload.new as { conversa_id?: string; empresa_id?: string }
      if (!isSuperadmin && row.empresa_id !== profile.empresa_id) return
      if (selectedChatRef.current && row.conversa_id === selectedChatRef.current.id) {
        fetchMensagens(selectedChatRef.current.id)
      }
      fetchConversas(profile)
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const filteredConversas = conversas.filter(c => 
    c.crm_leads?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.crm_leads?.telefone?.includes(searchTerm)
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="w-10 h-10 border-4 border-[#2BAADF]/20 border-t-[#2BAADF] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/cockpit/crm" className="p-2 rounded-lg bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
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
                  className={`p-4 border-b border-[#ffffff05] cursor-pointer transition-all hover:bg-[#ffffff03] group relative ${selectedChat?.id === chat.id ? 'bg-[#2BAADF]/10' : ''}`}
                >
                  {selectedChat?.id === chat.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2BAADF]" />}
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
                        {chat.last_message || 'Nova conversa iniciada'}
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
                    <button className="p-2.5 rounded-xl bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-[#2BAADF] transition-all border border-transparent hover:border-[#2BAADF]/20">
                       <Edit className="w-5 h-5" />
                    </button>
                    <button className="p-2.5 rounded-xl bg-[#ffffff05] hover:bg-[#ffffff0a] text-gray-400 hover:text-white transition-all">
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
                          {msg.role === 'assistant'
                            ? msg.content.replace(/\[STATUS_CRM:.*?\]/gi, '').replace(/\[.*?\]/g, '').trim()
                            : msg.content}
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
                          <button className="p-2 text-gray-500 hover:text-[#2BAADF] hover:bg-[#2BAADF]/10 rounded-xl transition-all"><Paperclip className="w-5 h-5" /></button>
                          <button className="p-2 text-gray-500 hover:text-[#2BAADF] hover:bg-[#2BAADF]/10 rounded-xl transition-all"><Smile className="w-5 h-5" /></button>
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
                       <ShieldCheck className="w-3 h-3 text-[#2BAADF]" /> Criptografia Ponta-a-Ponta Ragnar
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
    </div>
  )
}
