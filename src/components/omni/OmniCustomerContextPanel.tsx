'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import {
  User,
  Phone,
  Mail,
  Building2,
  Briefcase,
  FileText,
  Loader2,
  ExternalLink,
  History,
  Layers,
  AlertCircle,
  X,
} from 'lucide-react'
import type {
  OmniCustomerContext,
  OmniCustomerContextCard,
} from '@/app/(app)/cockpit/crm/omni-chat-actions'

/** Largura fixa do painel — não pode depender do conteúdo interno. */
const PANEL_WIDTH = '15.3rem'

type Props = {
  context: OmniCustomerContext | null
  loading: boolean
  error: string | null
  onClose: () => void
  onSelectCard?: (cardId: string) => void
}

function PhonesRow({
  telefone,
  whatsapp,
}: {
  telefone: string | null | undefined
  whatsapp: string | null | undefined
}) {
  const tel = telefone?.trim()
  const wa = whatsapp?.trim()
  if (!tel && !wa) return null

  const same = tel && wa && tel === wa

  return (
    <div className="flex items-start gap-1 min-w-0 max-w-full overflow-hidden">
      <Phone className="w-3 h-3 text-gray-500 shrink-0 mt-0.5" />
      <div className="min-w-0 max-w-full flex-1 flex flex-wrap gap-x-2 gap-y-0.5 overflow-hidden">
        {tel && (
          <div className="min-w-0 max-w-full overflow-hidden">
            {!same && <p className="text-[7px] font-black uppercase text-gray-600 leading-none">Tel</p>}
            <p className="text-[9px] text-gray-200 break-all leading-tight">{tel}</p>
          </div>
        )}
        {wa && !same && (
          <div className="min-w-0 max-w-full overflow-hidden">
            <p className="text-[7px] font-black uppercase text-gray-600 leading-none">WA</p>
            <p className="text-[9px] text-gray-200 break-all leading-tight">{wa}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
}) {
  if (!value?.trim()) return null
  return (
    <div className="flex items-start gap-1.5 min-w-0 max-w-full overflow-hidden">
      <Icon className="w-3 h-3 text-gray-500 shrink-0 mt-0.5" />
      <div className="min-w-0 max-w-full flex-1 overflow-hidden">
        <p className="text-[8px] font-black uppercase tracking-wide text-gray-600 leading-tight">{label}</p>
        <p className="text-[10px] text-gray-200 break-words [overflow-wrap:anywhere] leading-snug">{value}</p>
      </div>
    </div>
  )
}

function CardFooterIcon({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      title={title}
      className="shrink-0 p-0.5 rounded hover:bg-[#2BAADF]/10 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="w-2.5 h-2.5 text-[#2BAADF]" />
    </Link>
  )
}

function CardBlock({
  card,
  highlighted,
  onSelectCard,
}: {
  card: OmniCustomerContextCard
  highlighted?: boolean
  onSelectCard?: (cardId: string) => void
}) {
  const statusLabel = card.finalizado ? 'Fechado' : 'Aberto'
  const statusClass = card.finalizado
    ? 'bg-gray-500/15 text-gray-400'
    : 'bg-emerald-500/15 text-emerald-400'

  const inner = (
    <div
      className={`w-full max-w-full min-w-0 overflow-hidden rounded-lg border p-2 space-y-1.5 ${
        highlighted
          ? 'border-[#2BAADF]/40 bg-[#2BAADF]/10'
          : 'border-[#ffffff0a] bg-[#0A0A0A]'
      } ${onSelectCard ? 'hover:border-[#80B828]/40 cursor-pointer' : 'opacity-80'}`}
    >
      <div className="min-w-0 max-w-full overflow-hidden">
        <div className="flex items-start justify-between gap-1 min-w-0">
          <p className="text-[9px] font-bold text-[#2BAADF] min-w-0 flex-1 break-words [overflow-wrap:anywhere] leading-tight">
            {card.pipeline_nome}
          </p>
          <span
            className={`text-[7px] font-black uppercase tracking-wide px-1 py-0.5 rounded shrink-0 ${statusClass}`}
          >
            {statusLabel}
          </span>
        </div>
        <p className="text-[8px] text-gray-500 break-words [overflow-wrap:anywhere] leading-tight mt-0.5">
          {card.stage_nome}
        </p>
      </div>
      <p className="text-[10px] text-gray-300 leading-snug break-words [overflow-wrap:anywhere] line-clamp-3">
        {card.solicitacao}
      </p>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="text-[8px] text-gray-600 font-mono break-all leading-tight min-w-0 flex-1">
          {format(new Date(card.created_at), 'dd/MM/yy HH:mm')}
        </span>
        {onSelectCard && (
          <ExternalLink className="w-2.5 h-2.5 text-[#2BAADF] shrink-0" aria-hidden />
        )}
      </div>
    </div>
  )

  if (onSelectCard) {
    return (
      <button
        type="button"
        onClick={() => onSelectCard(card.id)}
        className="block w-full max-w-full min-w-0 overflow-hidden text-left"
      >
        {inner}
      </button>
    )
  }

  return <div className="w-full max-w-full min-w-0 overflow-hidden">{inner}</div>
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <h5 className="text-[8px] font-black uppercase tracking-wide text-gray-500 flex items-start gap-1 leading-tight min-w-0 max-w-full overflow-hidden">
      <Icon className="w-2.5 h-2.5 shrink-0 mt-0.5" />
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</span>
    </h5>
  )
}

export default function OmniCustomerContextPanel({ context, loading, error, onClose, onSelectCard }: Props) {
  return (
    <aside
      className="self-stretch shrink-0 grow-0 min-w-0 min-h-0 overflow-hidden border-l border-[#ffffff0a] bg-[#111111] flex flex-col"
      style={{ width: PANEL_WIDTH, maxWidth: PANEL_WIDTH, flexBasis: PANEL_WIDTH }}
      data-testid="omni-customer-context-panel"
    >
      <div className="flex items-start justify-between gap-1 px-2 py-2 border-b border-[#ffffff0a] shrink-0 min-w-0 overflow-hidden">
        <div className="flex items-start gap-1 min-w-0 flex-1 overflow-hidden">
          <User className="w-3 h-3 text-[#2BAADF] shrink-0 mt-0.5" />
          <h4 className="text-[8px] font-black uppercase tracking-wide text-white leading-tight break-words [overflow-wrap:anywhere]">
            Contexto do cliente
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-[#ffffff08] transition-all shrink-0"
          aria-label="Fechar painel"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Rolagem vertical do cadastro + histórico de cards (só aparece se estourar a altura) */}
      <div
        className="omni-context-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2 space-y-3 min-w-0 max-w-full"
        data-testid="omni-customer-context-scroll"
      >
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin text-[#2BAADF]" />
            <span className="text-[9px] text-center leading-tight">Carregando…</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 flex gap-1.5 text-red-300 text-[9px] leading-snug break-words [overflow-wrap:anywhere] min-w-0">
            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="min-w-0">{error}</span>
          </div>
        )}

        {!loading && context && (
          <div className="min-w-0 max-w-full space-y-3">
            {context.activeSpeaker?.isOtherDepartment && context.activeSpeaker.departamentoNome && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 flex gap-1.5 min-w-0 overflow-x-hidden">
                <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[9px] text-amber-200 font-medium leading-snug break-words [overflow-wrap:anywhere] min-w-0">
                  <span className="font-black">{context.activeSpeaker.departamentoNome}</span> em atendimento
                </p>
              </div>
            )}

            <section className="space-y-1.5 min-w-0 max-w-full">
              <SectionTitle icon={User}>Cadastro</SectionTitle>
              {!context.lead.registered ? (
                <div className="rounded-lg border border-dashed border-[#ffffff15] bg-[#0A0A0A] p-2 text-[9px] text-gray-500 italic leading-snug break-words [overflow-wrap:anywhere] min-w-0">
                  Lead não vinculado.
                  {context.lead.telefone && (
                    <p className="mt-1 not-italic text-gray-300 font-mono break-all">{context.lead.telefone}</p>
                  )}
                </div>
              ) : (
                <div className="w-full max-w-full min-w-0 overflow-x-hidden rounded-lg border border-[#ffffff0a] bg-[#0A0A0A] p-2 space-y-1.5">
                  {context.lead.nome && (
                    <p className="text-[10px] font-bold text-white break-words [overflow-wrap:anywhere] leading-tight">
                      {context.lead.nome}
                    </p>
                  )}
                  <PhonesRow telefone={context.lead.telefone} whatsapp={context.lead.whatsapp} />
                  <InfoRow icon={Mail} label="E-mail" value={context.lead.email} />
                  <InfoRow icon={FileText} label="Documento" value={context.lead.documento} />
                  <InfoRow icon={Building2} label="Empresa" value={context.lead.empresa_cliente} />
                  <InfoRow icon={Briefcase} label="Cargo" value={context.lead.cargo} />
                  <div className="flex items-center justify-between gap-1 min-w-0 pt-0.5">
                    <span className="text-[8px] text-transparent select-none" aria-hidden>
                      ·
                    </span>
                    {context.lead.id && (
                      <CardFooterIcon
                        href={`/cockpit/crm/leads/${context.lead.id}`}
                        title="Ver perfil completo"
                      />
                    )}
                  </div>
                </div>
              )}
            </section>

            {context.currentSessionCard && (
              <section className="space-y-1.5 min-w-0 max-w-full">
                <SectionTitle icon={Layers}>Card deste atendimento</SectionTitle>
                <CardBlock card={context.currentSessionCard} highlighted onSelectCard={onSelectCard} />
              </section>
            )}

            {context.recentCards.length > 0 && (
              <section className="space-y-1.5 min-w-0 max-w-full">
                <SectionTitle icon={History}>Últimos atendimentos</SectionTitle>
                <div className="space-y-1.5 min-w-0 max-w-full">
                  {context.recentCards.map((card) => (
                    <CardBlock key={card.id} card={card} onSelectCard={onSelectCard} />
                  ))}
                </div>
              </section>
            )}

            {context.otherDepartmentCards.length > 0 && (
              <section className="space-y-1.5 min-w-0 max-w-full">
                <SectionTitle icon={History}>Outros departamentos</SectionTitle>
                <p className="text-[8px] text-gray-600 italic leading-snug break-words [overflow-wrap:anywhere]">
                  Somente consulta — sem acesso ao funil.
                </p>
                <div className="space-y-1.5 min-w-0 max-w-full">
                  {context.otherDepartmentCards.map((card) => (
                    <div key={card.id} className="min-w-0 max-w-full">
                      {card.departamento_nome && (
                        <span className="block mb-1 text-[7px] font-black uppercase tracking-wide text-gray-500 leading-tight break-words [overflow-wrap:anywhere]">
                          {card.departamento_nome}
                        </span>
                      )}
                      <CardBlock card={card} onSelectCard={onSelectCard} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="pt-1.5 border-t border-[#ffffff08] space-y-0.5 min-w-0">
              <p className="text-[8px] text-gray-600 leading-tight break-words [overflow-wrap:anywhere]">
                {context.stats.totalCards90d} cards (90 dias)
              </p>
              <p className="text-[8px] text-gray-600 leading-tight">{context.stats.openCount} aberto(s)</p>
            </section>
          </div>
        )}
      </div>
    </aside>
  )
}
