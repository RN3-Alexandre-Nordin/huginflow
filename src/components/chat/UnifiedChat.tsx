'use client'

import React, { useEffect, useState, useRef, useTransition } from 'react'
import { Send, MessageSquare, User, Clock, Link as LinkIcon, Loader2, Paperclip, Hash, ExternalLink } from 'lucide-react'
import { sendChatMessage, getChatMessages, getCompanyUsers } from '@/app/(app)/cockpit/crm/chat-actions'
import { searchCrmCards } from '@/app/(app)/cockpit/crm/actions'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/utils/supabase/client'

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
}

interface UnifiedChatProps {
  contextType: 'global' | 'card' | 'direct'
  contextId?: string
  currentUserId: string
  onCardClick?: (cardId: string) => void
}

export default function UnifiedChat({ 
  contextType, 
  contextId, 
  currentUserId,
  onCardClick
}: UnifiedChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mentions State
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionTrigger, setMentionTrigger] = useState<'@' | '#' | null>(null)
  const [showMentionList, setShowMentionList] = useState(false)
  const [mentionResults, setMentionResults] = useState<{id: string, label: string, type: 'card' | 'user'}[]>([])
  const [searchingMentions, setSearchingMentions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const getHSLColor = (userId: string) => {
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash)
    }
    const h = Math.abs(hash) % 360
    return h
  }

  const loadMessages = async () => {
    setLoading(true)
    const res = await getChatMessages(contextType, contextId)
    if (res.data) setMessages(res.data)
    setLoading(false)
  }

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  useEffect(() => {
    loadMessages()
    
    const supabase = createClient()
    const channel = supabase
      .channel(`chat:${contextType}:${contextId || 'global'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
           // Skip if not related to this context
           if (payload.new.context_type !== contextType) return
           if (contextId && payload.new.context_id !== contextId) return
           
           const { data: fullMsg } = await supabase
            .from('chat_messages')
            .select('*, usuarios(id, nome_completo)')
            .eq('id', payload.new.id)
            .single()
           
           if (fullMsg) {
             setMessages(prev => {
                if (prev.some(m => m.id === fullMsg.id)) return prev
                return [...prev, fullMsg]
             })
           }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [contextType, contextId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Mention Autocomplete Logic
  useEffect(() => {
    const handleMention = async () => {
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || isPending) return

    const content = newMessage.trim()
    setNewMessage('')

    startTransition(async () => {
      const res = await sendChatMessage(content, contextType, contextId)
      if (res.data) {
        setMessages(prev => [...prev.filter(m => m.id !== res.data.id), res.data])
      } else if (res.error) {
        alert('Erro ao enviar: ' + res.error)
      }
    })
  }

  return (
    <div className="flex flex-col h-full bg-[#0F0F0F] rounded-2xl border border-[#ffffff0a] shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#ffffff0a] bg-[#ffffff02] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 rounded-xl bg-[#2BAADF]/10 border border-[#2BAADF]/20 flex items-center justify-center text-[#2BAADF]">
              <MessageSquare className="w-4 h-4" />
           </div>
           <div>
              <h5 className="text-[11px] font-black text-white uppercase tracking-widest leading-none">
                {contextType === 'global' ? 'Equipe HuginFlow' : 'Chat do Card'}
              </h5>
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter mt-1">Ambiente Seguro & Monitorado</p>
           </div>
        </div>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-[#2BAADF]" />}
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar-main scroll-smooth"
      >
        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-30 select-none pointer-events-none">
             <div className="w-16 h-16 rounded-full bg-[#ffffff05] border border-dashed border-[#ffffff10] flex items-center justify-center">
                <MessageSquare className="w-8 h-8" />
             </div>
             <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Início da Discussão</p>
                <p className="text-[9px] mt-1">Mencione seus colegas com @ para notificá-los.</p>
             </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId
            const hue = getHSLColor(msg.sender_id)
            const colorHSL = `hsl(${hue}, 70%, 50%)`
            const bgColorHSL = `hsla(${hue}, 70%, 50%, 0.15)`
            
            return (
              <div 
                key={msg.id} 
                className={`flex flex-col ${isMe ? 'items-end text-right' : 'items-start text-left'} mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                {/* Metadados Externos (Cabeçalho da Mensagem) */}
                <div className={`flex items-center gap-2 mb-1.5 px-1 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                   <span 
                    className="text-[10px] font-black uppercase tracking-wider"
                    style={!isMe ? { color: colorHSL } : { color: '#2BAADF' }}
                   >
                     {isMe ? 'Você' : msg.usuarios?.nome_completo}
                   </span>
                   <span className="text-[10px] text-gray-500 font-bold font-sans">
                     {format(new Date(msg.created_at), 'dd/MM - HH:mm')}
                   </span>
                </div>
                
                {/* Balão de Texto (Corpo) */}
                <div 
                  className={`max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed relative border group transition-all duration-300 ${
                    isMe 
                      ? 'bg-[#2BAADF] text-white border-[#2BAADF]/50 rounded-tr-none shadow-xl shadow-[#2BAADF]/10' 
                      : `text-gray-100 rounded-tl-none border-[#ffffff05] hover:border-[#ffffff10]`
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
          })
        )}
      </div>

      {/* Mention Results Overlay */}
      {showMentionList && mentionResults.length > 0 && (
        <div className="absolute bottom-[85px] left-4 right-4 bg-[#141414] border border-[#ffffff15] rounded-2xl shadow-[0_15px_50px_rgba(0,0,0,0.8)] z-50 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
           <div className="px-4 py-2 border-b border-[#ffffff0a] bg-[#ffffff03] flex items-center justify-between">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {mentionTrigger === '#' ? 'Mencionar Card' : 'Mencionar Contato'}
              </span>
              {searchingMentions && <Loader2 className="w-3 h-3 animate-spin text-[#2BAADF]" />}
           </div>
           <div className="max-h-[250px] overflow-y-auto custom-scrollbar-main">
              {mentionResults.map((item, index) => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelectMention(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full px-5 py-4 text-left text-[13px] flex items-center justify-between border-b border-[#ffffff05] last:border-0 transition-all ${
                    index === activeIndex ? 'bg-[#2BAADF] text-white' : 'text-gray-400 hover:bg-[#ffffff05]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                     <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${index === activeIndex ? 'bg-white/20 border-white/20' : item.type === 'user' ? 'bg-[#2BAADF]/10 border-[#2BAADF]/20 text-[#2BAADF]' : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
                        {item.type === 'user' ? <User className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                     </div>
                     <span className="font-bold">{item.label}</span>
                  </div>
                  {index === activeIndex && <div className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded uppercase">Selecionar</div>}
                </button>
              ))}
           </div>
        </div>
      )}

      {/* Input */}
      <div className="p-5 bg-[#ffffff02] border-t border-[#ffffff0a] shrink-0">
         <form 
           onSubmit={handleSendMessage}
           className="relative flex items-center gap-3 bg-[#111] border border-[#ffffff0a] rounded-2xl p-1.5 focus-within:border-[#2BAADF]/50 transition-all shadow-inner"
         >
           <div className="p-3 text-gray-600">
              <Paperclip className="w-4 h-4" />
           </div>
           <input
             ref={inputRef}
             type="text"
             className="flex-1 bg-transparent border-none outline-none text-[13px] text-white px-2 py-3 placeholder:text-gray-600 font-medium"
             placeholder={contextType === 'global' ? "Equipe HuginFlow (use @ para contatos)..." : "Discussão Interna do Card (use @ ou #)..."}
             value={newMessage}
             disabled={isPending}
             autoComplete="off"
             onChange={(e) => setNewMessage(e.target.value)}
             onKeyDown={handleKeyDown}
           />
           <button
             type="submit"
             disabled={!newMessage.trim() || isPending}
             className="w-11 h-11 rounded-xl bg-[#2BAADF] hover:bg-[#1A8FBF] flex items-center justify-center text-white transition-all shadow-lg shadow-[#2BAADF]/20 disabled:opacity-50 disabled:shadow-none active:scale-95"
           >
             {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
           </button>
         </form>
      </div>
      
      <style jsx>{`
        .custom-scrollbar-main::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar-main::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-main::-webkit-scrollbar-thumb { background: #ffffff0a; border-radius: 10px; }
        .custom-scrollbar-main::-webkit-scrollbar-thumb:hover { background: #2BAADF20; }
      `}</style>
    </div>
  )
}

