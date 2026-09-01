'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { MessageCircle, Loader2, Search, User, X, UserPlus } from 'lucide-react'
import {
  getActiveSpeakerForCard,
  searchLeadsForOmni,
  startOmniConversation,
  type OmniLeadOption,
} from '@/app/(app)/cockpit/crm/omni-actions'
import { buildNewLeadForCardUrl } from '@/lib/kanban/kanban-deep-link'
import { navigateToOmniChat } from '@/lib/omni/chat-deep-link'

type Props = {
  cardId: string
  pipelineId: string
  conversaId?: string | null
}

function formatLeadPhone(lead: OmniLeadOption): string {
  return lead.telefone || lead.whatsapp || '— sem telefone'
}

export default function StartOmniConversationPanel({ cardId, pipelineId, conversaId }: Props) {
  const [message, setMessage] = useState('')
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getActiveSpeakerForCard>> | null>(
    null,
  )
  const needsLeadLink = info?.enabled !== false && info?.hasLead === false

  const [leadMode, setLeadMode] = useState<'search' | 'register'>('search')
  const [leadQuery, setLeadQuery] = useState('')
  const [leadResults, setLeadResults] = useState<OmniLeadOption[]>([])
  const [searchingLeads, setSearchingLeads] = useState(false)
  const [selectedLead, setSelectedLead] = useState<OmniLeadOption | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [needsAssume, setNeedsAssume] = useState(false)
  const [assumeHint, setAssumeHint] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const newLeadHref = buildNewLeadForCardUrl(pipelineId, cardId)

  useEffect(() => {
    let cancelled = false
    getActiveSpeakerForCard(cardId).then((res) => {
      if (!cancelled) setInfo(res)
    })
    return () => {
      cancelled = true
    }
  }, [cardId])

  useEffect(() => {
    if (!needsLeadLink || leadMode !== 'search' || selectedLead) {
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
  }, [leadQuery, leadMode, needsLeadLink, selectedLead])

  const leadReady = !needsLeadLink || !!selectedLead

  const runStart = (forceAssume: boolean) => {
    setError(null)
    if (needsLeadLink && !selectedLead) {
      setError('Selecione um lead da base ou cadastre um novo lead antes de enviar.')
      return
    }
    if (needsLeadLink && selectedLead) {
      const hasPhone = Boolean(selectedLead.telefone || selectedLead.whatsapp)
      if (!hasPhone) {
        setError('Este lead não tem telefone. Edite o cadastro ou cadastre outro lead com WhatsApp.')
        return
      }
    }

    startTransition(async () => {
      const res = await startOmniConversation(cardId, message, {
        forceAssume,
        leadId: needsLeadLink ? selectedLead?.id : undefined,
      })
      if (!res.success) {
        if (res.needsAssume) {
          setNeedsAssume(true)
          setAssumeHint(res.activeDepartamentoNome ?? null)
          setError(res.error)
          return
        }
        setError(res.error)
        return
      }
      setNeedsAssume(false)
      navigateToOmniChat(res.sessaoId, cardId)
    })
  }

  if (info && info.enabled === false) {
    if (!conversaId) return null
    return (
      <button
        type="button"
        onClick={() => navigateToOmniChat(conversaId, cardId)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-all"
      >
        <MessageCircle className="w-4 h-4" />
        Abrir WhatsApp (OmniChat)
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-green-400" />
        <p className="text-[11px] font-black uppercase tracking-widest text-green-400">
          WhatsApp — iniciar / assumir
        </p>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Só é possível enviar mensagem para contatos com lead cadastrado na base. Cria uma conversa
        ligada a este card (isolamento por departamento).
      </p>

      {needsLeadLink && (
        <div className="space-y-2">
          <div className="flex gap-1 p-1 rounded-xl bg-[#050505] border border-[#ffffff10]">
            <button
              type="button"
              onClick={() => {
                setLeadMode('search')
                setError(null)
              }}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                leadMode === 'search'
                  ? 'bg-green-500/20 text-green-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Buscar lead
            </button>
            <button
              type="button"
              onClick={() => {
                setLeadMode('register')
                setSelectedLead(null)
                setLeadQuery('')
                setLeadResults([])
                setError(null)
              }}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                leadMode === 'register'
                  ? 'bg-green-500/20 text-green-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Cadastrar lead
            </button>
          </div>

          {leadMode === 'search' ? (
            <div className="space-y-1.5">
              {selectedLead ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-green-400 shrink-0" />
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
              ) : (
                <>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                    <Search className="w-3 h-3" /> Pesquisar na base de leads *
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input
                      type="search"
                      value={leadQuery}
                      onChange={(e) => setLeadQuery(e.target.value)}
                      placeholder="Nome, telefone ou e-mail…"
                      className="w-full bg-[#050505] border border-[#ffffff12] focus:border-green-500/40 rounded-xl py-3 pl-10 pr-3 text-sm text-white outline-none"
                    />
                  </div>
                  {searchingLeads && (
                    <p className="text-[10px] text-gray-500 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Buscando…
                    </p>
                  )}
                  {!searchingLeads && leadQuery.trim().length >= 2 && leadResults.length === 0 && (
                    <p className="text-[10px] text-gray-500">
                      Nenhum lead encontrado. Use a aba &quot;Cadastrar lead&quot; para incluir o contato na base.
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
                            className="w-full text-left px-3 py-2.5 hover:bg-green-500/10 transition-colors"
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
                </>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-[#2BAADF]/25 bg-[#2BAADF]/5 p-4 space-y-3">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Contato ainda não está na base? Cadastre um lead com WhatsApp ou telefone. Ao salvar,
                ele será vinculado a este card e você poderá iniciar a conversa.
              </p>
              <Link
                href={newLeadHref}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black bg-[#2BAADF] hover:bg-[#1A8FBF] text-white transition-all"
              >
                <UserPlus className="w-4 h-4" />
                Cadastrar novo lead
              </Link>
              {info?.clienteNome && (
                <p className="text-[10px] text-gray-600 text-center">
                  Sugestão de nome: {info.clienteNome}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {info?.isActiveSpeaker && (
        <p className="text-[11px] text-emerald-400 font-semibold">
          Este card é o falante ativo agora.
        </p>
      )}
      {info && !info.isActiveSpeaker && info.activeSessaoId && (
        <p className="text-[11px] text-amber-400/90">
          Falante ativo em outro assunto
          {info.activeDepartamentoNome ? ` (${info.activeDepartamentoNome})` : ''}.
        </p>
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder="Mensagem inicial para o cliente…"
        className="w-full bg-[#050505] border border-[#ffffff12] focus:border-green-500/40 rounded-xl p-3 text-sm text-white outline-none resize-none"
      />

      {error && <p className="text-[11px] text-red-400 font-medium">{error}</p>}

      {needsAssume ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={pending || !message.trim() || !leadReady}
            onClick={() => runStart(true)}
            className="flex-1 py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-600 text-black disabled:opacity-50"
          >
            {pending ? 'Assumindo…' : `Assumir${assumeHint ? ` (sair de ${assumeHint})` : ''} e enviar`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setNeedsAssume(false)
              setError(null)
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#ffffff08] text-gray-300"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={pending || !message.trim() || !leadReady || (needsLeadLink && leadMode === 'register')}
            onClick={() => runStart(false)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {conversaId || info?.sessaoId ? 'Enviar e abrir chat' : 'Iniciar conversa'}
          </button>
          {(conversaId || info?.sessaoId) && (
            <button
              type="button"
              onClick={() => navigateToOmniChat((info?.sessaoId || conversaId)!, cardId)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-green-500/30 text-green-400 hover:bg-green-500/10"
            >
              Só abrir
            </button>
          )}
        </div>
      )}
    </div>
  )
}
