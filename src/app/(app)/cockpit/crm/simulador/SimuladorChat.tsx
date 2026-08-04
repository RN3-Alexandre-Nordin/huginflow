'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { Send, User, Phone, Bot, Sparkles, MessageSquare, Loader2, Mic } from 'lucide-react'
import { processChat, processChatAudio } from './actions'
import { AUDIO_PLACEHOLDER } from '@/lib/omnichannel/audio-transcription-constants'

interface Message {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at?: string
  isAudio?: boolean
}
export default function SimuladorChat({ initialHistory = [] }: { initialHistory?: Message[] }) {
  const [phone, setPhone] = useState('5511999999999')
  const [name, setName] = useState('Cliente Teste')
  const [messages, setMessages] = useState<Message[]>(initialHistory)
  const [input, setInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  
  const formatPhone = (value: string) => {
    if (!value) return ""
    value = value.replace(/\D/g, "")
    value = value.replace(/(\d{2})(\d)/, "($1) $2")
    value = value.replace(/(\d{5})(\d)/, "$1-$2")
    return value.substring(0, 15)
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isPending) return

    const userMessage = input.trim()
    setInput('')
    
    // UI Optimista
    const newUserMsg: Message = { role: 'user', content: userMessage, id: Date.now().toString() }
    setMessages(prev => [...prev, newUserMsg])

    startTransition(async () => {
      const res = await processChat(phone, name, userMessage)

      if ('error' in res) {
        setMessages(prev => [...prev, { role: 'system', content: `ERRO: ${res.error}`, id: (Date.now() + 1).toString() }])
      } else if (res.success && res.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: res.response, id: (Date.now() + 1).toString() }])
      }
    })
  }

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || isPending) return

    const placeholderId = Date.now().toString()
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: AUDIO_PLACEHOLDER,
        id: placeholderId,
        isAudio: true,
      },
    ])

    startTransition(async () => {
      const formData = new FormData()
      formData.set('phone', phone)
      formData.set('name', name)
      formData.set('audio', file)

      const res = await processChatAudio(formData)

      if ('error' in res) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? { ...m, content: `ERRO: ${res.error}`, role: 'system' as const, isAudio: false }
              : m,
          ),
        )
        return
      }

      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === placeholderId
            ? { ...m, content: res.userContent, isAudio: true }
            : m,
        )
        return [
          ...updated,
          {
            role: 'assistant' as const,
            content: res.response,
            id: (Date.now() + 1).toString(),
          },
        ]
      })
    })
  }

  return (
    <div className="flex h-[calc(100vh-180px)] bg-[#0A0A0A] rounded-2xl border border-[#ffffff0a] overflow-hidden shadow-2xl">
      
      {/* Sidebar - Contatos/Config */}
      <div className="w-80 border-r border-[#ffffff0a] bg-[#111111] p-6 flex flex-col gap-6">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#2BAADF]" />
            Simulador
          </h3>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-black">Configurações do Lead</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome do Cliente</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#2BAADF] transition-all"
                placeholder="Ex: João da Silva"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp (Número)</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#2BAADF] transition-all font-mono"
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>
        </div>

        <div className="mt-auto p-4 rounded-xl bg-[#2BAADF]/5 border border-[#2BAADF]/10">
          <p className="text-[10px] leading-relaxed text-[#2BAADF]/80 font-medium italic">
            Envie texto ou um arquivo de áudio (PTT) para testar a transcrição Whisper + resposta da IA — mesmo fluxo do WhatsApp, sem Evolution.
          </p>
        </div>
      </div>

      {/* Área de Chat */}
      <div className="flex-1 flex flex-col relative">
        
        {/* Header do Chat */}
        <div className="p-4 border-b border-[#ffffff0a] flex items-center gap-3 bg-[#111111]/50 backdrop-blur-md sticky top-0 z-10">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#2BAADF] to-[#1A8FBF] flex items-center justify-center shadow-lg">
             <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">{name}</p>
            <p className="text-[10px] text-green-500 font-bold flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
               ONLINE (SIMULADOR)
            </p>
          </div>
        </div>

        {/* Mensagens */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar-thin bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed"
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
               <Sparkles className="w-12 h-12 text-[#2BAADF] mb-4" />
               <p className="text-sm font-medium text-white">Nenhuma mensagem ainda.</p>
               <p className="text-xs text-gray-500 max-w-xs">Envie um "Oi" para começar a simulação e ver a IA do Ragnar em ação.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div 
              key={msg.id || i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              <div className={`max-w-[75%] rounded-2xl p-4 shadow-xl relative ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-[#2BAADF] to-[#1A8FBF] text-white rounded-tr-none' 
                  : msg.role === 'system'
                  ? 'bg-red-500/20 border border-red-500/30 text-red-500 text-xs text-center mx-auto'
                  : 'bg-[#1A1A1A] border border-[#ffffff0a] text-gray-200 rounded-tl-none'
              }`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2 text-[#2BAADF] opacity-80">
                    <Bot className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Ragnar IA</span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {msg.role === 'assistant'
                    ? msg.content.replace(/\[STATUS_CRM:.*?\]/g, '').trim()
                    : msg.isAudio && msg.content === AUDIO_PLACEHOLDER
                      ? (
                        <span className="flex items-center gap-2 italic opacity-80">
                          <Mic className="w-4 h-4 shrink-0" />
                          {msg.content}
                        </span>
                      )
                      : msg.content}
                </p>
                <span className="text-[8px] opacity-40 block mt-2 text-right uppercase font-bold">
                  {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {isPending && (
            <div className="flex justify-start animate-in fade-in duration-300">
              <div className="bg-[#1A1A1A] border border-[#ffffff0a] rounded-2xl p-4 rounded-tl-none flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-[#2BAADF] animate-spin" />
                <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                  Transcrevendo áudio e gerando resposta…
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 bg-[#111111]/80 backdrop-blur-xl border-t border-[#ffffff0a]">
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.webm,.ogg,.mp3,.m4a,.wav"
            className="hidden"
            onChange={handleAudioSelect}
          />
          <form className="flex items-center gap-3 max-w-5xl mx-auto" onSubmit={handleSend}>
            <button
              type="button"
              disabled={isPending}
              onClick={() => audioInputRef.current?.click()}
              title="Enviar áudio (teste de transcrição)"
              className="w-12 h-12 rounded-xl bg-[#0A0A0A] border border-[#ffffff10] flex items-center justify-center text-gray-400 hover:text-[#2BAADF] hover:border-[#2BAADF]/40 transition-all disabled:opacity-50"
            >
              <Mic className="w-5 h-5" />
            </button>
            <input 
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={isPending}
              placeholder="Digite sua mensagem simulada para a IA..."
              className="flex-1 bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-6 py-3 text-sm text-white focus:outline-none focus:border-[#2BAADF] transition-all shadow-inner"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isPending}
              className="w-12 h-12 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] flex items-center justify-center text-white hover:shadow-[0_4px_20px_rgba(43,170,223,0.4)] transition-all disabled:opacity-50 disabled:grayscale"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <div className="mt-2 text-center">
            <p className="text-[9px] text-gray-600 uppercase tracking-widest font-black">Desenvolvido por Ragnar Inbound — Inteligência em Movimento</p>
          </div>
        </div>

      </div>
    </div>
  )
}
