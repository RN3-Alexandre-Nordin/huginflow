'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, X, Bell, User, ExternalLink, Hash, Loader2, Users as UsersIcon, Search } from 'lucide-react'
import ChatWindow from './ChatWindow'
import { getRecentConversations, markChatAsRead } from '@/app/(app)/cockpit/crm/chat-actions'
import { createClient } from '@/utils/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Conversation {
  type: 'global' | 'card' | 'direct'
  id: string
  name: string
  lastMessage?: string
  lastMessageAt: string
  unreadCount: number
}

interface GlobalChatSidebarProps {
  userId: string
  userName: string
  empresaId: string
}

export default function GlobalChatSidebar({ userId, userName, empresaId }: GlobalChatSidebarProps) {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [activeChat, setActiveChat] = useState<{ type: 'global' | 'card' | 'direct', id: string|null, name: string, relatedCardId?: string }>({
     type: 'card',
     id: null,
     name: ''
  })

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: conversations = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['recent-conversations', userId],
    queryFn: async () => {
      const res = await getRecentConversations()
      if (res.error) throw new Error(res.error)
      return (res.data ?? []) as Conversation[]
    },
    enabled: Boolean(userId),
    staleTime: 15_000,
  })

  const scheduleLoadConversations = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => {
      void refetch()
    }, 800)
  }, [refetch])

  // Exhaustive search logic
  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([])
        return
      }
      setSearching(true)
      const { searchAllConversations } = await import('@/app/(app)/cockpit/crm/chat-actions')
      const res = await searchAllConversations(searchQuery)
      if (res.data) {
        setSearchResults(res.data)
      }
      setSearching(false)
    }

    const timer = setTimeout(performSearch, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (!userId || !empresaId) return

    const supabase = createClient()
    const myMention = `[${userName}]`
    const channel = supabase
      .channel(`sidebar-sync-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        const msg = payload.new as {
          sender_id?: string
          context_type?: string
          context_id?: string | null
          content?: string
        }

        const isDirect =
          msg.context_type === 'direct' &&
          (msg.context_id === userId || msg.sender_id === userId)
        const isMention = Boolean(msg.content?.includes(myMention))
        const isCardContext = msg.context_type === 'card'

        if (!isDirect && !isMention && !isCardContext) return

        scheduleLoadConversations()
      })
      .subscribe()

    const handleOpenCard = () => setIsOpen(false)
    window.addEventListener('open-card-modal', handleOpenCard)

    const handleOpenChat = (e: Event) => {
      const { userId: targetUserId, userName: targetUserName, relatedCardId } =
        (e as CustomEvent).detail
      setIsOpen(true)
      setActiveChat({
        type: 'direct',
        id: targetUserId,
        name: targetUserName,
        relatedCardId,
      })
    }

    window.addEventListener('open-direct-chat', handleOpenChat)

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(channel)
      window.removeEventListener('open-direct-chat', handleOpenChat)
      window.removeEventListener('open-card-modal', handleOpenCard)
    }
  }, [empresaId, scheduleLoadConversations, userId, userName])

  // Auto-mark as read when active chat changes
  useEffect(() => {
    if (activeChat.id && isOpen) {
      markChatAsRead(activeChat.type, activeChat.id)
      queryClient.setQueryData<Conversation[]>(['recent-conversations', userId], (prev) =>
        (prev ?? []).map((c) =>
          c.id === activeChat.id && c.type === activeChat.type
            ? { ...c, unreadCount: 0 }
            : c,
        ),
      )
    }
  }, [activeChat.id, activeChat.type, isOpen, queryClient, userId])

  const displayConversations = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults
    }
    return [...conversations].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
  }, [conversations, searchResults, searchQuery])

  return (
    <>
      <button
        type="button"
        data-testid="chat-fab"
        aria-label="Abrir conversas"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 rounded-2xl bg-[#2BAADF] text-white flex items-center justify-center shadow-2xl shadow-[#2BAADF]/40 hover:scale-110 active:scale-95 transition-all z-50 group border border-[#ffffff1a] backdrop-blur-md"
      >
        <div className="relative">
          <MessageSquare className="w-6 h-6 group-hover:rotate-12 transition-transform" />
          {conversations.some(c => c.unreadCount > 0) && (
            <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full border-2 border-[#2BAADF] flex items-center justify-center animate-bounce">
              <span className="text-[10px] font-black text-white">
                {conversations.reduce((acc, c) => acc + c.unreadCount, 0)}
              </span>
            </div>
          )}
        </div>
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] animate-in fade-in duration-500"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        data-testid="chat-panel"
        data-open={isOpen ? 'true' : 'false'}
        className={`fixed top-4 bottom-4 right-4 w-[calc(100%-32px)] max-w-[950px] bg-[#0A0A0A]/95 backdrop-blur-xl border border-[#ffffff0a] rounded-[32px] shadow-[0_0_100px_rgba(0,0,0,0.8)] z-[70] transition-all duration-700 cubic-bezier(0.4, 0, 0.2, 1) flex overflow-hidden ${
          isOpen ? 'translate-x-0 opacity-100' : 'translate-x-[110%] opacity-0'
        }`}
      >
        <div className="w-[320px] md:w-[350px] flex-shrink-0 border-r border-[#ffffff0a] flex flex-col bg-[#ffffff02]">
           <div className="p-6 border-b border-[#ffffff0a]">
              <div className="flex items-center justify-between mb-6">
                 <h4 data-testid="chat-panel-title" className="text-lg font-black text-white italic tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">Conversas</h4>
                 <button onClick={() => setIsOpen(false)} className="md:hidden text-gray-500"><X /></button>
              </div>
              
              <div className="relative group">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-focus-within:text-[#2BAADF] transition-colors" />
                 <input 
                    type="text"
                    placeholder="Buscar chats ou cards..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#141414] border border-[#ffffff0a] rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-gray-700 focus:border-[#2BAADF]/50 outline-none transition-all"
                 />
                 {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                       <Loader2 className="w-3 h-3 animate-spin text-[#2BAADF]" />
                    </div>
                 )}
              </div>
              
              {searchQuery.trim() && !searching && (
                <p className="text-[9px] text-gray-500 font-bold mt-2 uppercase tracking-widest">Resultados Globais</p>
              )}
           </div>

           <div className="flex-1 overflow-y-auto py-2 space-y-0.5 custom-scrollbar-sidebar">
              {loading ? (
                 <div className="px-6 py-4 space-y-4">
                    {[1,2,3,4,5,6].map(i => <div key={i} className="w-full h-16 rounded-2xl bg-white/5 animate-pulse" />)}
                 </div>
              ) : displayConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center opacity-30">
                  <Hash className="w-8 h-8 mb-4 text-[#2BAADF]" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-white">
                    {searchQuery.trim() ? 'Nenhum resultado global' : 'Inicie uma conversa'}
                  </p>
                </div>
              ) : (
                displayConversations.map((conv) => {
                  const isActive = activeChat.id === conv.id && activeChat.type === conv.type
                  const initials = conv.name?.split(' ').map((n:any) => n[0]).join('').substring(0,2).toUpperCase()
                  
                  return (
                    <button 
                      key={`${conv.type}-${conv.id}`}
                      onClick={() => setActiveChat({ type: conv.type, id: conv.id, name: conv.name })}
                      className={`w-full px-4 flex items-center gap-3 py-4 transition-all relative group border-y border-transparent ${
                        isActive ? 'bg-[#2BAADF]/10 border-[#2BAADF]/10' : 'hover:bg-[#ffffff05]'
                      }`}
                    >
                      {isActive && <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#2BAADF] rounded-r-full shadow-[0_0_10px_#2BAADF]" />}
                      
                      <div className="relative shrink-0">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-[13px] font-black transition-all ${
                          isActive 
                            ? (conv.type === 'card' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-[#2BAADF] text-white shadow-lg shadow-[#2BAADF]/20') 
                            : (conv.type === 'card' ? 'bg-orange-500/10 border border-orange-500/20 text-orange-500' : 'bg-[#1A1A1A] border border-[#ffffff0a] text-gray-500 group-hover:border-[#ffffff20]')
                        }`}>
                          {conv.type === 'card' ? <Hash className="w-5 h-5" /> : initials}
                        </div>
                        {conv.type === 'direct' && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0A0A0A]" />
                        )}
                      </div>

                      <div className="flex-1 text-left truncate min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-1.5 truncate">
                            {conv.type === 'card' && (
                               <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-500 text-[8px] font-black uppercase tracking-tighter border border-orange-500/10">
                                 Card
                               </span>
                            )}
                            <p className={`text-[13px] font-bold truncate ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                              {conv.name}
                            </p>
                          </div>
                          {conv.lastMessageAt && conv.lastMessageAt !== new Date(0).toISOString() && (
                            <span className="text-[9px] text-gray-400 font-bold whitespace-nowrap">
                              {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false, locale: ptBR })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-gray-500 truncate leading-tight group-hover:text-gray-400 font-medium">
                             {conv.lastMessage || (conv.type === 'card' ? 'Discussão de Processo' : 'Inicie uma conversa')}
                          </p>
                          {conv.unreadCount > 0 && (
                            <div className="shrink-0 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center px-1 shadow-lg shadow-red-500/20 animate-pulse">
                              <span className="text-[9px] font-black text-white">{conv.unreadCount}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
           </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#050505]/50 relative">
           {activeChat.id ? (
             <>
               <div className="h-20 flex-shrink-0 px-8 border-b border-[#ffffff0a] flex items-center justify-between bg-[#ffffff02] backdrop-blur-md">
                  <div className="flex items-center gap-4">
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${
                       activeChat.type === 'card' ? 'bg-orange-500 shadow-orange-500/10' : 'bg-[#2BAADF] shadow-[#2BAADF]/10'
                     }`}>
                        {activeChat.type === 'card' ? <Hash className="w-5 h-5" /> : <User className="w-5 h-5" />}
                     </div>
                     <div>
                        <h4 className="text-base font-black text-white tracking-tight">{activeChat.name}</h4>
                        <div className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                           <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                             {activeChat.type === 'card' ? 'Thread do Card' : 'Ativo Agora'}
                           </p>
                        </div>
                     </div>
                  </div>

                  <div className="flex items-center gap-2">
                     {activeChat.type === 'card' && (
                        <button 
                           onClick={() => {
                              window.dispatchEvent(new CustomEvent('open-card-modal', { 
                                 detail: { cardId: activeChat.id, tab: 'resumo' } 
                              }))
                           }}
                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-500 transition-all hover:scale-105 active:scale-95 group mr-4"
                        >
                           <ExternalLink className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                           <span className="text-[10px] font-black uppercase tracking-widest">Gestão do Card</span>
                        </button>
                     )}
                     <button className="p-2 hover:bg-white/5 rounded-xl transition-all text-gray-600 hover:text-white border border-transparent hover:border-[#ffffff0a]">
                        <Bell className="w-4 h-4" />
                     </button>
                     <button 
                       onClick={() => setIsOpen(false)}
                       className="p-2 hover:bg-white/5 rounded-xl transition-all text-gray-600 hover:text-white border border-transparent hover:border-[#ffffff0a]"
                     >
                        <X className="w-5 h-5" />
                     </button>
                  </div>
               </div>

               <div className="flex-1 overflow-hidden relative">
                  {userId ? (
                     <ChatWindow 
                        key={`${activeChat.type}-${activeChat.id}`}
                        contextType={activeChat.type as any} 
                        contextId={activeChat.id || undefined}
                        relatedCardId={activeChat.relatedCardId}
                        currentUserId={userId} 
                     />
                  ) : (
                     <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <Loader2 className="w-8 h-8 animate-spin text-[#2BAADF]" />
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Carregando Workspace...</p>
                     </div>
                  )}
               </div>
             </>
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center mb-6 animate-pulse">
                   <MessageSquare className="w-8 h-8 text-gray-600" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 italic tracking-tighter">BEM-VINDO AO HUGIN FLOW CHAT</h3>
                <p className="text-xs text-gray-500 max-w-[280px] font-medium leading-relaxed">
                   Selecione uma conversa relevante ou um card para iniciar a colaboração.
                </p>
                
                <div className="mt-12 grid grid-cols-2 gap-4 w-full max-w-sm">
                   <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-left">
                      <Hash className="w-4 h-4 text-orange-500 mb-2" />
                      <p className="text-[10px] font-black text-white uppercase mb-1">Mencione Cards</p>
                      <p className="text-[9px] text-gray-600 font-medium">Use # no chat geral para vincular processos.</p>
                   </div>
                   <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-left">
                      <UsersIcon className="w-4 h-4 text-[#2BAADF] mb-2" />
                      <p className="text-[10px] font-black text-white uppercase mb-1">Foco Seletivo</p>
                      <p className="text-[9px] text-gray-600 font-medium">Cards irrelevantes são filtrados para você.</p>
                   </div>
                </div>
             </div>
           )}
        </div>
        
        <div className="absolute bottom-4 left-[370px] pointer-events-none opacity-40">
           <p className="text-[9px] text-gray-700 font-black uppercase tracking-[0.3em]"> 
              HuginFlow Communications System
           </p>
        </div>
      </div>
    </>
  )
}
