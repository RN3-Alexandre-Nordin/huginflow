'use server'

import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'
import { canConsultCard } from '@/lib/crm/cardConsultaAccess'

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function cardSolicitacao(card: {
  titulo?: string | null
  descricao?: string | null
  observacao?: string | null
}): string {
  const obs = card.observacao?.trim()
  if (obs) return obs
  const desc = card.descricao?.trim()
  if (desc) return desc
  return card.titulo?.trim() || 'Sem descrição'
}

async function getUserDepartamentoIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('usuarios_departamentos')
    .select('departamento_id')
    .eq('usuario_id', userId)
  return (data ?? []).map((r) => r.departamento_id).filter(Boolean)
}

type PipelineRef = {
  nome: string
  departamento_id?: string | null
}

type HistoryRow = {
  id: string
  acao: string
  created_at: string
  observacao: string | null
  usuarios: { nome_completo?: string } | { nome_completo?: string }[] | null
  de_stage: { nome: string } | { nome: string }[] | null
  para_stage: { nome: string } | { nome: string }[] | null
  de_pipeline: PipelineRef | PipelineRef[] | null
  para_pipeline: PipelineRef | PipelineRef[] | null
}

function historyDetail(row: HistoryRow, restricted: boolean): string | null {
  if (restricted) return null
  const deStage = firstRelation(row.de_stage)?.nome
  const paraStage = firstRelation(row.para_stage)?.nome
  const dePipeline = firstRelation(row.de_pipeline)?.nome
  const paraPipeline = firstRelation(row.para_pipeline)?.nome

  if (row.acao === 'STATUS_CHANGED' && deStage && paraStage) {
    return `${deStage} → ${paraStage}`
  }
  if (row.acao === 'TRANSFER_PIPELINE' && dePipeline && paraPipeline) {
    return `${dePipeline} → ${paraPipeline}`
  }
  return null
}

function historyUsuario(row: HistoryRow, restricted: boolean): string {
  if (restricted) return '—'
  const u = firstRelation(row.usuarios)
  return u?.nome_completo || 'Sistema'
}

function isHistoryRestricted(
  row: HistoryRow,
  userDeptIds: string[],
  cardDeptId: string | null,
  fullAccess: boolean,
): boolean {
  if (fullAccess) return false
  const deDept = firstRelation(row.de_pipeline)?.departamento_id ?? null
  const paraDept = firstRelation(row.para_pipeline)?.departamento_id ?? null
  const involved = [deDept, paraDept, cardDeptId].filter(Boolean) as string[]
  if (involved.length === 0) return true
  return !involved.some((d) => userDeptIds.includes(d))
}

export type CardConsultaHistoryItem = {
  id: string
  acao: string
  label: string
  created_at: string
  observacao: string | null
  usuario_nome: string
  detail: string | null
  restricted: boolean
}

export type CardConsultaFile = {
  id: string
  file_name: string
  created_at: string
  download_url: string | null
}

export type CardConsultaContext = {
  card: {
    id: string
    titulo: string
    solicitacao: string | null
    descricao: string | null
    observacao: string | null
    valor: number | null
    cliente_nome: string | null
    finalizado: boolean
    created_at: string
    data_prazo: string | null
    conversa_id: string | null
    pipeline_id: string
  }
  pipeline: {
    id: string
    nome: string
    departamento_id: string | null
    departamento_nome: string | null
  }
  stage: { nome: string }
  responsavel: { id: string; nome: string } | null
  lead: {
    id: string
    nome: string | null
    telefone: string | null
    whatsapp: string | null
    email: string | null
  } | null
  history: CardConsultaHistoryItem[]
  files: CardConsultaFile[]
  accessLevel: 'full' | 'restricted'
}

const ACTION_LABELS: Record<string, string> = {
  CARD_CREATED: 'Criação',
  STATUS_CHANGED: 'Progresso',
  TRANSFER_PIPELINE: 'Migração',
  CARD_EDITED: 'Edição',
  CARD_FINISHED: 'Concluído',
  CARD_REOPENED: 'Reaberto',
  ATTACHMENT_ADDED: 'Anexo',
  ATTACHMENT_REMOVED: 'Remoção',
}

export async function getCardConsultaContext(cardId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'UNAUTHENTICATED' as const }
  if (!hasPermission(me, 'cards', 'view')) {
    return { error: 'FORBIDDEN' as const }
  }

  const supabase = await createClient()

  let cardQuery = supabase
    .from('crm_cards')
    .select(`
      id, titulo, descricao, observacao, valor, cliente_nome, finalizado, created_at,
      data_prazo, conversa_id, lead_id, pipeline_id, stage_id, responsavel_id, empresa_id,
      pipelines ( id, nome, departamento_id, departamentos ( id, nome ) ),
      pipeline_stages ( nome ),
      responsavel:usuarios!crm_cards_responsavel_id_fkey ( id, nome_completo ),
      crm_leads ( id, nome, telefone, whatsapp, email )
    `)
    .eq('id', cardId)

  if (me.role_global !== 'superadmin') {
    cardQuery = cardQuery.eq('empresa_id', me.empresa_id)
  }

  const { data: row, error } = await cardQuery.maybeSingle()
  if (error) return { error: 'QUERY_FAILED' as const, message: error.message }
  if (!row) return { error: 'NOT_FOUND' as const }

  const pipeline = firstRelation(row.pipelines)
  const departamento = firstRelation(pipeline?.departamentos ?? null)
  const departamentoId = pipeline?.departamento_id ?? departamento?.id ?? null

  const userDeptIds = await getUserDepartamentoIds(supabase, me.id)
  const accessOpts = {
    responsavel_id: row.responsavel_id as string | null,
    departamento_id: departamentoId,
  }

  const fullAccess = canConsultCard(me, userDeptIds, accessOpts)

  const { data: historyRows, error: histErr } = await supabase
    .from('crm_cards_history')
    .select(`
      id, acao, created_at, observacao,
      usuarios ( nome_completo ),
      de_stage:pipeline_stages!de_stage_id ( nome ),
      para_stage:pipeline_stages!para_stage_id ( nome ),
      de_pipeline:pipelines!de_pipeline_id ( nome, departamento_id ),
      para_pipeline:pipelines!para_pipeline_id ( nome, departamento_id )
    `)
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (histErr) return { error: 'QUERY_FAILED' as const, message: histErr.message }

  let files: CardConsultaFile[] = []
  if (fullAccess) {
    const { data: fileRows, error: filesErr } = await supabase
      .from('crm_card_files')
      .select('id, file_name, file_url, created_at')
      .eq('card_id', cardId)
      .eq('empresa_id', row.empresa_id)
      .order('created_at', { ascending: false })

    if (filesErr) return { error: 'QUERY_FAILED' as const, message: filesErr.message }

    files = await Promise.all(
      (fileRows ?? []).map(async (file) => {
        const { data: signed } = await supabase.storage
          .from('card_attachments')
          .createSignedUrl(file.file_url, 3600)
        return {
          id: file.id,
          file_name: file.file_name,
          created_at: file.created_at,
          download_url: signed?.signedUrl ?? null,
        }
      }),
    )
  }

  const responsavel = firstRelation(
    row.responsavel as
      | { id: string; nome_completo: string }
      | { id: string; nome_completo: string }[]
      | null,
  )
  const lead = firstRelation(
    row.crm_leads as
      | {
          id: string
          nome: string | null
          telefone: string | null
          whatsapp: string | null
          email: string | null
        }
      | {
          id: string
          nome: string | null
          telefone: string | null
          whatsapp: string | null
          email: string | null
        }[]
      | null,
  )
  const stage = firstRelation(row.pipeline_stages)

  const history: CardConsultaHistoryItem[] = (historyRows ?? []).map((h) => {
    const item = h as HistoryRow
    const restricted = isHistoryRestricted(item, userDeptIds, departamentoId, fullAccess)
    return {
      id: item.id,
      acao: item.acao,
      label: restricted
        ? 'Movimentação em outro departamento'
        : ACTION_LABELS[item.acao] ?? item.acao.replace(/_/g, ' '),
      created_at: item.created_at,
      observacao: restricted ? null : item.observacao,
      usuario_nome: historyUsuario(item, restricted),
      detail: historyDetail(item, restricted),
      restricted,
    }
  })

  const solicitacaoRaw = cardSolicitacao(row)

  const context: CardConsultaContext = {
    card: {
      id: row.id,
      titulo: row.titulo?.trim() || 'Card',
      solicitacao: fullAccess ? solicitacaoRaw : null,
      descricao: fullAccess ? row.descricao : null,
      observacao: fullAccess ? row.observacao : null,
      valor: fullAccess && row.valor != null ? Number(row.valor) : null,
      cliente_nome: row.cliente_nome,
      finalizado: row.finalizado === true,
      created_at: row.created_at,
      data_prazo: fullAccess ? row.data_prazo : null,
      conversa_id: fullAccess ? row.conversa_id : null,
      pipeline_id: row.pipeline_id,
    },
    pipeline: {
      id: pipeline?.id ?? row.pipeline_id,
      nome: pipeline?.nome ?? 'Funil',
      departamento_id: departamentoId,
      departamento_nome: departamento?.nome ?? null,
    },
    stage: { nome: stage?.nome ?? '—' },
    responsavel:
      fullAccess && responsavel
        ? { id: responsavel.id, nome: responsavel.nome_completo }
        : null,
    lead:
      fullAccess && lead
        ? {
            id: lead.id,
            nome: lead.nome,
            telefone: lead.telefone,
            whatsapp: lead.whatsapp,
            email: lead.email,
          }
        : lead
          ? { id: lead.id, nome: lead.nome, telefone: null, whatsapp: null, email: null }
          : null,
    history,
    files,
    accessLevel: fullAccess ? 'full' : 'restricted',
  }

  return { data: context }
}
