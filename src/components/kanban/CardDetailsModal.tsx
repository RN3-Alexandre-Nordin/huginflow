'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { X, Clock, Navigation, Link as LinkIcon, User, Edit3, Save, Trash2, CheckCircle2, AlertCircle, ArrowRight, History, CalendarDays, Plus, FileText, Image as ImageIcon, FileArchive, Download, ExternalLink, Paperclip, Loader2, UploadCloud, Hash, MessageSquare, Bell } from 'lucide-react'
import { getCardHistory, transferCardPipeline, updateCrmCard, deleteCrmCard, getCardFiles, uploadCardFile, deleteCardFile, getTransferablePipelines } from '@/app/(app)/cockpit/crm/actions'
import { createClient } from '@/utils/supabase/client'
import ChatWindow from '@/components/chat/ChatWindow'
import UnifiedChat from '@/components/chat/UnifiedChat'
import Link from 'next/link'
import { buildOmniChatUrl } from '@/lib/omni/chat-deep-link'

interface HistoryRecord {
  id: string
  acao: string
  created_at: string
  observacao: string | null
  usuarios: any
  de_stage: any
  para_stage: any
  de_pipeline: any
  para_pipeline: any
}

interface Usuario {
  id: string
  nome_completo: string
}

interface CardFile {
  id: string
  file_name: string
  file_url: string
  file_type: string
  download_url?: string
  created_at: string
}

interface CardDetailsModalProps {
  card: any
  currentPipelineId: string
  usuarios: Usuario[]
  onClose: () => void
  canEdit?: boolean
  canDelete?: boolean
  canViewAttachments?: boolean
  canAddAttachments?: boolean
  canDeleteAttachments?: boolean
  initialTab?: 'resumo' | 'chat'
}

export default function CardDetailsModal({ 
  card, 
  currentPipelineId, 
  usuarios, 
  onClose,
  canEdit = true,
  canDelete = true,
  canViewAttachments = true,
  canAddAttachments = true,
  canDeleteAttachments = true,
  initialTab = 'resumo'
}: CardDetailsModalProps) {
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [currentUser, setCurrentUser] = useState<any>(null)
  
  const [activeTab, setActiveTab] = useState<'resumo' | 'chat'>(initialTab)
  const [chatSelection, setChatSelection] = useState<{ type: 'direct', id: string, name: string } | null>(null)

  // Attachments State
  const [files, setFiles] = useState<CardFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [uploading, setUploading] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    titulo: card.titulo || '',
    cliente_nome: card.cliente_nome || '',
    valor: card.valor || 0,
    descricao: card.descricao || '',
    observacao: card.observacao || '',
    responsavel_id: card.responsavel_id || '',
    data_prazo: card.data_prazo || ''
  })

  // Transfer State
  const [pipelines, setPipelines] = useState<any[]>([])
  const [targetPipeline, setTargetPipeline] = useState('')
  const [targetStage, setTargetStage] = useState('')

  const loadFiles = async () => {
    if (!canViewAttachments) return
    setLoadingFiles(true)
    const res = await getCardFiles(card.id)
    if (res.data) setFiles(res.data)
    setLoadingFiles(false)
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      // Load History
      const res = await getCardHistory(card.id)
      if (res.data) setHistory(res.data)
      setLoadingHistory(false)

      // Load Files
      await loadFiles()

      // Load Available Pipelines for Transfer
      const resPipes = await getTransferablePipelines()
      if (resPipes.data) {
         setPipelines(resPipes.data.filter((p: any) => p.id !== currentPipelineId))
      }

      // Get Current User for Chat
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: perfil } = await supabase.from('usuarios').select('id').eq('auth_user_id', user.id).single()
        if (perfil) setCurrentUser(perfil)
      }
    }
    init()
  }, [card.id, currentPipelineId, canViewAttachments])

  useEffect(() => {
    setActiveTab(initialTab)
    setFormData({
      titulo: card.titulo || '',
      cliente_nome: card.cliente_nome || '',
      valor: card.valor || 0,
      descricao: card.descricao || '',
      observacao: card.observacao || '',
      responsavel_id: card.responsavel_id || '',
      data_prazo: card.data_prazo || '',
    })
    setTargetPipeline('')
    setTargetStage('')
  }, [card.id, initialTab, card.titulo, card.cliente_nome, card.valor, card.descricao, card.observacao, card.responsavel_id, card.data_prazo])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      alert('Arquivo muito grande! O limite é 5MB.')
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    const res = await uploadCardFile(card.id, formData)
    if (res.error) {
       alert('Erro ao subir arquivo: ' + res.error)
    } else {
       await loadFiles()
       // Refresh History
       const hRes = await getCardHistory(card.id)
       if (hRes.data) setHistory(hRes.data)
    }
    setUploading(false)
  }

  const handleFileDelete = async (fileId: string, storagePath: string) => {
    if (!confirm('Tem certeza que deseja excluir este anexo?')) return

    startTransition(async () => {
       const res = await deleteCardFile(fileId, storagePath)
       if (res.error) {
          alert('Erro ao excluir: ' + res.error)
       } else {
          await loadFiles()
          // Refresh History
          const hRes = await getCardHistory(card.id)
          if (hRes.data) setHistory(hRes.data)
       }
    })
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit) return
    startTransition(async () => {
      const fd = new FormData()
      fd.append('titulo', formData.titulo)
      fd.append('cliente_nome', formData.cliente_nome)
      fd.append('valor', formData.valor.toString())
      fd.append('descricao', formData.descricao)
      fd.append('observacao', formData.observacao)
      fd.append('responsavel_id', formData.responsavel_id || '')
      fd.append('data_prazo', formData.data_prazo || '')

      const res = await updateCrmCard(card.id, currentPipelineId, fd)
      if (res?.error) {
        alert('Erro ao salvar: ' + res.error)
      } else {
        const hRes = await getCardHistory(card.id)
        if (hRes.data) setHistory(hRes.data)
      }
    })
  }

  const handleTransfer = () => {
    if (!canEdit || !targetPipeline || !targetStage) return
    startTransition(async () => {
      const res = await transferCardPipeline(card.id, currentPipelineId, targetPipeline, targetStage, 'Transferência manual pelo Kanban.')
      if (res?.error) {
        alert('Erro ao transferir: ' + res.error)
      } else {
        onClose()
      }
    })
  }

  const handleDelete = () => {
    if (!canDelete) return
    if (confirm('Tem certeza que deseja excluir permanentemente este card? Esta ação não pode ser desfeita.')) {
      startTransition(async () => {
        const res = await deleteCrmCard(card.id, currentPipelineId)
        if (res?.error) {
          alert('Erro ao excluir: ' + res.error)
        } else {
          onClose()
        }
      })
    }
  }

  const getActionIcon = (acao: string) => {
    switch (acao) {
      case 'CARD_CREATED': return <Plus className="w-3 h-3" />
      case 'STATUS_CHANGED': return <ArrowRight className="w-3 h-3" />
      case 'TRANSFER_PIPELINE': return <Navigation className="w-3 h-3" />
      case 'CARD_EDITED': return <Edit3 className="w-3 h-3" />
      case 'CARD_FINISHED': return <CheckCircle2 className="w-3 h-3" />
      case 'CARD_REOPENED': return <Clock className="w-3 h-3" />
      case 'ATTACHMENT_ADDED': return <Paperclip className="w-3 h-3" />
      case 'ATTACHMENT_REMOVED': return <Trash2 className="w-3 h-3" />
      default: return <Clock className="w-3 h-3" />
    }
  }

  const getActionColor = (acao: string) => {
    switch (acao) {
      case 'CARD_CREATED': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      case 'STATUS_CHANGED': return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
      case 'TRANSFER_PIPELINE': return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
      case 'CARD_EDITED': return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
      case 'CARD_FINISHED': return 'text-green-400 bg-green-500/10 border-green-500/20'
      case 'CARD_REOPENED': return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      case 'ATTACHMENT_ADDED': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
      case 'ATTACHMENT_REMOVED': return 'text-red-400 bg-red-500/10 border-red-500/20'
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
       <div className="bg-[#0F0F0F] border border-[#ffffff10] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[#ffffff05] bg-gradient-to-r from-[#111] to-[#161616] shrink-0">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#2BAADF]/10 flex items-center justify-center border border-[#2BAADF]/20">
                   <Edit3 className="w-6 h-6 text-[#2BAADF]" />
                </div>
                <div>
                   <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                      Gestão de Lead: <span className="text-[#2BAADF]">{card.titulo}</span>
                   </h3>
                   <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#ffffff0a] text-gray-500 uppercase tracking-widest border border-[#ffffff05]">ID: {card.id.slice(0,8)}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-500 uppercase tracking-widest border border-green-500/20">Ativo</span>
                   </div>
                </div>
             </div>
             <div className="flex items-center gap-3">
                {canDelete && (
                  <button 
                    onClick={handleDelete}
                    disabled={isPending}
                    className="p-2.5 text-red-500/50 hover:text-red-500 rounded-xl hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                    title="Excluir Card"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button onClick={onClose} className="p-2.5 text-gray-500 hover:text-white rounded-xl hover:bg-[#ffffff05] transition-all border border-transparent hover:border-[#ffffff10]">
                   <X className="w-5 h-5" />
                </button>
             </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-[#ffffff0a]">
             
             {/* Esquerda: Conteúdo Principal / Edição / Chat */}
             <div className="flex-1 overflow-hidden flex flex-col p-8 space-y-6">
                
                {/* Tabs Navigation */}
                <div className="flex items-center gap-1 p-1 bg-[#ffffff05] border border-[#ffffff0a] rounded-xl w-fit shrink-0">
                   <button 
                     onClick={() => setActiveTab('resumo')}
                     className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'resumo' ? 'bg-[#2BAADF] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                   >
                     Dados & Resumo
                   </button>
                   <button 
                     onClick={() => setActiveTab('chat')}
                     className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 group ${activeTab === 'chat' ? 'bg-[#2BAADF] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                   >
                     Chat Interno
                     <div className={`w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse ${activeTab === 'chat' ? 'hidden' : 'block'}`} />
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                   {activeTab === 'resumo' ? (
                      <div className="space-y-8 animate-in fade-in duration-300">
                
                        {canEdit ? (
                          <form onSubmit={handleSaveEdit} className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Título da Negociação</label>
                                <input 
                                  type="text" 
                                  value={formData.titulo}
                                  onChange={e => setFormData({...formData, titulo: e.target.value})}
                                  className="w-full bg-[#050505] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl p-3 text-sm text-white outline-none transition-all shadow-inner"
                                  placeholder="Ex: Contrato de Manutenção..."
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome do Cliente</label>
                                <input 
                                  type="text" 
                                  value={formData.cliente_nome}
                                  onChange={e => setFormData({...formData, cliente_nome: e.target.value})}
                                  className="w-full bg-[#050505] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl p-3 text-sm text-white outline-none transition-all shadow-inner"
                                  placeholder="Nome do contato ou empresa"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Valor Estimado (R$)</label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-sm">R$</span>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={formData.valor}
                                    onChange={e => setFormData({...formData, valor: parseFloat(e.target.value) || 0})}
                                    className="w-full bg-[#050505] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl py-3 pl-10 pr-4 text-sm text-[#2BAADF] font-bold outline-none transition-all shadow-inner"
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Vínculo de Lead</label>
                                <div className="w-full bg-[#ffffff03] border border-dashed border-[#ffffff10] rounded-xl p-3 text-[11px] text-gray-500 flex items-center justify-between italic">
                                   {card.lead_id ? 'Vínculo ativo com CRM Central' : 'Lead gerado manualmente no Kanban'}
                                   {card.lead_id && <LinkIcon className="w-3 h-3" />}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1"><User className="w-3 h-3" />Responsável (encaminhar para)</label>
                                <select
                                  value={formData.responsavel_id}
                                  onChange={e => setFormData({...formData, responsavel_id: e.target.value})}
                                  className="w-full bg-[#050505] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl p-3 text-sm text-gray-300 outline-none transition-all"
                                >
                                  <option value="">— Sem responsável —</option>
                                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome_completo}</option>)}
                                </select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1"><CalendarDays className="w-3 h-3" />Data de Entrega Prevista</label>
                                <input
                                  type="date"
                                  value={formData.data_prazo}
                                  onChange={e => setFormData({...formData, data_prazo: e.target.value})}
                                  className="w-full bg-[#050505] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl p-3 text-sm text-gray-300 outline-none transition-all [color-scheme:dark]"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Descrição do Negócio</label>
                              <textarea 
                                rows={3}
                                value={formData.descricao}
                                onChange={e => setFormData({...formData, descricao: e.target.value})}
                                className="w-full bg-[#050505] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl p-4 text-sm text-gray-300 outline-none transition-all shadow-inner resize-none"
                                placeholder="Detalhes sobre a oportunidade..."
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-[#2BAADF] uppercase tracking-widest ml-1">Anotações Estratégicas e Histórico de Contato (Obs.)</label>
                              <textarea 
                                rows={10}
                                value={formData.observacao}
                                onChange={e => setFormData({...formData, observacao: e.target.value})}
                                className="w-full bg-[#2BAADF]/5 border border-[#2BAADF]/20 focus:border-[#2BAADF]/50 rounded-xl p-4 text-sm text-gray-200 outline-none transition-all shadow-inner resize-y custom-scrollbar-thin"
                                placeholder="Registre aqui todos os detalhes das interações, combinados e próximos passos..."
                              />
                            </div>

                            {canViewAttachments && (
                              <section className="pt-2">
                                <div className="flex items-center justify-between border-b border-[#ffffff0a] pb-2 mb-4">
                                  <h5 className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                                    <Paperclip className="w-3.5 h-3.5 text-[#2BAADF]" /> Anexos e Documentos
                                  </h5>
                                  <span className="text-[10px] font-bold text-gray-600 bg-[#ffffff05] px-2 py-0.5 rounded-full">
                                    {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}
                                  </span>
                                </div>
                                {canAddAttachments && (
                                  <div className="mb-4">
                                    <label className={`relative flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 group ${uploading ? 'border-[#2BAADF]/50 bg-[#2BAADF]/5 cursor-wait' : 'border-[#ffffff0a] hover:border-[#2BAADF]/30 hover:bg-[#ffffff03]'}`}>
                                      <div className="flex flex-col items-center justify-center pt-2 pb-2">
                                        {uploading ? (
                                          <Loader2 className="w-6 h-6 text-[#2BAADF] animate-spin mb-2" />
                                        ) : (
                                          <UploadCloud className="w-6 h-6 text-gray-500 group-hover:text-[#2BAADF] mb-1 transition-colors" />
                                        )}
                                        <p className="text-[11px] font-bold text-gray-500">
                                          {uploading ? 'Subindo arquivo...' : 'Clique ou arraste para anexar'}
                                        </p>
                                        <p className="text-[9px] text-gray-600">PDF, Imagens ou Docs (Max 5MB)</p>
                                      </div>
                                      <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" />
                                    </label>
                                  </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1 kanban-scroll">
                                  {loadingFiles ? (
                                    <div className="col-span-full py-6 flex flex-col items-center justify-center opacity-20">
                                      <Loader2 className="w-6 h-6 animate-spin mb-2" />
                                      <p className="text-[10px] uppercase font-black tracking-widest">Carregando anexos...</p>
                                    </div>
                                  ) : files.length === 0 ? (
                                    <div className="col-span-full py-6 border border-[#ffffff05] rounded-2xl bg-[#ffffff02] flex flex-col items-center justify-center opacity-25">
                                      <FileArchive className="w-8 h-8 mb-2" />
                                      <p className="text-[10px] uppercase font-black tracking-widest text-center px-4">Nenhum arquivo anexado</p>
                                    </div>
                                  ) : (
                                    files.map(file => (
                                      <div key={file.id} className="flex items-center gap-3 p-3 bg-[#ffffff03] border border-[#ffffff05] rounded-xl group hover:border-[#2BAADF]/20 hover:bg-[#ffffff05] transition-all">
                                        <div className="p-2 rounded-lg bg-[#000] border border-[#ffffff0a] text-gray-400 group-hover:text-[#2BAADF] transition-colors">
                                          {file.file_type?.startsWith('image/') ? <ImageIcon className="w-4 h-4" /> :
                                           file.file_type === 'application/pdf' ? <FileText className="w-4 h-4" /> :
                                           <Paperclip className="w-4 h-4" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[11px] font-bold text-gray-300 truncate" title={file.file_name}>{file.file_name}</p>
                                          <p className="text-[9px] text-gray-500">{new Date(file.created_at).toLocaleDateString('pt-BR')}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          {file.download_url && (
                                            <a href={file.download_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-500 hover:text-white hover:bg-[#ffffff0a] rounded-lg transition-all" title="Baixar">
                                              <Download className="w-3.5 h-3.5" />
                                            </a>
                                          )}
                                          {canDeleteAttachments && (
                                            <button type="button" onClick={() => handleFileDelete(file.id, file.file_url)} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all" title="Remover">
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </section>
                            )}

                            <div className="pt-4 border-t border-[#ffffff05]">
                              <h4 className="flex items-center gap-2 text-xs font-black text-gray-500 mb-4 uppercase tracking-widest font-sans px-1">
                                <Navigation className="w-3.5 h-3.5 text-orange-500" /> Encaminhar para outro funil
                              </h4>
                              <div className="flex flex-col md:flex-row gap-3 items-end p-5 bg-[#0A0A0A] border border-[#ffffff08] rounded-2xl shadow-inner">
                                <div className="flex-1 space-y-2 w-full">
                                  <label className="text-[10px] font-bold text-gray-600 uppercase ml-1">Pipeline destino</label>
                                  <select
                                    className="w-full bg-[#111] border border-[#ffffff10] text-xs text-gray-300 rounded-xl p-3 outline-none focus:border-[#2BAADF] transition-all"
                                    value={targetPipeline}
                                    onChange={e => {
                                      const pId = e.target.value
                                      setTargetPipeline(pId)
                                      if (pId) {
                                        const pipe = pipelines.find(p => p.id === pId)
                                        setTargetStage(pipe?.pipeline_stages?.[0]?.id ?? '')
                                      } else {
                                        setTargetStage('')
                                      }
                                    }}
                                  >
                                    <option value="">Permanecer no funil atual</option>
                                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                  </select>
                                </div>
                                {targetPipeline && (
                                  <div className="flex-1 space-y-2 w-full">
                                    <label className="text-[10px] font-bold text-gray-600 uppercase ml-1">Estágio inicial</label>
                                    <select
                                      className="w-full bg-[#111] border border-[#ffffff10] text-xs text-white font-bold rounded-xl p-3 outline-none focus:border-[#2BAADF] transition-all"
                                      value={targetStage}
                                      onChange={e => setTargetStage(e.target.value)}
                                    >
                                      {pipelines.find(p => p.id === targetPipeline)?.pipeline_stages?.map((st: any) => (
                                        <option key={st.id} value={st.id}>{st.nome}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={handleTransfer}
                                  disabled={!targetPipeline || !targetStage || isPending}
                                  className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-orange-500/10 disabled:opacity-50 h-[46px] font-sans shrink-0"
                                >
                                  {isPending ? 'Migrando...' : 'Mover agora'}
                                </button>
                              </div>
                              {card.conversa_id && (
                                <p className="text-[10px] text-gray-600 mt-3 ml-1">
                                  WhatsApp vinculado —{' '}
                                  <Link href={buildOmniChatUrl(card.conversa_id, card.id)} target="_blank" className="text-green-500 hover:text-green-400 underline underline-offset-2">
                                    abrir no Chat Omnichannel
                                  </Link>
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-3 pt-4">
                              <button 
                                type="submit" 
                                disabled={isPending}
                                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#2BAADF] hover:bg-[#1A8FBF] text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-[#2BAADF]/20 disabled:opacity-50 font-sans"
                              >
                                {isPending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : <Save className="w-4 h-4" />}
                                Salvar alterações
                              </button>
                              <button 
                                type="button"
                                onClick={onClose}
                                className="px-6 py-3.5 bg-[#ffffff08] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-sm font-bold text-gray-300 transition-all font-sans"
                              >
                                Fechar
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="space-y-8 animate-in fade-in duration-500">
                            {/* View Mode Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-[#ffffff03] border border-[#ffffff05] p-5 rounded-2xl relative overflow-hidden group">
                                   <div className="absolute top-0 right-0 w-24 h-24 bg-[#2BAADF]/5 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:scale-150" />
                                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Valor da Operação</p>
                                   <h4 className="text-3xl font-black text-white leading-none">
                                      <span className="text-sm font-bold text-[#2BAADF] mr-1.5">R$</span>
                                      {card.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                   </h4>
                                </div>
                                <div className="bg-[#ffffff03] border border-[#ffffff05] p-5 rounded-2xl relative overflow-hidden group">
                                   <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:scale-150" />
                                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Contato / Cliente</p>
                                   <div className="flex items-center gap-3 mt-1">
                                      <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                                         <User className="w-4 h-4" />
                                      </div>
                                      <h4 className="text-lg font-bold text-white truncate">{card.cliente_nome || "Genérico"}</h4>
                                   </div>
                                </div>
                            </div>
                            {/* Responsável e Prazo */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-[#ffffff03] border border-[#ffffff05] p-5 rounded-2xl">
                                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><User className="w-3 h-3" />Responsável</p>
                                   {card.responsavel?.nome_completo ? (
                                     <div className="flex items-center justify-between">
                                       <div className="flex items-center gap-2">
                                         <div className="w-8 h-8 rounded-full bg-[#2BAADF]/10 flex items-center justify-center text-[#2BAADF] text-xs font-black border border-[#2BAADF]/20">
                                           {card.responsavel.nome_completo.split(' ').slice(0,2).map((n: string) => n[0]).join('').toUpperCase()}
                                         </div>
                                         <span className="text-sm font-semibold text-white">{card.responsavel.nome_completo}</span>
                                       </div>
                                       <button 
                                         onClick={() => {
                                           setActiveTab('chat')
                                           setChatSelection({ 
                                             type: 'direct', 
                                             id: card.responsavel.id, 
                                             name: card.responsavel.nome_completo 
                                           })
                                         }}
                                         className="p-2 hover:bg-[#2BAADF]/10 rounded-xl transition-all text-[#2BAADF] group/dm"
                                         title={`Chat privado sobre este card com ${card.responsavel.nome_completo}`}
                                       >
                                         <MessageSquare className="w-4 h-4 group-hover/dm:scale-110 transition-transform" />
                                       </button>
                                     </div>
                                   ) : (
                                     <p className="text-sm text-gray-600 italic">Não atribuído</p>
                                   )}
                                </div>
                                <div className="bg-[#ffffff03] border border-[#ffffff05] p-5 rounded-2xl">
                                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><CalendarDays className="w-3 h-3" />Data de Entrega</p>
                                   {card.data_prazo ? (
                                     <p className="text-sm font-bold text-white">{new Date(card.data_prazo + 'T00:00:00').toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'})}</p>
                                   ) : (
                                     <p className="text-sm text-gray-600 italic">Sem prazo definido</p>
                                   )}
                                   {card.stage_entered_at && (
                                     <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />Neste estágio desde {new Date(card.stage_entered_at).toLocaleDateString('pt-BR')}</p>
                                   )}
                                </div>
                            </div>

                            <div className="space-y-6">
                               <section>
                                  <h5 className="flex items-center gap-2 text-xs font-black text-gray-400 border-b border-[#ffffff0a] pb-2 mb-4 uppercase tracking-widest">
                                     <AlertCircle className="w-3.5 h-3.5 text-[#2BAADF]" /> Descritivo do Negócio
                                  </h5>
                                  <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap px-1">
                                     {card.descricao || "Nenhuma descrição técnica foi inserida para este card."}
                                  </p>
                               </section>

                               {/* Seção de Anexos */}
                               {canViewAttachments && (
                                 <section>
                                    <div className="flex items-center justify-between border-b border-[#ffffff0a] pb-2 mb-4">
                                      <h5 className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                                         <Paperclip className="w-3.5 h-3.5 text-[#2BAADF]" /> Anexos e Documentos
                                      </h5>
                                      <span className="text-[10px] font-bold text-gray-600 bg-[#ffffff05] px-2 py-0.5 rounded-full">
                                        {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}
                                      </span>
                                    </div>

                                    {/* Upload Area */}
                                    {canAddAttachments && (
                                      <div className="mb-4">
                                        <label className={`
                                          relative flex flex-col items-center justify-center w-full h-24 
                                          border-2 border-dashed rounded-2xl cursor-pointer
                                          transition-all duration-300 group
                                          ${uploading ? 'border-[#2BAADF]/50 bg-[#2BAADF]/5 cursor-wait' : 'border-[#ffffff0a] hover:border-[#2BAADF]/30 hover:bg-[#ffffff03]'}
                                        `}>
                                          <div className="flex flex-col items-center justify-center pt-2 pb-2">
                                            {uploading ? (
                                              <Loader2 className="w-6 h-6 text-[#2BAADF] animate-spin mb-2" />
                                            ) : (
                                              <UploadCloud className="w-6 h-6 text-gray-500 group-hover:text-[#2BAADF] mb-1 transition-colors" />
                                            )}
                                            <p className="text-[11px] font-bold text-gray-500">
                                              {uploading ? 'Subindo arquivo...' : 'Clique ou arraste para anexar'}
                                            </p>
                                            <p className="text-[9px] text-gray-600">PDF, Imagens ou Docs (Max 5MB)</p>
                                          </div>
                                          <input 
                                            type="file" 
                                            className="hidden" 
                                            onChange={handleFileUpload} 
                                            disabled={uploading}
                                            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                                          />
                                        </label>
                                      </div>
                                    )}

                                    {/* Files List */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1 kanban-scroll">
                                      {loadingFiles ? (
                                        <div className="col-span-full py-10 flex flex-col items-center justify-center opacity-20">
                                          <Loader2 className="w-6 h-6 animate-spin mb-2" />
                                          <p className="text-[10px] uppercase font-black tracking-widest">Carregando anexos...</p>
                                        </div>
                                      ) : files.length === 0 ? (
                                        <div className="col-span-full py-10 border border-[#ffffff05] rounded-2xl bg-[#ffffff02] flex flex-col items-center justify-center opacity-25">
                                          <FileArchive className="w-8 h-8 mb-2" />
                                          <p className="text-[10px] uppercase font-black tracking-widest text-center px-4">Nenhum arquivo anexado a este card</p>
                                        </div>
                                      ) : (
                                        files.map(file => (
                                          <div key={file.id} className="flex items-center gap-3 p-3 bg-[#ffffff03] border border-[#ffffff05] rounded-xl group hover:border-[#2BAADF]/20 hover:bg-[#ffffff05] transition-all">
                                             <div className={`p-2 rounded-lg bg-[#000] border border-[#ffffff0a] text-gray-400 group-hover:text-[#2BAADF] transition-colors`}>
                                                {file.file_type?.startsWith('image/') ? <ImageIcon className="w-4 h-4" /> :
                                                 file.file_type === 'application/pdf' ? <FileText className="w-4 h-4" /> :
                                                 <Paperclip className="w-4 h-4" />}
                                             </div>
                                             <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-bold text-gray-300 truncate" title={file.file_name}>
                                                   {file.file_name}
                                                </p>
                                                <p className="text-[9px] text-gray-500">
                                                   {new Date(file.created_at).toLocaleDateString('pt-BR')}
                                                </p>
                                             </div>
                                             <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {file.download_url && (
                                                  <a 
                                                    href={file.download_url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-[#ffffff0a] rounded-lg transition-all"
                                                    title="Baixar Arquivo"
                                                  >
                                                     <Download className="w-3.5 h-3.5" />
                                                  </a>
                                                )}
                                                {canDeleteAttachments && (
                                                  <button 
                                                    onClick={() => handleFileDelete(file.id, file.file_url)}
                                                    className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                    title="Remover Anexo"
                                                  >
                                                     <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                                )}
                                             </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                 </section>
                               )}
                                
                                {/* Seção de Observações (Notas) */}
                                {card.observacao && (
                                  <section className="bg-[#2BAADF]/5 border border-[#2BAADF]/20 p-5 rounded-2xl relative">
                                     <h5 className="flex items-center gap-2 text-xs font-black text-[#2BAADF] mb-3 uppercase tracking-widest">
                                        <CheckCircle2 className="w-3.5 h-3.5 font-bold" /> Notas Estratégicas e Registro de Contato
                                     </h5>
                                     <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar-thin">
                                        <p className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">
                                           {card.observacao}
                                        </p>
                                     </div>
                                  </section>
                                )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
                         {chatSelection ? (
                           <>
                             {/* Chat Header / Breadcrumb */}
                             <div className="flex items-center justify-between mb-4 border-b border-[#ffffff0a] pb-4 shrink-0">
                                <div className="flex items-center gap-3">
                                   <button 
                                     onClick={() => setChatSelection(null)}
                                     className="p-2 hover:bg-[#ffffff05] rounded-lg transition-all text-gray-500 hover:text-white"
                                   >
                                      <ArrowRight className="w-4 h-4 rotate-180" />
                                   </button>
                                   <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 text-xs font-black border border-orange-500/20">
                                         {chatSelection.name[0]}
                                      </div>
                                      <div>
                                         <h4 className="text-[11px] font-black text-white uppercase tracking-wider">Chat Privado</h4>
                                         <p className="text-[10px] text-gray-500">Falando com {chatSelection.name}</p>
                                      </div>
                                   </div>
                                </div>
                                <div className="px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[8px] font-black text-red-500 uppercase tracking-tighter">
                                   Ambiente Restrito
                                </div>
                             </div>

                             {currentUser ? (
                               <div className="flex-1 min-h-0">
                                 <ChatWindow 
                                   key={`direct-${chatSelection.id}`}
                                   contextType="direct"
                                   contextId={chatSelection.id}
                                   relatedCardId={card.id}
                                   currentUserId={currentUser.id}
                                 />
                               </div>
                             ) : (
                               <div className="flex items-center justify-center h-full opacity-25">
                                  <Loader2 className="w-6 h-6 animate-spin" />
                               </div>
                             )}
                           </>
                         ) : (
                           <div className="h-full flex flex-col min-h-0">
                              {currentUser ? (
                                <div className="h-full flex flex-col min-h-0">
                                   <UnifiedChat 
                                     contextType="card"
                                     contextId={card.id}
                                     currentUserId={currentUser.id}
                                   />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center h-full opacity-25">
                                   <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                              )}
                            </div>
                         )}
                      </div>
                    )}
                 </div>
              </div>

              {/* Direita: Timeline de Auditoria Premium */}
              <div className="w-full lg:w-[350px] bg-[#0A0A0A] p-8 flex flex-col overflow-hidden border-t lg:border-t-0 lg:border-l border-[#ffffff0a]">
                 <div className="flex items-center justify-between mb-8 shrink-0">
                   <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 font-sans">
                      <History className="w-4 h-4 text-[#2BAADF]" /> Timeline
                   </h4>
                   <div className="px-2 py-0.5 rounded-full bg-[#ffffff05] border border-[#ffffff0a] text-[9px] font-bold text-gray-500 uppercase tracking-tighter font-sans">
                     {history.length} Eventos
                   </div>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar-thin">
                    {loadingHistory ? (
                       <div className="flex flex-col items-center justify-center py-20 space-y-4">
                          <div className="animate-spin w-8 h-8 border-2 border-[#2BAADF]/50 border-t-[#2BAADF] rounded-full" />
                          <p className="text-[10px] text-gray-600 font-bold uppercase animate-pulse">Lendo...</p>
                       </div>
                    ) : history.length === 0 ? (
                       <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                          <History className="w-10 h-10 mb-3" />
                          <p className="text-xs font-bold uppercase tracking-widest font-sans">Sem Registros</p>
                       </div>
                    ) : (
                       <div className="relative space-y-1">
                          <div className="absolute left-[13px] top-2 bottom-6 w-[2px] bg-gradient-to-b from-[#2BAADF]/20 via-[#ffffff05] to-transparent" />
                          {history.map((item) => (
                             <div key={item.id} className="relative pl-9 pb-8 group animate-in slide-in-from-bottom-2 duration-300">
                                <div className={`absolute left-0 top-1 w-7 h-7 rounded-lg border flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 z-10 ${getActionColor(item.acao)}`}>
                                   {getActionIcon(item.acao)}
                                </div>
                                <div className="space-y-1">
                                   <span className="text-[10px] font-black text-[#2BAADF] uppercase tracking-wider block">
                                      {item.acao === 'CARD_CREATED' && 'Criação'}
                                      {item.acao === 'STATUS_CHANGED' && 'Progresso'}
                                      {item.acao === 'TRANSFER_PIPELINE' && 'Migração'}
                                      {item.acao === 'CARD_EDITED' && 'Edição'}
                                      {item.acao === 'CARD_FINISHED' && 'Concluído'}
                                      {item.acao === 'CARD_REOPENED' && 'Reaberto'}
                                      {item.acao === 'ATTACHMENT_ADDED' && 'Anexo'}
                                      {item.acao === 'ATTACHMENT_REMOVED' && 'Remoção'}
                                   </span>
                                   <div className="text-[11px] text-gray-400 font-medium">
                                      {item.usuarios?.nome_completo || 'Sistema'}
                                   </div>
                                   <div className="text-[9px] text-gray-600 font-sans">
                                      {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                   </div>
                                   {/* Event Description Snippet */}
                                   <div className="mt-2 text-[10px] text-gray-500 bg-[#ffffff02] p-2 rounded border border-[#ffffff05] truncate">
                                      {item.observacao || 'Registro automático de sistema.'}
                                   </div>
                                </div>
                             </div>
                          ))}
                       </div>
                    )}
                 </div>
              </div>
          </div>

          <style jsx>{`
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #ffffff10; border-radius: 10px; }
            
            .custom-scrollbar-thin::-webkit-scrollbar { width: 2px; }
            .custom-scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar-thin::-webkit-scrollbar-thumb { background: #2BAADF20; border-radius: 10px; }
          `}</style>
       </div>
    </div>
  )
}
