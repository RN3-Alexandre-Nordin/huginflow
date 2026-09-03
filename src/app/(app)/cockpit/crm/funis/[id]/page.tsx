import { createClient } from '@/utils/supabase/server'
import Script from 'next/script'
import { notFound } from 'next/navigation'
import { LayoutTemplate, Plus, Lock } from 'lucide-react'
import BackButton from '@/components/BackButton'
import BackTextButton from '@/components/BackTextButton'
import KanbanBoard from '@/components/kanban/KanbanBoard'
import StageConfigWrapper from '@/components/kanban/StageConfigWrapper'
import KanbanFilters from './KanbanFilters'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

function sanitizeSearchTerm(raw: string) {
  return raw.replace(/[%_,]/g, ' ').trim().slice(0, 80)
}

export default async function PipelinePage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    config?: string
    prazo_de?: string
    prazo_ate?: string
    stage_de?: string
    stage_ate?: string
    meus_cards?: string
    finalizados?: string
    q?: string
  }>
}) {
  const me = await getMyProfile()

  if (!hasPermission(me, 'funis', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar este Funil de Vendas.
        </p>
        <BackTextButton fallbackHref="/cockpit/crm/funis" className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar aos Funis
        </BackTextButton>
      </div>
    )
  }

  const canCreate = hasPermission(me, 'cards', 'create')
  const canEditPipe = hasPermission(me, 'funis', 'edit')
  const canEditCard = hasPermission(me, 'cards', 'edit')
  const canDeleteCard = hasPermission(me, 'cards', 'delete')
  const canMoveCard = hasPermission(me, 'cards', 'move')
  
  // Permissões de Anexos
  const canViewAttachments = hasPermission(me, 'card_attachments', 'view')
  const canAddAttachments = hasPermission(me, 'card_attachments', 'create')
  const canDeleteAttachments = hasPermission(me, 'card_attachments', 'delete')

  const params = await props.params
  const searchParams = props.searchParams ? await props.searchParams : {}
  const supabase = await createClient()

  const autoOpen = searchParams?.config === 'true'

  // Date / search filter params
  const prazoDe = searchParams?.prazo_de || null
  const prazoAte = searchParams?.prazo_ate || null
  const stageDe = searchParams?.stage_de || null
  const stageAte = searchParams?.stage_ate || null
  const meusCards = searchParams?.meus_cards === 'true'
  const mostrarFinalizados = searchParams?.finalizados === 'true'
  const buscaCliente = sanitizeSearchTerm(searchParams?.q || '')

  // 1. Fetch Pipeline
  let pipeQuery = supabase
    .from('pipelines')
    .select('id, nome, descricao, is_public, empresa_id')
    .eq('id', params.id)

  if (me?.role_global !== 'superadmin') {
    pipeQuery = pipeQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { data: pipeline, error: pipeError } = await pipeQuery.maybeSingle()

  if (pipeError || !pipeline) {
    notFound()
  }

  // 2. Fetch Stages (Columns)
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipeline.id)
    .order('ordem', { ascending: true })

  // 4. Fetch grupos for Stage Config
  const { data: grupos } = await supabase
    .from('grupos_acesso')
    .select('id, nome')
    .eq('empresa_id', me?.empresa_id ?? '')
    .order('nome')

  // 5. Fetch Usuarios da empresa (for assignee select)
  const isSuperAdmin = me?.role_global === 'superadmin'
  let usuariosQuery = supabase
    .from('usuarios')
    .select('id, nome_completo')
    .eq('ativo', true)
    .order('nome_completo')

  if (!isSuperAdmin && me?.empresa_id) {
    usuariosQuery = usuariosQuery.eq('empresa_id', me.empresa_id)
  }
  const { data: usuarios } = await usuariosQuery

  // 6. Fetch Cards with filters + join responsavel
  let cardsQuery = supabase
    .from('crm_cards')
    .select('*, responsavel:responsavel_id(nome_completo)')
    .eq('pipeline_id', pipeline.id)
    .eq('finalizado', mostrarFinalizados)
    .order('ordem', { ascending: true })

  if (me?.role_global !== 'superadmin') {
    cardsQuery = cardsQuery.eq('empresa_id', me?.empresa_id ?? '')
  }

  // Apply data_prazo filter
  if (prazoDe) cardsQuery = cardsQuery.gte('data_prazo', prazoDe)
  if (prazoAte) cardsQuery = cardsQuery.lte('data_prazo', prazoAte)

  // Apply stage_entered_at filter
  if (stageDe) cardsQuery = cardsQuery.gte('stage_entered_at', stageDe)
  if (stageAte) {
    const stageAteEnd = stageAte + 'T23:59:59'
    cardsQuery = cardsQuery.lte('stage_entered_at', stageAteEnd)
  }
  // Apply meus_cards filter
  if (meusCards && me?.id) {
    cardsQuery = cardsQuery.eq('responsavel_id', me.id)
  }

  // Busca por nome / CPF / telefone do cliente (card + lead vinculado)
  if (buscaCliente) {
    const empresaId = pipeline.empresa_id || me?.empresa_id || ''
    const digits = buscaCliente.replace(/\D/g, '')
    const leadOrParts = [
      `nome.ilike.%${buscaCliente}%`,
      `documento.ilike.%${buscaCliente}%`,
      `telefone.ilike.%${buscaCliente}%`,
      `whatsapp.ilike.%${buscaCliente}%`,
    ]
    if (digits.length >= 3) {
      leadOrParts.push(
        `documento.ilike.%${digits}%`,
        `telefone.ilike.%${digits}%`,
        `whatsapp.ilike.%${digits}%`,
      )
    }

    let leadsQuery = supabase.from('crm_leads').select('id').or(leadOrParts.join(','))
    if (empresaId) leadsQuery = leadsQuery.eq('empresa_id', empresaId)

    const { data: matchedLeads } = await leadsQuery.limit(200)
    const leadIds = (matchedLeads || []).map((l) => l.id)

    const cardOrParts = [
      `cliente_nome.ilike.%${buscaCliente}%`,
      `titulo.ilike.%${buscaCliente}%`,
    ]
    if (leadIds.length > 0) {
      cardOrParts.push(`lead_id.in.(${leadIds.join(',')})`)
    }
    cardsQuery = cardsQuery.or(cardOrParts.join(','))
  }

  const { data: cards } = await cardsQuery

  const hasActiveFilters =
    prazoDe || prazoAte || stageDe || stageAte || meusCards || mostrarFinalizados || Boolean(buscaCliente)

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] overflow-hidden font-sans">
      {/* Header */}
      <div className="shrink-0 bg-[#0A0A0A] border-b border-[#ffffff10] pb-4 mb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <BackButton fallbackHref="/cockpit/crm/funis" />
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-3">
                <LayoutTemplate className="w-5 h-5 text-[#2BAADF]" />
                {pipeline.nome}
                {hasActiveFilters && (
                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    Filtros Ativos
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">
                {pipeline.descricao || 'Gerencie as oportunidades deste funil visualmente.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pipeline.is_public && (
              <span className="px-2 py-1 bg-green-500/10 text-[9px] uppercase font-black tracking-widest text-green-500 rounded border border-green-500/20 mr-2">
                Funil Público
              </span>
            )}
            {canEditPipe && (
              <StageConfigWrapper pipelineId={pipeline.id} initialStages={stages || []} grupos={grupos || []} autoOpen={autoOpen} />
            )}
            {/* This button triggers the modal inside KanbanBoard via the hidden #kanban-new-card-trigger */}
            {canCreate && (
              <button
                className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2"
                id="novo-card-btn"
                type="button"
              >
                <Plus className="w-4 h-4" />
                Novo Card
              </button>
            )}
          </div>
        </div>

        {/* Filters Bar */}
        <KanbanFilters />
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden pb-4 kanban-scroll">
        <KanbanBoard
          pipelineId={pipeline.id}
          pipelineName={pipeline.nome}
          initialStages={stages || []}
          initialCards={cards || []}
          usuarios={usuarios || []}
          showFinalizados={mostrarFinalizados}
          meusCardsOnly={meusCards}
          currentUserId={me?.id}
          canEdit={canEditCard}
          canDelete={canDeleteCard}
          canMove={canMoveCard}
          canViewAttachments={canViewAttachments}
          canAddAttachments={canAddAttachments}
          canDeleteAttachments={canDeleteAttachments}
        />
      </div>

      {/* Next.js Script to connect header button to KanbanBoard's hidden trigger */}
      <Script id="kanban-connector" strategy="afterInteractive">
        {`
          document.getElementById('novo-card-btn')?.addEventListener('click', function() {
            document.getElementById('kanban-new-card-trigger')?.click();
          });
        `}
      </Script>
    </div>
  )
}

