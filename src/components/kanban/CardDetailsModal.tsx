'use client'

import React, { useEffect, useState, useTransition } from 'react'
import {
  X,
  Edit3,
  Save,
  Trash2,
  ArrowRight,
  History,
  Download,
  Paperclip,
  Loader2,
  UploadCloud,
  MessageSquare,
  Navigation,
  MessageCircle,
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Clock,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import {
  getCardHistory,
  updateCrmCard,
  deleteCrmCard,
  getCardFiles,
  uploadCardFile,
  deleteCardFile,
} from '@/app/(app)/cockpit/crm/actions'
import { createClient } from '@/utils/supabase/client'
import ChatWindow from '@/components/chat/ChatWindow'
import UnifiedChat from '@/components/chat/UnifiedChat'
import Link from 'next/link'
import { buildLeadEditUrl } from '@/lib/kanban/kanban-deep-link'
import CardRedirectPanel from '@/components/kanban/CardRedirectPanel'
import CardWhatsAppPanel from '@/components/kanban/CardWhatsAppPanel'

type CardScreen = 'hub' | 'redirect' | 'whatsapp' | 'edit' | 'chat'

interface HistoryRecord {
  id: string
  acao: string
  created_at: string
  observacao: string | null
  usuarios: { nome_completo?: string } | { nome_completo?: string }[] | null
}

interface Usuario {
  id: string
  nome_completo: string
}

interface Stage {
  id: string
  nome: string
  ordem?: number
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
  currentPipelineName?: string
  stages?: Stage[]
  usuarios: Usuario[]
  onClose: () => void
  canEdit?: boolean
  canDelete?: boolean
  canViewAttachments?: boolean
  canAddAttachments?: boolean
  canDeleteAttachments?: boolean
  initialTab?: 'resumo' | 'chat'
}

const SCREEN_TITLES: Record<CardScreen, string> = {
  hub: 'Card',
  redirect: 'Encaminhar',
  whatsapp: 'WhatsApp',
  edit: 'Editar dados',
  chat: 'Chat interno',
}

export default function CardDetailsModal({
  card,
  currentPipelineId,
  currentPipelineName = 'Funil atual',
  stages = [],
  usuarios,
  onClose,
  canEdit = true,
  canDelete = true,
  canViewAttachments = true,
  canAddAttachments = true,
  canDeleteAttachments = true,
  initialTab = 'resumo',
}: CardDetailsModalProps) {
  const [screen, setScreen] = useState<CardScreen>(initialTab === 'chat' ? 'chat' : 'hub')
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [chatSelection, setChatSelection] = useState<{ type: 'direct'; id: string; name: string } | null>(null)

  const [files, setFiles] = useState<CardFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [formData, setFormData] = useState({
    titulo: card.titulo || '',
    cliente_nome: card.cliente_nome || '',
    valor: card.valor || 0,
    descricao: card.descricao || '',
    observacao: card.observacao || '',
    responsavel_id: card.responsavel_id || '',
    data_prazo: card.data_prazo || '',
  })

  const currentStageName =
    stages.find((s) => s.id === card.stage_id)?.nome ||
    card.pipeline_stages?.nome ||
    '—'

  const responsavelNome =
    card.responsavel?.nome_completo ||
    usuarios.find((u) => u.id === card.responsavel_id)?.nome_completo ||
    'Não atribuído'

  const loadHistory = async () => {
    setLoadingHistory(true)
    const res = await getCardHistory(card.id)
    if (res.data) setHistory(res.data as HistoryRecord[])
    setLoadingHistory(false)
  }

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
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: perfil } = await supabase
          .from('usuarios')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()
        if (perfil) setCurrentUser(perfil)
      }
    }
    init()
  }, [])

  useEffect(() => {
    setScreen(initialTab === 'chat' ? 'chat' : 'hub')
    setFormData({
      titulo: card.titulo || '',
      cliente_nome: card.cliente_nome || '',
      valor: card.valor || 0,
      descricao: card.descricao || '',
      observacao: card.observacao || '',
      responsavel_id: card.responsavel_id || '',
      data_prazo: card.data_prazo || '',
    })
  }, [card.id, initialTab, card.titulo, card.cliente_nome, card.valor, card.descricao, card.observacao, card.responsavel_id, card.data_prazo])

  useEffect(() => {
    loadHistory()
  }, [card.id])

  useEffect(() => {
    if (screen === 'edit') loadFiles()
  }, [screen, card.id])

  const getActionIcon = (acao: string) => {
    switch (acao) {
      case 'CARD_CREATED':
        return <Plus className="w-3 h-3" />
      case 'STATUS_CHANGED':
        return <ArrowRight className="w-3 h-3" />
      case 'TRANSFER_PIPELINE':
        return <Navigation className="w-3 h-3" />
      case 'CARD_EDITED':
        return <Edit3 className="w-3 h-3" />
      case 'CARD_FINISHED':
        return <CheckCircle2 className="w-3 h-3" />
      case 'CARD_REOPENED':
        return <Clock className="w-3 h-3" />
      case 'ATTACHMENT_ADDED':
        return <Paperclip className="w-3 h-3" />
      case 'ATTACHMENT_REMOVED':
        return <Trash2 className="w-3 h-3" />
      default:
        return <Clock className="w-3 h-3" />
    }
  }

  const getActionColor = (acao: string) => {
    switch (acao) {
      case 'CARD_CREATED':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      case 'STATUS_CHANGED':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
      case 'TRANSFER_PIPELINE':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
      case 'CARD_EDITED':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
      case 'CARD_FINISHED':
        return 'text-green-400 bg-green-500/10 border-green-500/20'
      case 'CARD_REOPENED':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      case 'ATTACHMENT_ADDED':
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
      case 'ATTACHMENT_REMOVED':
        return 'text-red-400 bg-red-500/10 border-red-500/20'
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20'
    }
  }

  const getActionLabel = (acao: string) => {
    switch (acao) {
      case 'CARD_CREATED':
        return 'Criação'
      case 'STATUS_CHANGED':
        return 'Progresso'
      case 'TRANSFER_PIPELINE':
        return 'Migração'
      case 'CARD_EDITED':
        return 'Edição'
      case 'CARD_FINISHED':
        return 'Concluído'
      case 'CARD_REOPENED':
        return 'Reaberto'
      case 'ATTACHMENT_ADDED':
        return 'Anexo'
      case 'ATTACHMENT_REMOVED':
        return 'Remoção'
      default:
        return acao.replace(/_/g, ' ')
    }
  }

  const historyUserName = (item: HistoryRecord) => {
    if (Array.isArray(item.usuarios)) return item.usuarios[0]?.nome_completo || 'Sistema'
    return item.usuarios?.nome_completo || 'Sistema'
  }

  const renderMainContent = () => (
    <>
      {screen === 'hub' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#ffffff03] border border-[#ffffff08]">
              <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Responsável</p>
              <p className="text-xs font-bold text-white truncate">{responsavelNome}</p>
            </div>
            <div className="p-3 rounded-xl bg-[#ffffff03] border border-[#ffffff08]">
              <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Prazo</p>
              <p className="text-xs font-bold text-white">
                {card.data_prazo
                  ? new Date(card.data_prazo + 'T00:00:00').toLocaleDateString('pt-BR')
                  : 'Sem prazo'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#ffffff03] border border-[#ffffff08] col-span-2">
              <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Cliente</p>
              <p className="text-xs font-bold text-white truncate">{card.cliente_nome || '—'}</p>
            </div>
          </div>

          {card.descricao && (
            <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3">{card.descricao}</p>
          )}

          {card.observacao && (
            <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/15">
              <p className="text-[9px] font-black text-orange-400/80 uppercase tracking-widest mb-1">
                Observação / briefing
              </p>
              <pre className="text-[11px] text-gray-400 leading-relaxed whitespace-pre-wrap">
                {card.observacao}
              </pre>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setScreen('redirect')}
                className="flex items-center gap-3 w-full p-4 rounded-xl bg-orange-500/10 border border-orange-500/25 hover:bg-orange-500/20 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                  <Navigation className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">Encaminhar</p>
                  <p className="text-[10px] text-gray-500">Operador, prazo e fila/estágio</p>
                </div>
                <ArrowRight className="w-4 h-4 text-orange-500/50 ml-auto group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setScreen('whatsapp')}
              className="flex items-center gap-3 w-full p-4 rounded-xl bg-green-500/10 border border-green-500/25 hover:bg-green-500/20 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm font-black text-white">WhatsApp</p>
                <p className="text-[10px] text-gray-500">
                  {card.conversa_id ? 'Ver histórico e responder' : 'Iniciar conversa'}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-green-500/50 ml-auto group-hover:translate-x-0.5 transition-transform" />
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => setScreen('edit')}
                className="flex items-center gap-3 w-full p-4 rounded-xl bg-[#2BAADF]/10 border border-[#2BAADF]/25 hover:bg-[#2BAADF]/20 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-[#2BAADF]/20 flex items-center justify-center shrink-0">
                  <Edit3 className="w-5 h-5 text-[#2BAADF]" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">Editar dados</p>
                  <p className="text-[10px] text-gray-500">Título, valor, descrição, anexos</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#2BAADF]/50 ml-auto group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setScreen('chat')}
              className="flex items-center gap-3 w-full p-4 rounded-xl bg-[#ffffff05] border border-[#ffffff10] hover:bg-[#ffffff08] transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-[#ffffff08] flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-black text-white">Chat interno</p>
                <p className="text-[10px] text-gray-500">Equipe sobre este card</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-600 ml-auto group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      )}

      {screen === 'redirect' && canEdit && (
        <CardRedirectPanel
          card={card}
          currentPipelineId={currentPipelineId}
          currentPipelineName={currentPipelineName}
          currentStages={stages}
          onDone={onClose}
          onCancel={() => setScreen('hub')}
        />
      )}

      {screen === 'whatsapp' && (
        <CardWhatsAppPanel
          cardId={card.id}
          pipelineId={currentPipelineId}
          conversaId={card.conversa_id}
          leadName={card.cliente_nome}
          onCancel={() => setScreen('hub')}
        />
      )}

      {screen === 'edit' && canEdit && (
        <form onSubmit={handleSaveEdit} className="space-y-4 animate-in fade-in duration-200">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Título</label>
            <input
              type="text"
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              className="w-full bg-[#050505] border border-[#ffffff10] rounded-xl p-3 text-sm text-white outline-none focus:border-[#2BAADF]/50"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cliente</label>
              <input
                type="text"
                value={formData.cliente_nome}
                onChange={(e) => setFormData({ ...formData, cliente_nome: e.target.value })}
                className="w-full bg-[#050505] border border-[#ffffff10] rounded-xl p-3 text-sm text-white outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                value={formData.valor}
                onChange={(e) => setFormData({ ...formData, valor: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#050505] border border-[#ffffff10] rounded-xl p-3 text-sm text-white outline-none"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Descrição</label>
            <textarea
              rows={2}
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              className="w-full bg-[#050505] border border-[#ffffff10] rounded-xl p-3 text-sm text-gray-300 outline-none resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-[#2BAADF] uppercase tracking-widest">Observações</label>
            <textarea
              rows={4}
              value={formData.observacao}
              onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
              className="w-full bg-[#2BAADF]/5 border border-[#2BAADF]/20 rounded-xl p-3 text-sm text-gray-200 outline-none resize-y min-h-[80px]"
            />
          </div>
          {card.lead_id && (
            <Link
              href={buildLeadEditUrl(card.lead_id, { pipelineId: currentPipelineId, cardId: card.id })}
              className="text-[11px] text-[#2BAADF] hover:underline flex items-center gap-1"
            >
              Editar lead vinculado
            </Link>
          )}
          {canViewAttachments && (
            <section className="pt-2 border-t border-[#ffffff08]">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Anexos</p>
              {canAddAttachments && (
                <label className="flex items-center justify-center h-16 border border-dashed border-[#ffffff10] rounded-xl cursor-pointer hover:border-[#2BAADF]/30 mb-2">
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-[#2BAADF]" />
                  ) : (
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <UploadCloud className="w-4 h-4" /> Anexar arquivo
                    </span>
                  )}
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              )}
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {loadingFiles ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-600 mx-auto" />
                ) : files.length === 0 ? (
                  <p className="text-[10px] text-gray-600 italic">Nenhum anexo</p>
                ) : (
                  files.map((file) => (
                    <div key={file.id} className="flex items-center gap-2 p-2 rounded-lg bg-[#ffffff03] text-[10px]">
                      {file.file_type?.startsWith('image/') ? (
                        <ImageIcon className="w-3.5 h-3.5 text-gray-500" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-gray-500" />
                      )}
                      <span className="flex-1 truncate text-gray-400">{file.file_name}</span>
                      {file.download_url && (
                        <a href={file.download_url} target="_blank" rel="noopener noreferrer">
                          <Download className="w-3.5 h-3.5 text-[#2BAADF]" />
                        </a>
                      )}
                      {canDeleteAttachments && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Remover anexo?')) {
                              startTransition(async () => {
                                await deleteCardFile(file.id, file.file_url)
                                await loadFiles()
                              })
                            }
                          }}
                          className="text-gray-600 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#2BAADF] hover:bg-[#1A8FBF] text-white rounded-xl text-sm font-black disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </form>
      )}

      {screen === 'chat' && (
        <div className="h-[min(480px,55vh)] flex flex-col animate-in fade-in duration-200">
          {chatSelection && currentUser ? (
            <>
              <button
                type="button"
                onClick={() => setChatSelection(null)}
                className="text-[10px] text-gray-500 hover:text-white mb-2 flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Voltar ao chat do card
              </button>
              <div className="flex-1 min-h-0">
                <ChatWindow
                  key={`direct-${chatSelection.id}`}
                  contextType="direct"
                  contextId={chatSelection.id}
                  relatedCardId={card.id}
                  currentUserId={currentUser.id}
                />
              </div>
            </>
          ) : currentUser ? (
            <UnifiedChat contextType="card" contextId={card.id} currentUserId={currentUser.id} />
          ) : (
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-600" />
          )}
        </div>
      )}
    </>
  )

  const renderHistorySidebar = () => (
    <aside className="w-[300px] shrink-0 flex flex-col overflow-hidden bg-[#0A0A0A] border-l border-[#ffffff0a] min-h-0">
      <div className="flex items-center justify-between p-5 pb-3 shrink-0">
        <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <History className="w-4 h-4 text-[#2BAADF]" /> Timeline
        </h4>
        <div className="px-2 py-0.5 rounded-full bg-[#ffffff05] border border-[#ffffff0a] text-[9px] font-bold text-gray-500 uppercase">
          {history.length} eventos
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar-thin min-h-0">
        {loadingHistory ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="w-6 h-6 text-[#2BAADF] animate-spin" />
            <p className="text-[10px] text-gray-600 font-bold uppercase">Lendo…</p>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center opacity-30">
            <History className="w-8 h-8 mb-2" />
            <p className="text-xs font-bold uppercase tracking-widest">Sem registros</p>
          </div>
        ) : (
          <div className="relative space-y-1">
            <div className="absolute left-[13px] top-2 bottom-6 w-[2px] bg-gradient-to-b from-[#2BAADF]/20 via-[#ffffff05] to-transparent" />
            {history.map((item) => (
              <div key={item.id} className="relative pl-9 pb-6 group">
                <div
                  className={`absolute left-0 top-1 w-7 h-7 rounded-lg border flex items-center justify-center shadow-lg z-10 ${getActionColor(item.acao)}`}
                >
                  {getActionIcon(item.acao)}
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-[#2BAADF] uppercase tracking-wider block">
                    {getActionLabel(item.acao)}
                  </span>
                  <div className="text-[11px] text-gray-400 font-medium">{historyUserName(item)}</div>
                  <div className="text-[9px] text-gray-600">
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}{' '}
                    {new Date(item.created_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  {item.observacao && (
                    <div className="mt-1.5 text-[10px] text-gray-500 bg-[#ffffff02] p-2 rounded border border-[#ffffff05] line-clamp-2">
                      {item.observacao}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )

  const showHistorySidebar = screen === 'hub' || screen === 'redirect' || screen === 'edit'

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
      if (res?.error) alert('Erro ao salvar: ' + res.error)
      else {
        await loadHistory()
        setScreen('hub')
      }
    })
  }

  const handleDelete = () => {
    if (!canDelete) return
    if (confirm('Excluir permanentemente este card?')) {
      startTransition(async () => {
        const res = await deleteCrmCard(card.id, currentPipelineId)
        if (res?.error) alert('Erro: ' + res.error)
        else onClose()
      })
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || file.size > 5 * 1024 * 1024) {
      if (file) alert('Limite de 5MB.')
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadCardFile(card.id, fd)
    if (res.error) alert(res.error)
    else await loadFiles()
    setUploading(false)
  }

  const modalWidth =
    showHistorySidebar ? 'max-w-5xl' : screen === 'whatsapp' ? 'max-w-lg' : 'max-w-2xl'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className={`bg-[#0F0F0F] border border-[#ffffff10] rounded-2xl w-full ${modalWidth} max-h-[90vh] flex flex-col shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-300`}
      >
        {/* Header compacto */}
        <div className="flex items-center justify-between p-4 border-b border-[#ffffff05] bg-gradient-to-r from-[#111] to-[#161616] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {screen !== 'hub' && (
              <button
                type="button"
                onClick={() => {
                  setChatSelection(null)
                  setScreen('hub')
                }}
                className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-[#ffffff08]"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">
                {screen === 'hub' ? card.titulo : SCREEN_TITLES[screen]}
              </h3>
              {screen === 'hub' && (
                <p className="text-[10px] text-gray-500 truncate">
                  {currentPipelineName} · {currentStageName}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canDelete && screen === 'hub' && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="p-2 text-red-500/50 hover:text-red-500 rounded-lg hover:bg-red-500/10"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-[#ffffff05]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showHistorySidebar ? (
          <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
            <section className="flex-1 min-w-0 overflow-y-auto p-5 custom-scrollbar">
              {renderMainContent()}
            </section>
            {renderHistorySidebar()}
          </div>
        ) : (
          <section className="flex-1 overflow-y-auto p-5 custom-scrollbar min-h-0">
            {renderMainContent()}
          </section>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ffffff10;
          border-radius: 10px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar {
          width: 2px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
          background: #2baadf20;
          border-radius: 10px;
        }
      `}</style>
    </div>
  )
}
