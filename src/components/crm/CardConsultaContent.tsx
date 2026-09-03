import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  User,
  Phone,
  Mail,
  History,
  Paperclip,
  Download,
  ExternalLink,
  Layers,
  Calendar,
  DollarSign,
  Lock,
  AlertCircle,
} from 'lucide-react'
import type { CardConsultaContext, CardConsultaHistoryItem } from '@/app/(app)/cockpit/crm/card-consulta-actions'

type Props = {
  data: CardConsultaContext
  compact?: boolean
}

function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</p>
      <div className="text-sm text-gray-200 leading-relaxed">{children}</div>
    </div>
  )
}

function normalizeBriefingText(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function historyContainsBriefing(
  history: CardConsultaHistoryItem[],
  briefing: string,
): boolean {
  const normalized = normalizeBriefingText(briefing)
  if (!normalized) return false
  return history.some(
    (item) => !item.restricted && normalizeBriefingText(item.observacao) === normalized,
  )
}

export default function CardConsultaContent({ data, compact = false }: Props) {
  const { card, pipeline, stage, responsavel, lead, history, files, accessLevel } = data
  const restricted = accessLevel === 'restricted'
  const statusLabel = card.finalizado ? 'Fechado' : 'Aberto'
  const statusClass = card.finalizado
    ? 'bg-gray-500/15 text-gray-400 border-gray-500/20'
    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'

  const sectionPad = compact ? 'p-4 space-y-3' : 'p-6 space-y-4'
  const sectionRound = compact ? 'rounded-xl' : 'rounded-2xl'
  const briefing =
    !restricted && card.solicitacao ? normalizeBriefingText(card.solicitacao) : ''
  const showBriefingInHistory = !!briefing && !historyContainsBriefing(history, briefing)

  return (
    <div className={`space-y-4 ${compact ? 'pb-2' : 'pb-8'}`}>
      {restricted && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-100 leading-snug">
            Visualização parcial: este card pertence ao departamento{' '}
            <span className="font-bold">{pipeline.departamento_nome || 'de outra área'}</span>.
            Detalhes internos e histórico sensível foram ocultados.
          </p>
        </div>
      )}

      <div className={`border border-[#ffffff0a] bg-[#111111] ${sectionRound} ${sectionPad}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#2BAADF]">{pipeline.nome}</span>
          <span className="text-gray-600">·</span>
          <span className="text-sm text-gray-400">{stage.nome}</span>
          {pipeline.departamento_nome && (
            <>
              <span className="text-gray-600">·</span>
              <span className="text-xs text-gray-500">{pipeline.departamento_nome}</span>
            </>
          )}
          <span
            className={`ml-auto text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${statusClass}`}
          >
            {statusLabel}
          </span>
        </div>

        <h2 className={`font-bold text-white tracking-tight ${compact ? 'text-base mt-2' : 'text-lg mt-3'}`}>
          {card.titulo}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#ffffff08] mt-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            {format(new Date(card.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </div>
          {card.data_prazo && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              Prazo {format(new Date(card.data_prazo), 'dd/MM/yyyy', { locale: ptBR })}
            </div>
          )}
          {responsavel && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>
                Responsável:{' '}
                <span className="text-gray-200 font-medium">{responsavel.nome}</span>
              </span>
            </div>
          )}
          {card.valor != null && card.valor > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              {card.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          )}
        </div>
      </div>

      {(lead || card.cliente_nome) && (
        <section className={`border border-[#ffffff0a] bg-[#111111] ${sectionRound} ${sectionPad}`}>
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-[#80B828]" />
            Cliente
          </h3>
          <p className="text-base font-bold text-white">{lead?.nome || card.cliente_nome}</p>
          {!restricted && (lead?.telefone || lead?.whatsapp || lead?.email) && (
            <div className="grid grid-cols-1 gap-3 mt-3">
              {(lead?.telefone || lead?.whatsapp) && (
                <InfoBlock label="Contato">
                  <div className="space-y-1">
                    {lead?.telefone && (
                      <p className="flex items-center gap-2 text-sm">
                        <Phone className="w-3.5 h-3.5 text-gray-500" />
                        {lead.telefone}
                      </p>
                    )}
                    {lead?.whatsapp && lead.whatsapp !== lead.telefone && (
                      <p className="flex items-center gap-2 text-sm">
                        <Phone className="w-3.5 h-3.5 text-gray-500" />
                        WhatsApp: {lead.whatsapp}
                      </p>
                    )}
                  </div>
                </InfoBlock>
              )}
              {lead?.email && (
                <InfoBlock label="E-mail">
                  <p className="flex items-center gap-2 text-sm">
                    <Mail className="w-3.5 h-3.5 text-gray-500" />
                    {lead.email}
                  </p>
                </InfoBlock>
              )}
            </div>
          )}
          {!restricted && lead?.id && (
            <Link
              href={`/cockpit/crm/leads/${lead.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2BAADF] hover:text-[#5bc4ef] transition-colors mt-3"
            >
              Ver perfil do lead
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </section>
      )}

      <section className={`border border-[#ffffff0a] bg-[#111111] ${sectionRound} ${sectionPad}`}>
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-gray-400" />
          Contexto
        </h3>
        <div className="text-sm text-gray-400 space-y-1.5">
          <p>
            Funil: <span className="text-gray-200">{pipeline.nome}</span>
          </p>
          <p>
            Departamento:{' '}
            <span className="text-gray-200">{pipeline.departamento_nome || '—'}</span>
          </p>
        </div>
      </section>

      <section className={`border border-[#ffffff0a] bg-[#111111] ${sectionRound} ${sectionPad}`}>
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-gray-400" />
          Histórico
          <span className="text-[10px] font-normal text-gray-600">({history.length})</span>
        </h3>
        {restricted && (
          <p className="text-sm text-gray-500 italic flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Detalhes internos restritos a este departamento.
          </p>
        )}
        {showBriefingInHistory && (
          <div className="mb-4 rounded-xl border border-[#ffffff08] bg-[#0A0A0A] p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
              Resumo do card
            </p>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{briefing}</p>
          </div>
        )}
        {history.length === 0 && !showBriefingInHistory ? (
          <p className="text-sm text-gray-600 italic">Nenhum evento registrado.</p>
        ) : (
          <ul className="space-y-3">
            {history.map((item) => (
              <li
                key={item.id}
                className={`relative pl-6 border-l border-[#ffffff0a] ${
                  item.restricted ? 'opacity-70' : ''
                }`}
              >
                <div
                  className={`absolute left-0 top-1.5 -translate-x-1/2 w-2 h-2 rounded-full ${
                    item.restricted ? 'bg-amber-500/50' : 'bg-[#2BAADF]/60'
                  }`}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-white">{item.label}</span>
                  <span className="text-[10px] text-gray-600 font-mono">
                    {format(new Date(item.created_at), 'dd/MM/yy HH:mm')}
                  </span>
                </div>
                {!item.restricted && (
                  <p className="text-[11px] text-gray-500 mt-0.5">{item.usuario_nome}</p>
                )}
                {item.detail && (
                  <p className="text-xs text-[#2BAADF]/90 mt-1">{item.detail}</p>
                )}
                {item.observacao && (
                  <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">{item.observacao}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {files.length > 0 && (
        <section className={`border border-[#ffffff0a] bg-[#111111] ${sectionRound} ${sectionPad}`}>
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <Paperclip className="w-4 h-4 text-gray-400" />
            Anexos
          </h3>
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#0A0A0A] border border-[#ffffff08]"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 truncate">{file.file_name}</p>
                  <p className="text-[10px] text-gray-600 font-mono">
                    {format(new Date(file.created_at), 'dd/MM/yy HH:mm')}
                  </p>
                </div>
                {file.download_url ? (
                  <a
                    href={file.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-2 rounded-lg text-[#2BAADF] hover:bg-[#2BAADF]/10 transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                ) : (
                  <span className="text-[10px] text-gray-600">Indisponível</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
