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
  StickyNote,
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
import { getSessaoIdByCardId } from '@/app/(app)/cockpit/crm/omni-chat-actions'
import { navigateToOmniChat } from '@/lib/omni/chat-deep-link'

type CardScreen = 'hub' | 'redirect' | 'whatsapp' | 'edit' | 'attachments' | 'chat'

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
  initialTab?: 'resumo' | 'chat' | 'whatsapp'
}

const SCREEN_TITLES: Record<CardScreen, string> = {
  hub: 'Card',
  redirect: 'Encaminhar',
  whatsapp: 'WhatsApp',
  edit: 'Editar dados',
  attachments: 'Anexos',
  chat: 'Chat interno',
}

function HubActionButton({
  icon,
  label,
  hint,
  tone,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  tone: 'orange' | 'green' | 'blue' | 'lilac' | 'neutral'
  onClick: () => void
  disabled?: boolean
}) {
  const tones = {
    orange: 'bg-orange-500/8 border-orange-500/20 hover:bg-orange-500/15 text-orange-400',
    green: 'bg-emerald-500/8 border-emerald-500/20 hover:bg-emerald-500/15 text-emerald-400',
    blue: 'bg-[#2BAADF]/8 border-[#2BAADF]/20 hover:bg-[#2BAADF]/15 text-[#2BAADF]',
    lilac: 'bg-purple-500/8 border-purple-500/25 hover:bg-purple-500/15 text-purple-400',
    neutral: 'bg-[#ffffff04] border-[#ffffff10] hover:bg-[#ffffff08] text-gray-400',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={`hub-action-${label.toLowerCase()}`}
      title={`${label} — ${hint}`}
      className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-md border transition-all disabled:opacity-40 ${tones[tone]}`}
    >
      <div className="w-5 h-5 rounded-md bg-black/25 flex items-center justify-center shrink-0 [&>svg]:w-3 [&>svg]:h-3">
        {icon}
      </div>
      <span className="text-[9px] font-bold text-white leading-none truncate max-w-full">{label}</span>
      <span className="text-[7px] text-gray-500 leading-none truncate max-w-full">{hint}</span>
    </button>
  )
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
  const [screen, setScreen] = useState<CardScreen>(
    initialTab === 'chat' ? 'chat' : initialTab === 'whatsapp' ? 'whatsapp' : 'hub',
  )
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false)
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
  const [observacaoDraft, setObservacaoDraft] = useState(card.observacao || '')
  const [savedObservacao, setSavedObservacao] = useState(card.observacao || '')

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
    const obs = card.observacao || ''
    setFormData({
      titulo: card.titulo || '',
      cliente_nome: card.cliente_nome || '',
      valor: card.valor || 0,
      descricao: card.descricao || '',
      observacao: obs,
      responsavel_id: card.responsavel_id || '',
      data_prazo: card.data_prazo || '',
    })
    setObservacaoDraft(obs)
    setSavedObservacao(obs)
  }, [card.id, initialTab, card.titulo, card.cliente_nome, card.valor, card.descricao, card.observacao, card.responsavel_id, card.data_prazo])

  useEffect(() => {
    loadHistory()
  }, [card.id])

  useEffect(() => {
    if (screen === 'edit' || screen === 'attachments' || screen === 'hub') loadFiles()
  }, [screen, card.id])

  const attachmentsHint =
    loadingFiles && files.length === 0
      ? 'Carregando…'
      : files.length === 0
        ? 'Nenhum anexo'
        : `${files.length} arquivo${files.length === 1 ? '' : 's'}`

  const renderHubAttachmentsStrip = () => {
    if (!canViewAttachments) return null

    return (
      <div
        data-testid="hub-attachments-strip"
        className="flex flex-col min-w-0 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] overflow-hidden"
      >
        <div className="flex items-center gap-1.5 px-2 py-1 border-b border-cyan-500/15 shrink-0">
          {canAddAttachments ? (
            <label
              data-testid="hub-attachments-clip"
              className="w-7 h-7 rounded-md bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-cyan-400 hover:bg-cyan-500/25 cursor-pointer shrink-0"
              title="Anexar arquivo"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Paperclip className="w-3.5 h-3.5" />
              )}
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          ) : (
            <div className="w-7 h-7 rounded-md bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-cyan-400 shrink-0">
              <Paperclip className="w-3.5 h-3.5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-black uppercase tracking-widest text-cyan-400/90">Anexos</p>
            <p className="text-[9px] text-gray-500 truncate">{attachmentsHint}</p>
          </div>
          <button
            type="button"
            data-testid="hub-attachments-ver"
            onClick={() => setScreen('attachments')}
            className="text-[8px] font-black uppercase tracking-wide text-cyan-400/80 hover:text-cyan-300 px-1.5 py-1 rounded hover:bg-cyan-500/10 shrink-0"
          >
            Ver
          </button>
        </div>
        <div className="max-h-[52px] overflow-y-auto px-1.5 py-1 space-y-0.5 custom-scrollbar-thin">
          {loadingFiles ? (
            <div className="flex justify-center py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-600" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-[9px] text-gray-600 italic px-1 py-1.5">
              {canAddAttachments ? 'Clique no clipe para anexar' : 'Sem arquivos'}
            </p>
          ) : (
            files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-[#ffffff06] group"
              >
                {file.file_type?.startsWith('image/') ? (
                  <ImageIcon className="w-3 h-3 text-cyan-400 shrink-0" />
                ) : (
                  <FileText className="w-3 h-3 text-gray-500 shrink-0" />
                )}
                <span className="flex-1 min-w-0 truncate text-[10px] text-gray-300 font-medium">
                  {file.file_name}
                </span>
                {file.download_url && (
                  <a
                    href={file.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-70 group-hover:opacity-100 text-[#2BAADF] shrink-0"
                    title="Baixar"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  const renderAttachmentsPanel = () => (
    <div className="flex-1 min-h-0 flex flex-col gap-3 animate-in fade-in duration-200">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Anexe boletos, comprovantes e documentos do processo (máx. 5 MB por arquivo).
      </p>
      {canAddAttachments && (
        <label className="flex items-center justify-center h-20 border border-dashed border-[#ffffff12] rounded-xl cursor-pointer hover:border-violet-500/40 hover:bg-violet-500/5 transition-colors">
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
          ) : (
            <span className="text-[11px] text-gray-400 flex items-center gap-2 font-medium">
              <UploadCloud className="w-4 h-4 text-violet-400" />
              Clique para anexar arquivo
            </span>
          )}
          <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
        </label>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 custom-scrollbar-thin">
        {loadingFiles ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
          </div>
        ) : files.length === 0 ? (
          <p className="text-[11px] text-gray-600 italic text-center py-8">Nenhum anexo neste card.</p>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#ffffff03] border border-[#ffffff08] text-[11px]"
            >
              {file.file_type?.startsWith('image/') ? (
                <ImageIcon className="w-4 h-4 text-violet-400 shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-gray-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-gray-300 font-medium">{file.file_name}</p>
                <p className="text-[9px] text-gray-600">
                  {new Date(file.created_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {file.download_url && (
                <a
                  href={file.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-[#2BAADF] hover:bg-[#2BAADF]/10"
                  title="Baixar"
                >
                  <Download className="w-4 h-4" />
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
                        await loadHistory()
                      })
                    }
                  }}
                  className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )

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

  const observacaoDirty = observacaoDraft.trim() !== (savedObservacao || '').trim()

  const saveObservacao = () => {
    if (!canEdit || !observacaoDirty) return
    startTransition(async () => {
      const fd = new FormData()
      fd.append('titulo', formData.titulo)
      fd.append('cliente_nome', formData.cliente_nome)
      fd.append('valor', formData.valor.toString())
      fd.append('descricao', formData.descricao)
      fd.append('observacao', observacaoDraft)
      fd.append('responsavel_id', formData.responsavel_id || '')
      fd.append('data_prazo', formData.data_prazo || '')

      const res = await updateCrmCard(card.id, currentPipelineId, fd)
      if (res?.error) {
        alert('Erro ao salvar observações: ' + res.error)
        return
      }
      setSavedObservacao(observacaoDraft)
      setFormData((prev) => ({ ...prev, observacao: observacaoDraft }))
      await loadHistory()
    })
  }

  const renderHub = () => (
    <div data-testid="card-hub" className="flex-1 min-h-0 grid grid-rows-[auto_minmax(200px,1fr)_auto] gap-2">
      <div
        className={`grid gap-1.5 ${canViewAttachments ? 'grid-cols-[1.15fr_0.85fr]' : 'grid-cols-1'}`}
      >
        <div data-testid="hub-meta" className="grid grid-cols-3 gap-1 min-w-0 content-start">
          <div className="px-1.5 py-1 rounded-md bg-[#ffffff03] border border-[#ffffff08] min-w-0 self-start">
            <p className="text-[7px] font-black text-gray-600 uppercase tracking-widest leading-none mb-0.5">
              Responsável
            </p>
            <p className="text-[10px] font-bold text-white truncate leading-tight">{responsavelNome}</p>
          </div>
          <div className="px-1.5 py-1 rounded-md bg-[#ffffff03] border border-[#ffffff08] min-w-0 self-start">
            <p className="text-[7px] font-black text-gray-600 uppercase tracking-widest leading-none mb-0.5">
              Prazo
            </p>
            <p className="text-[10px] font-bold text-white truncate leading-tight">
              {card.data_prazo
                ? new Date(card.data_prazo + 'T00:00:00').toLocaleDateString('pt-BR')
                : 'Sem prazo'}
            </p>
          </div>
          <div className="px-1.5 py-1 rounded-md bg-[#ffffff03] border border-[#ffffff08] min-w-0 self-start">
            <p className="text-[7px] font-black text-gray-600 uppercase tracking-widest leading-none mb-0.5">
              Cliente
            </p>
            <p className="text-[10px] font-bold text-white truncate leading-tight">
              {card.cliente_nome || '—'}
            </p>
          </div>
        </div>
        {renderHubAttachmentsStrip()}
      </div>

      <div
        data-testid="hub-observacoes"
        className="min-h-[200px] h-full flex flex-col rounded-xl border border-[#2BAADF]/25 bg-[#111111] overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#2BAADF]/15 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <StickyNote className="w-3.5 h-3.5 text-[#2BAADF] shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest text-[#2BAADF]">
              Observações
            </span>
            {observacaoDirty && (
              <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wide">
                · não salvo
              </span>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              data-testid="hub-observacoes-salvar"
              onClick={saveObservacao}
              disabled={isPending || !observacaoDirty}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide bg-[#2BAADF] text-white hover:bg-[#1A8FBF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Salvar
            </button>
          )}
        </div>
        {canEdit ? (
          <textarea
            value={observacaoDraft}
            onChange={(e) => setObservacaoDraft(e.target.value)}
            placeholder="Briefing, contexto do atendimento, próximos passos…"
            rows={8}
            className="block w-full h-full min-h-[160px] bg-[#0A0A0A] px-3 py-2.5 text-[11px] text-gray-200 leading-relaxed outline-none resize-none placeholder:text-gray-600 border-0"
          />
        ) : (
          <div className="h-full min-h-[160px] px-3 py-2.5 overflow-y-auto bg-[#0A0A0A] custom-scrollbar-thin">
            <p className="text-[11px] text-gray-400 leading-relaxed whitespace-pre-wrap line-clamp-[8]">
              {observacaoDraft.trim() || 'Sem observações registradas.'}
            </p>
          </div>
        )}
      </div>

      <div
        data-testid="hub-actions"
        className="flex flex-row items-stretch gap-1.5 self-end w-full shrink-0"
      >
        {canEdit && (
          <HubActionButton
            tone="orange"
            label="Encaminhar"
            hint="Operador e funil"
            icon={<Navigation />}
            onClick={() => setScreen('redirect')}
          />
        )}
        <HubActionButton
          tone="green"
          label="WhatsApp"
          hint={
            card.finalizado
              ? 'Consulta'
              : card.conversa_id
                ? 'Abrir chat'
                : 'Iniciar'
          }
          icon={openingWhatsApp ? <Loader2 className="animate-spin" /> : <MessageCircle />}
          disabled={openingWhatsApp}
          onClick={() => {
            void (async () => {
              if (card.finalizado) {
                setScreen('whatsapp')
                return
              }
              setOpeningWhatsApp(true)
              try {
                let sid = (card.conversa_id as string | null) ?? null
                if (!sid) {
                  const res = await getSessaoIdByCardId(card.id)
                  sid = res.data
                }
                if (sid) {
                  navigateToOmniChat(sid, card.id)
                  return
                }
                setScreen('whatsapp')
              } finally {
                setOpeningWhatsApp(false)
              }
            })()
          }}
        />
        {canEdit && (
          <HubActionButton
            tone="lilac"
            label="Editar"
            hint="Título e valor"
            icon={<Edit3 />}
            onClick={() => setScreen('edit')}
          />
        )}
        <HubActionButton
          tone="blue"
          label="Chat"
          hint="Equipe no card"
          icon={<MessageSquare />}
          onClick={() => setScreen('chat')}
        />
      </div>
    </div>
  )

  const renderMainContent = () => (
    <>
      {screen === 'hub' && renderHub()}

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
          readOnly={Boolean(card.finalizado)}
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
            <button
              type="button"
              onClick={() => setScreen('attachments')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold border border-violet-500/25 bg-violet-500/8 text-violet-300 hover:bg-violet-500/15 transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Gerenciar anexos
              {files.length > 0 && (
                <span className="text-[9px] font-black text-violet-400/80">({files.length})</span>
              )}
            </button>
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

      {screen === 'attachments' && canViewAttachments && renderAttachmentsPanel()}

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
    <aside className="w-[220px] shrink-0 flex flex-col overflow-hidden bg-[#0A0A0A] border-l border-[#ffffff0a] min-h-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#ffffff08] shrink-0">
        <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.15em] flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-[#2BAADF]" /> Timeline
        </h4>
        <span className="text-[8px] font-bold text-gray-600 uppercase">{history.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 custom-scrollbar-thin min-h-0">
        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 text-[#2BAADF] animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-[10px] text-gray-600 italic text-center py-8">Sem registros</p>
        ) : (
          <ul className="space-y-3">
            {history.map((item) => (
              <li key={item.id} className="flex gap-2.5">
                <div
                  className={`w-6 h-6 shrink-0 rounded-md border flex items-center justify-center mt-0.5 ${getActionColor(item.acao)}`}
                >
                  {getActionIcon(item.acao)}
                </div>
                <div className="min-w-0 flex-1 border-l border-[#ffffff08] pl-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[9px] font-black text-[#2BAADF] uppercase tracking-wide truncate">
                      {getActionLabel(item.acao)}
                    </span>
                    <span className="text-[8px] text-gray-600 font-mono shrink-0">
                      {new Date(item.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 truncate">{historyUserName(item)}</p>
                  {item.observacao && (
                    <p className="text-[9px] text-gray-600 mt-0.5 line-clamp-2 leading-snug">
                      {item.observacao}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )

  const showHistorySidebar =
    screen === 'hub' || screen === 'redirect' || screen === 'edit' || screen === 'attachments'

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
        setSavedObservacao(formData.observacao)
        setObservacaoDraft(formData.observacao)
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
    showHistorySidebar ? 'max-w-4xl' : screen === 'whatsapp' ? 'max-w-lg' : 'max-w-2xl'

  const modalHeight =
    screen === 'hub' && showHistorySidebar
      ? 'h-[min(640px,90vh)]'
      : 'max-h-[90vh]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" data-testid="card-modal">
      <div
        className={`bg-[#0F0F0F] border border-[#ffffff10] rounded-2xl w-full ${modalWidth} ${modalHeight} flex flex-col shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in-95 duration-300`}
      >
        {/* Header compacto */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#ffffff05] bg-gradient-to-r from-[#111] to-[#161616] shrink-0">
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
            <section
              className={`flex-1 min-w-0 min-h-0 p-3 ${
                screen === 'hub'
                  ? 'overflow-hidden flex flex-col'
                  : 'overflow-y-auto custom-scrollbar'
              }`}
            >
              {renderMainContent()}
            </section>
            {renderHistorySidebar()}
          </div>
        ) : (
          <section className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0">
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
