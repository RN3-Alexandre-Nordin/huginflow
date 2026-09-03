'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  X,
  Plus,
  User,
  CalendarDays,
  DollarSign,
  LayoutTemplate,
  Search,
  Loader2,
  UserPlus,
} from 'lucide-react'
import { createCrmCard } from '@/app/(app)/cockpit/crm/actions'
import {
  searchLeadsForOmni,
  type OmniLeadOption,
} from '@/app/(app)/cockpit/crm/omni-actions'
import { createQuickLead } from '@/app/(app)/cockpit/crm/leads/actions'

interface Stage { id: string; nome: string; ordem: number }
interface Usuario { id: string; nome_completo: string }

interface KanbanNewCardModalProps {
  pipelineId: string
  stages: Stage[]
  usuarios: Usuario[]
  currentUserId?: string
  onClose: () => void
}

const inputCls = "w-full bg-[#0A0A0A] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl p-3 text-sm text-white outline-none transition-all placeholder-gray-600 [color-scheme:dark]"
const selectCls = "w-full bg-[#0A0A0A] border border-[#ffffff10] focus:border-[#2BAADF]/50 rounded-xl p-3 text-sm text-gray-300 outline-none transition-all"
const labelCls = "text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5 block"

function formatLeadPhone(lead: OmniLeadOption): string {
  return lead.telefone || lead.whatsapp || '— sem telefone'
}

export default function KanbanNewCardModal({
  pipelineId,
  stages,
  usuarios,
  currentUserId,
  onClose,
}: KanbanNewCardModalProps) {
  const [isPending, startTransition] = useTransition()
  const [selectedStage, setSelectedStage] = useState(stages[0]?.id || '')
  const [formError, setFormError] = useState<string | null>(null)

  const [leadMode, setLeadMode] = useState<'search' | 'register'>('search')
  const [leadQuery, setLeadQuery] = useState('')
  const [leadResults, setLeadResults] = useState<OmniLeadOption[]>([])
  const [searchingLeads, setSearchingLeads] = useState(false)
  const [selectedLead, setSelectedLead] = useState<OmniLeadOption | null>(null)

  const [newLeadNome, setNewLeadNome] = useState('')
  const [newLeadWhatsapp, setNewLeadWhatsapp] = useState('')
  const [newLeadTelefone, setNewLeadTelefone] = useState('')
  const [newLeadEmail, setNewLeadEmail] = useState('')
  const [creatingLead, setCreatingLead] = useState(false)

  const sortedStages = [...stages].sort((a, b) => a.ordem - b.ordem)

  useEffect(() => {
    if (leadMode !== 'search' || selectedLead) {
      setLeadResults([])
      return
    }
    const q = leadQuery.trim()
    if (q.length < 2) {
      setLeadResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearchingLeads(true)
      const res = await searchLeadsForOmni(q)
      setSearchingLeads(false)
      if (!res.error) setLeadResults(res.data)
    }, 300)

    return () => clearTimeout(timer)
  }, [leadQuery, leadMode, selectedLead])

  async function handleCreateLead() {
    setFormError(null)
    setCreatingLead(true)
    const res = await createQuickLead({
      nome: newLeadNome,
      whatsapp: newLeadWhatsapp,
      telefone: newLeadTelefone,
      email: newLeadEmail,
    })
    setCreatingLead(false)
    if (!res.success) {
      setFormError(res.error)
      return
    }
    setSelectedLead(res.lead)
    setLeadMode('search')
    setNewLeadNome('')
    setNewLeadWhatsapp('')
    setNewLeadTelefone('')
    setNewLeadEmail('')
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    if (!selectedLead) {
      setFormError('Selecione um lead da base ou cadastre um novo lead.')
      return
    }

    const fd = new FormData(e.currentTarget)
    fd.set('lead_id', selectedLead.id)

    startTransition(async () => {
      const res = await createCrmCard(pipelineId, selectedStage, fd)
      if (res?.error) {
        setFormError(res.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#0F0F0F] border border-[#ffffff10] rounded-2xl w-full max-w-2xl shadow-[0_0_60px_-12px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-[#ffffff08] bg-gradient-to-r from-[#111] to-[#161616] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2BAADF]/10 flex items-center justify-center border border-[#2BAADF]/20">
              <Plus className="w-5 h-5 text-[#2BAADF]" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Novo Card</h3>
              <p className="text-xs text-gray-500">Adicionar nova oportunidade ao quadro</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:text-white rounded-xl hover:bg-[#ffffff08] transition-all border border-transparent hover:border-[#ffffff10]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <div className="md:col-span-2">
              <label className={labelCls}>Título da Negociação *</label>
              <input type="text" name="titulo" required placeholder="Ex: Proposta para Empresa XYZ..." className={inputCls} autoFocus />
            </div>

            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><LayoutTemplate className="w-3 h-3" />Estágio Inicial *</span></label>
              <select
                name="stage_id"
                required
                value={selectedStage}
                onChange={e => setSelectedStage(e.target.value)}
                className={selectCls}
              >
                {sortedStages.map(s => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className={labelCls}>
                <span className="flex items-center gap-1"><User className="w-3 h-3" />Cliente (Lead) *</span>
              </label>
              <p className="text-[11px] text-gray-500 -mt-1 mb-1">
                Todo card precisa estar vinculado a um lead da base.
              </p>

              <div className="flex gap-1 p-1 rounded-xl bg-[#050505] border border-[#ffffff10]">
                <button
                  type="button"
                  onClick={() => {
                    setLeadMode('search')
                    setFormError(null)
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    leadMode === 'search'
                      ? 'bg-[#2BAADF]/20 text-[#2BAADF]'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Buscar lead
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLeadMode('register')
                    setFormError(null)
                    if (!selectedLead) {
                      setLeadQuery('')
                      setLeadResults([])
                    }
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    leadMode === 'register'
                      ? 'bg-[#2BAADF]/20 text-[#2BAADF]'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Cadastrar lead
                </button>
              </div>

              {selectedLead && leadMode === 'search' ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[#2BAADF]/30 bg-[#2BAADF]/10 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#2BAADF] shrink-0" />
                      {selectedLead.nome || 'Sem nome'}
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {formatLeadPhone(selectedLead)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedLead(null)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#ffffff10]"
                    title="Trocar lead"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : leadMode === 'search' ? (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type="search"
                      value={leadQuery}
                      onChange={(e) => setLeadQuery(e.target.value)}
                      placeholder="Nome, telefone ou e-mail…"
                      className={`${inputCls} pl-10`}
                    />
                  </div>
                  {searchingLeads && (
                    <p className="text-[10px] text-gray-500 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Buscando…
                    </p>
                  )}
                  {!searchingLeads && leadQuery.trim().length >= 2 && leadResults.length === 0 && (
                    <p className="text-[10px] text-gray-500">
                      Nenhum lead encontrado. Use &quot;Cadastrar lead&quot; para incluir o contato.
                    </p>
                  )}
                  {leadResults.length > 0 && (
                    <ul className="max-h-40 overflow-y-auto rounded-xl border border-[#ffffff10] bg-[#050505] divide-y divide-[#ffffff08]">
                      {leadResults.map((lead) => (
                        <li key={lead.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLead(lead)
                              setLeadQuery('')
                              setLeadResults([])
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-[#2BAADF]/10 transition-colors"
                          >
                            <p className="text-sm font-semibold text-white truncate">
                              {lead.nome || 'Sem nome'}
                            </p>
                            <p className="text-[10px] text-gray-500 font-mono">
                              {formatLeadPhone(lead)}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {leadQuery.trim().length > 0 && leadQuery.trim().length < 2 && (
                    <p className="text-[10px] text-gray-600">Digite ao menos 2 caracteres.</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-[#2BAADF]/25 bg-[#2BAADF]/5 p-4 space-y-3">
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Cadastre o lead na base e ele já fica selecionado para este card.
                  </p>
                  <div>
                    <label className={labelCls}>Nome *</label>
                    <input
                      type="text"
                      value={newLeadNome}
                      onChange={(e) => setNewLeadNome(e.target.value)}
                      placeholder="Nome do contato"
                      className={inputCls}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>WhatsApp *</label>
                      <input
                        type="text"
                        value={newLeadWhatsapp}
                        onChange={(e) => setNewLeadWhatsapp(e.target.value)}
                        placeholder="5511999998888"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Telefone</label>
                      <input
                        type="text"
                        value={newLeadTelefone}
                        onChange={(e) => setNewLeadTelefone(e.target.value)}
                        placeholder="Opcional se já tem WhatsApp"
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>E-mail</label>
                      <input
                        type="email"
                        value={newLeadEmail}
                        onChange={(e) => setNewLeadEmail(e.target.value)}
                        placeholder="contato@empresa.com"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={creatingLead || !newLeadNome.trim()}
                    onClick={() => void handleCreateLead()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black bg-[#2BAADF] hover:bg-[#1A8FBF] text-white transition-all disabled:opacity-50"
                  >
                    {creatingLead ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Salvando lead…</>
                    ) : (
                      <><UserPlus className="w-4 h-4" />Salvar e selecionar lead</>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />Valor Estimado (R$)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-sm">R$</span>
                <input type="number" name="valor" step="0.01" min="0" defaultValue="0" className={`${inputCls} pl-9`} />
              </div>
            </div>

            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />Data de Entrega Prevista</span></label>
              <input type="date" name="data_prazo" className={`${inputCls} [color-scheme:dark]`} />
            </div>

            <div>
              <label className={labelCls}><span className="flex items-center gap-1"><User className="w-3 h-3" />Responsável</span></label>
              <select name="responsavel_id" defaultValue={currentUserId ?? ''} className={selectCls}>
                <option value="">— Sem responsável —</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome_completo}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Descrição</label>
              <textarea name="descricao" rows={3} placeholder="Detalhes sobre a oportunidade..." className={`${inputCls} resize-none`} />
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-400 font-medium">{formError}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending || !selectedLead}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white rounded-xl text-sm font-black transition-all disabled:opacity-50"
            >
              {isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />Criando...</>
                : <><Plus className="w-4 h-4" />Criar Card</>}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 bg-[#ffffff08] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-sm font-bold text-gray-300 transition-all">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
