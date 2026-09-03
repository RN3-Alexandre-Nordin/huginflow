'use client'

import React, { useEffect, useState, useRef, useTransition } from 'react'
import { Send, MessageSquare, User, Clock, Link as LinkIcon, Loader2, ExternalLink, Hash, Bell } from 'lucide-react'
import { sendChatMessage, getChatMessages, markChatAsRead } from '@/app/(app)/cockpit/crm/chat-actions'
import { searchCrmCards } from '@/app/(app)/cockpit/crm/actions'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/utils/supabase/client'
import { getCompanyUsers } from '@/app/(app)/cockpit/crm/chat-actions'

interface Message {
  id: string
  content: string
  sender_id: string
  context_type: string
  context_id?: string
  created_at: string
  usuarios: {
    id: string
    nome_completo: string
  }
  crm_cards?: {
    id: string
    titulo: string
  }
}

interface ChatWindowProps {
  contextType: 'global' | 'card' | 'direct'
  contextId?: string
  relatedCardId?: string
  currentUserId: string
  onCardClick?: (cardId: string) => void
}

export default function ChatWindow({ 
  contextType, 
  contextId, 
  relatedCardId,
  currentUserId,
  onCardClick
}: ChatWindowProps) {
  const [filterTab, setFilterTab] = useState<'all' | 'mentioned'>('all')
  const [currentUserProfile, setCurrentUserProfile] = useState<{ id: string, nome_completo: string } | null>(null)
  const [showCardContext, setShowCardContext] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadProfile() {
      const { getMyProfile } = await import('@/app/(app)/cockpit/actions')
      const res = await getMyProfile()
      if (res) {
        setCurrentUserProfile({ id: res.id, nome_completo: res.nome_completo })
      }
    }
    loadProfile()
  }, [])
  
  // Mentions State
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionTrigger, setMentionTrigger] = useState<'@' | '#' | null>(null)
  const [showMentionList, setShowMentionList] = useState(false)
  const [mentionResults, setMentionResults] = useState<{id: string, label: string, type: 'card' | 'user'}[]>([])
  const [searchingMentions, setSearchingMentions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const getHSLColor = (userId: string) => {
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash)
    }
    const h = Math.abs(hash) % 360
    return h
  }

  const supabase = createClient()

  const loadMessages = async () => {
    setLoading(true)
    const res = await getChatMessages(contextType, contextId, relatedCardId)
    if (res.data) setMessages(res.data)
    setLoading(false)
  }

  useEffect(() => {
    loadMessages()

    // Realtime Subscription
    const channel = supabase
      .channel(`chat:${contextType}:${contextId || 'global'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages'
        },
        async (payload) => {
          // No modo Global ou Direct, filtramos no cliente por enquanto ou usamos canais separados
          // Para melhor performance e segurança, buscamos os dados completos do usuário/card
          const { data: fullMsg, error } = await supabase
            .from('chat_messages')
            .select(`
              *,
              usuarios(id, nome_completo),
              crm_cards(id, titulo)
            `)
            .eq('id', payload.new.id)
            .single()

          if (fullMsg) {
             // Verificar se a mensagem pertence ao contexto atual
              if (contextType === 'global') {
                // No global, aceitamos 'global' OU 'card' (da mesma empresa)
                const isRelevant = fullMsg.context_type === 'global' || fullMsg.context_type === 'card'
                if (isRelevant) {
                  setMessages(prev => [...prev.filter(m => m.id !== fullMsg.id), fullMsg])
                }
              } else if (contextType === 'card' && fullMsg.context_id === contextId) {
                setMessages(prev => [...prev.filter(m => m.id !== fullMsg.id), fullMsg])
              } else if (contextType === 'direct' && fullMsg.context_type === 'direct') {
                // Filtro para DM específica (eu e ele) sobre o card X (se houver)
                const isRelevant = (
                  (fullMsg.sender_id === currentUserId && fullMsg.context_id === contextId) ||
                  (fullMsg.sender_id === contextId && fullMsg.context_id === currentUserId)
                ) && fullMsg.related_card_id === (relatedCardId || null)

                if (isRelevant) {
                  setMessages(prev => [...prev.filter(m => m.id !== fullMsg.id), fullMsg])
                }
              }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [contextType, contextId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Autocomplete Logic
  useEffect(() => {
    const handleMention = async () => {
      // Detect triggers: @ for users, # for cards
      const mentionMatch = newMessage.match(/(@|#)(\w*)$/)

      if (mentionMatch) {
        const trigger = mentionMatch[1] as '@' | '#'
        const query = mentionMatch[2]
        setMentionQuery(query)
        setMentionTrigger(trigger)
        setShowMentionList(true)
        setSearchingMentions(true)
        
        let formattedResults: any[] = []

        if (trigger === '#') {
          const cardsRes = await searchCrmCards(query)
          if (cardsRes.data) {
            formattedResults = cardsRes.data.map((c: any) => ({
              id: c.id,
              label: c.titulo,
              type: 'card'
            }))
          }
        } else if (trigger === '@') {
          const usersRes = await getCompanyUsers()
          if (usersRes.data) {
            const filteredUsers = usersRes.data.filter((u: any) => 
              u.id !== currentUserId && 
              (u.nome_completo.toLowerCase().includes(query.toLowerCase()) || 
               u.email.toLowerCase().includes(query.toLowerCase()))
            )
            formattedResults = filteredUsers.map((u: any) => ({
              id: u.id,
              label: u.nome_completo,
              type: 'user'
            }))
          }
        }

        setMentionResults(formattedResults.slice(0, 8))
        setSearchingMentions(false)
      } else {
        setShowMentionList(false)
      }
    }
    handleMention()
  }, [newMessage, currentUserId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionList && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(prev => (prev + 1) % mentionResults.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(prev => (prev - 1 + mentionResults.length) % mentionResults.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleSelectMention(mentionResults[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowMentionList(false)
        inputRef.current?.focus()
      }
    }
  }

  const handleSelectMention = (item: {id: string, label: string, type: 'card' | 'user'}) => {
    const prefix = item.type === 'card' ? 'Card: ' : ''
    // Adiciona vírgula e espaço após a menção
    const updated = newMessage.replace(/(@|#)\w*$/, `[${prefix}${item.label}], `)
    setNewMessage(updated)
    setShowMentionList(false)
    setActiveIndex(0)
    
    // Devolve o foco e coloca o cursor no final
    setTimeout(() => { 
      if (inputRef.current) {
        inputRef.current.focus()
        const length = updated.length
        inputRef.current.setSelectionRange(length, length)
      }
    }, 10)
  }

  const triggerDirectMessage = (userId: string, userName: string) => {
    window.dispatchEvent(new CustomEvent('open-direct-chat', { 
      detail: { userId, userName } 
    }))
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || isPending) return

    const content = newMessage.trim()
    setNewMessage('')

    // Atualização Otimista
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: Message = {
      id: tempId,
      content,
      sender_id: currentUserId,
      context_type: contextType,
      context_id: contextId,
      created_at: new Date().toISOString(),
      usuarios: {
        id: currentUserId,
        nome_completo: '...' // Será atualizado pelo DB
      }
    }
    setMessages(prev => [...prev, optimisticMsg])

    startTransition(async () => {
      const res = await sendChatMessage(content, contextType, contextId, relatedCardId)
      if (res.error) {
        // Remove a mensagem otimista se falhar
        setMessages(prev => prev.filter(m => m.id !== tempId))
        alert('Erro ao enviar: ' + res.error)
      } else if (res.data) {
        // Substituimos a mensagem otimista pela real (para ter ID e dados corretos)
        setMessages(prev => prev.map(m => m.id === tempId ? res.data : m))
      }
    })
  }

  const groupMessages = (messages: Message[]) => {
    const filtered = messages.filter(m => {
      // Regra de Ocultar/Mostrar Cards
      if (contextType === 'global' && !showCardContext && m.context_type === 'card') return false
      
      // Regra de Filtro "Mencionados"
      if (filterTab === 'mentioned' && currentUserProfile) {
        const mentionText = `[${currentUserProfile.nome_completo}]`
        return m.content.includes(mentionText)
      }
      
      return true
    })

    const groups: { type: 'global' | 'card', contextId?: string, cardTitle?: string, messages: Message[] }[] = []
    
    filtered.forEach((msg) => {
      const lastGroup = groups[groups.length - 1]
      const isCard = msg.context_type === 'card'
      
      if (isCard && lastGroup?.type === 'card' && lastGroup.contextId === msg.context_id) {
        lastGroup.messages.push(msg)
      } else {
        groups.push({
          type: isCard ? 'card' : 'global',
          contextId: msg.context_id,
          cardTitle: msg.crm_cards?.titulo,
          messages: [msg]
        })
      }
    })
    
    return groups
  }

  const handleCardClick = (cardId: string) => {
    if (onCardClick) {
      onCardClick(cardId)
    } else {
      // Deep linking via global event - especifica para abrir na aba chat
      window.dispatchEvent(new CustomEvent('open-card-modal', { 
        detail: { cardId, tab: 'chat' } 
      }))
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0F0F0F] rounded-2xl border border-[#ffffff0a] overflow-hidden shadow-2xl relative">
      {/* Header Contextual & Tabs */}
      <div className="shrink-0 border-b border-[#ffffff0a] bg-[#ffffff02] backdrop-blur-md z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shadow-inner ${contextType === 'card' ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 'bg-[#2BAADF]/10 border-[#2BAADF]/20 text-[#2BAADF]'}`}>
              {contextType === 'card' ? <Hash className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            </div>
            <div>
              <h5 className="text-[11px] font-black text-white uppercase tracking-widest leading-none">
                {contextType === 'global' ? 'Canal Geral da Equipe' : 
                contextType === 'card' ? 'Discussão do Card' : 'Conversa Direta'}
              </h5>
              <p className="text-[9px] text-gray-500 font-bold mt-1 uppercase tracking-tighter">
                {contextType === 'card' ? 'Contexto restrito ao Lead' : 'Broadcast para toda a empresa'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {contextType === 'global' && (
              <button 
                onClick={() => setShowCardContext(!showCardContext)}
                title={showCardContext ? "Ocultar mensagens de Cards" : "Mostrar mensagens de Cards"}
                className={`p-2 rounded-xl transition-all border ${showCardContext ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 'bg-white/5 border-[#ffffff0a] text-gray-500'}`}
              >
                <Hash className="w-4 h-4" />
              </button>
            )}
            {loading && <Loader2 className="w-3 h-3 animate-spin text-[#2BAADF]" />}
          </div>
        </div>

        {/* Filters Bar (Apenas Global) */}
        {contextType === 'global' && (
          <div className="px-6 pb-3 flex items-center gap-4">
             <div className="flex items-center bg-black/40 p-1 rounded-xl border border-[#ffffff05]">
                <button 
                  onClick={() => setFilterTab('all')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterTab === 'all' ? 'bg-[#2BAADF] text-white shadow-lg shadow-[#2BAADF]/20' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Todos
                </button>
                <button 
                  onClick={() => setFilterTab('mentioned')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterTab === 'mentioned' ? 'bg-[#2BAADF] text-white shadow-lg shadow-[#2BAADF]/20' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Mencionados
                </button>
             </div>
             
             {filterTab === 'mentioned' && (
               <span className="text-[10px] text-amber-500 font-bold animate-pulse flex items-center gap-1.5">
                 <Bell className="w-3 h-3" /> Filtrando citações para você
               </span>
             )}
          </div>
        )}
      </div>

      {/* Related Card Header for DMs */}
      {contextType === 'direct' && relatedCardId && (
        <div className="px-6 py-2 bg-orange-500/5 border-b border-orange-500/10 flex items-center gap-2 animate-in slide-in-from-top-1">
          <Hash className="w-3 h-3 text-orange-400" />
          <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">
            Assunto: Diálogo Privado sobre este Card
          </span>
        </div>
      )}

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar-main"
      >
        {groupMessages(messages).length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full opacity-20 text-center space-y-4">
             <div className="w-16 h-16 rounded-full bg-[#ffffff05] border border-[#ffffff0a] flex items-center justify-center">
                <MessageSquare className="w-8 h-8" />
             </div>
             <div>
                <p className="text-xs font-black uppercase tracking-widest">Nenhuma Mensagem</p>
                <p className="text-[10px] font-medium text-gray-500 mt-1">
                  {filterTab === 'mentioned' ? 'Ninguém te marcou por aqui ainda.' : 'O silêncio é ouro, mas a conversa move montanhas.'}
                </p>
             </div>
          </div>
        ) : (
          groupMessages(messages).map((group, groupIdx) => {
            const isCardGroup = group.type === 'card'
            
            return (
              <div 
                key={`${group.contextId || 'global'}-${groupIdx}`} 
                className={`relative ${isCardGroup ? 'bg-[#ffffff03] rounded-3xl border border-[#ffffff0a] p-4 pt-10 shadow-inner' : ''}`}
              >
                {/* Header do Container Contextual (Cards) */}
                {isCardGroup && contextType === 'global' && (
                  <div 
                    onClick={() => handleCardClick(group.contextId!)}
                    className="absolute top-2 left-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-[10px] font-black text-orange-400 cursor-pointer hover:bg-orange-500/20 transition-all group/card z-10"
                  >
                    <Hash className="w-3 h-3" />
                    <span className="truncate uppercase tracking-tighter">
                      Discussão: {group.cardTitle || 'Card Vinculado'}
                    </span>
                    <div className="ml-auto flex items-center gap-2 opacity-0 group-hover/card:opacity-100 transition-opacity">
                      <span className="text-[8px] uppercase tracking-widest">Clique para abrir</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {group.messages.map((msg) => {
                    const isMe = msg.sender_id === currentUserId
                    const hue = getHSLColor(msg.sender_id)
                    const colorHSL = `hsl(${hue}, 70%, 50%)`
                    const bgColorHSL = `hsla(${hue}, 70%, 50%, 0.15)`
                    
                    return (
                      <div 
                        key={msg.id} 
                        className={`flex flex-col ${isMe ? 'items-end text-right' : 'items-start text-left'} animate-in fade-in slide-in-from-bottom-1 duration-300`}
                      >
                        {/* Metadados Externos (Cabeçalho da Mensagem) */}
                        <div className={`flex items-center gap-2 mb-1.5 px-1 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          {!isMe ? (
                            <div className="flex items-center gap-1.5 group/sender">
                              <span 
                                className="text-[10px] font-black uppercase tracking-wider"
                                style={{ color: colorHSL }}
                              >
                                {msg.usuarios?.nome_completo}
                              </span>
                              <button 
                                onClick={() => triggerDirectMessage(msg.sender_id, msg.usuarios?.nome_completo)}
                                className="p-1 opacity-0 group-hover/sender:opacity-100 hover:bg-[#2BAADF]/10 rounded transition-all text-[#2BAADF]"
                                title={`Enviar DM para ${msg.usuarios?.nome_completo}`}
                              >
                                <MessageSquare className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-wider text-[#2BAADF]">Você</span>
                          )}
                          <span className="text-[10px] text-gray-500 font-bold font-sans">
                            {format(new Date(msg.created_at), 'dd/MM - HH:mm')}
                          </span>
                        </div>
                        
                        <div 
                          className={`max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed relative border transition-all duration-300 ${
                            isMe 
                              ? 'bg-[#2BAADF] text-white border-[#2BAADF]/50 rounded-tr-none shadow-xl shadow-[#2BAADF]/10' 
                              : 'text-gray-100 border-[#ffffff0a] rounded-tl-none hover:border-[#ffffff10]'
                          }`}
                          style={!isMe ? { 
                            backgroundColor: bgColorHSL,
                            borderLeft: `4px solid ${colorHSL}`
                          } : undefined}
                        >
                          <div className="whitespace-pre-wrap">
                            {msg.content.split(/(\[.*?\])/).map((part, i) => {
                              if (part.startsWith('[Card: ') && part.endsWith(']')) {
                                return <span key={i} className="font-black text-orange-400 bg-orange-400/10 px-1 rounded border border-orange-400/20">{part}</span>
                              }
                              if (part.startsWith('[') && part.endsWith(']')) {
                                return <span key={i} className="font-black text-white bg-white/10 px-1 rounded border border-white/20">{part}</span>
                              }
                              return part
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Mention Autocomplete List */}
      {showMentionList && mentionResults.length > 0 && (
        <div className="absolute bottom-[80px] left-4 right-4 bg-[#141414] border border-[#ffffff15] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50 overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
           <div className="px-3 py-2 border-b border-[#ffffff0a] bg-[#ffffff02] flex items-center justify-between">
              <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                {mentionTrigger === '#' ? 'Mencionar Card' : 'Mencionar Contato'}
              </span>
              {searchingMentions && <Loader2 className="w-2.5 h-2.5 animate-spin text-[#2BAADF]" />}
           </div>
           <div className="max-h-[200px] overflow-y-auto custom-scrollbar-main">
              {mentionResults.map((item, index) => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelectMention(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full px-4 py-3 text-left text-xs flex items-center gap-3 transition-colors group ${
                    index === activeIndex ? 'bg-[#2BAADF]/20 text-white' : 'text-gray-300 hover:bg-[#2BAADF]/10'
                  }`}
                >
                  <div className={`w-6 h-6 rounded flex items-center justify-center border transition-colors ${item.type === 'user' ? 'bg-[#2BAADF]/10 border-[#2BAADF]/20 text-[#2BAADF]' : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
                    {item.type === 'user' ? <User className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5" />}
                  </div>
                  <span className="font-bold truncate">{item.label}</span>
                  <span className="ml-auto text-[8px] font-black uppercase opacity-30 tracking-[0.2em] group-hover:opacity-100 transition-opacity">
                    {item.type === 'user' ? 'Membro' : 'Card'}
                  </span>
                </button>
              ))}
           </div>
        </div>
      )}

      {/* Input Area */}
      <form 
        onSubmit={handleSendMessage}
        className="p-5 bg-[#ffffff02] border-t border-[#ffffff0a] shrink-0"
      >
        <div className="relative flex items-center gap-3 bg-[#111] border border-[#ffffff0a] rounded-2xl px-4 py-1.5 focus-within:border-[#2BAADF]/40 focus-within:ring-4 focus-within:ring-[#2BAADF]/5 transition-all">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-white py-3 placeholder:text-gray-600 font-medium"
            placeholder={contextType === 'global' ? "Digite para a equipe (use @ para contatos e # para cards)..." : "Digite uma nota interna sobre este card..."}
            value={newMessage}
            disabled={isPending}
            autoComplete="off"
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || isPending}
            className="w-10 h-10 rounded-xl bg-[#2BAADF] hover:bg-[#1A8FBF] flex items-center justify-center text-white transition-all shadow-lg shadow-[#2BAADF]/20 disabled:opacity-50 disabled:shadow-none translate-x-1"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 shadow-sm" />}
          </button>
        </div>
      </form>
      
      <style jsx>{`
        .custom-scrollbar-main::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar-main::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-main::-webkit-scrollbar-thumb { background: #ffffff0a; border-radius: 10px; }
        .custom-scrollbar-main::-webkit-scrollbar-thumb:hover { background: #ffffff15; }
      `}</style>
    </div>
  )
}
