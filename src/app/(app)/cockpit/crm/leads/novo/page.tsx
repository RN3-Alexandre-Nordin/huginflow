import { Users } from "lucide-react"
import BackButton from '@/components/BackButton'
import { createClient } from "@/utils/supabase/server"
import { buildKanbanCardUrl } from '@/lib/kanban/kanban-deep-link'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import NewLeadForm from "./NewLeadForm"

export const metadata = { title: "Nova pessoa | HuginFlow" }

export default async function NovoLeadPage(props: {
  searchParams: Promise<{ cardId?: string; pipelineId?: string }>
}) {
  const searchParams = await props.searchParams
  const cardId = searchParams.cardId?.trim() || null
  const pipelineId = searchParams.pipelineId?.trim() || null
  const cancelHref =
    cardId && pipelineId
      ? buildKanbanCardUrl(pipelineId, cardId)
      : '/cockpit/crm/leads'

  const me = await getMyProfile()
  const supabase = await createClient()

  let canaisQuery = supabase.from('crm_canais').select('id, nome').order('nome')
  if (me?.role_global !== 'superadmin') {
    canaisQuery = canaisQuery.eq('empresa_id', me?.empresa_id ?? '')
  }
  const { data: canais } = await canaisQuery

  let defaultNome = ''
  if (cardId) {
    let cardQuery = supabase
      .from('crm_cards')
      .select('cliente_nome, titulo')
      .eq('id', cardId)
    if (me?.role_global !== 'superadmin') {
      cardQuery = cardQuery.eq('empresa_id', me?.empresa_id ?? '')
    }
    const { data: card } = await cardQuery.maybeSingle()
    defaultNome = card?.cliente_nome || card?.titulo || ''
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref={cancelHref} />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-[#2BAADF]" />
            {cardId ? 'Cadastrar pessoa para o card' : 'Nova pessoa'}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {cardId
              ? 'A pessoa será vinculada ao card ao salvar. WhatsApp ou telefone é obrigatório.'
              : 'Use as seções ao lado para preencher identidade, contato, endereço e demais dados.'}
          </p>
        </div>
      </div>

      <NewLeadForm
        canais={canais}
        linkCardId={cardId}
        cancelHref={cancelHref}
        defaultNome={defaultNome}
      />
    </div>
  )
}
