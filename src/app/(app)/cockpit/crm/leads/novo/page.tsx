import { Users } from "lucide-react"
import BackButton from '@/components/BackButton'
import { createClient } from "@/utils/supabase/server"
import { buildKanbanCardUrl } from '@/lib/kanban/kanban-deep-link'
import NewLeadForm from "./NewLeadForm"

export const metadata = { title: "Novo Lead | HuginFlow CRM" }

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

  const supabase = await createClient()
  const { data: canais } = await supabase.from('crm_canais').select('id, nome').order('nome')

  let defaultNome = ''
  if (cardId) {
    const { data: card } = await supabase
      .from('crm_cards')
      .select('cliente_nome, titulo')
      .eq('id', cardId)
      .maybeSingle()
    defaultNome = card?.cliente_nome || card?.titulo || ''
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref={cancelHref} />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-[#2BAADF]" />
            {cardId ? 'Cadastrar lead para o card' : 'Adicionar Lead Manualmente'}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {cardId
              ? 'O lead será vinculado ao card ao salvar. WhatsApp ou telefone é obrigatório.'
              : 'Preencha os dados do prospect. Apenas o NOME é obrigatório.'}
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
