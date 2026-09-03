'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import {
  diffCrmCardChanges,
  notifyCardAssignmentAndChanges,
  notifyCardResponsavelOnChange,
} from '@/lib/crm/notifyCardResponsavel'
import {
  buildRedirectFacts,
  inferDepartamentoFromCard,
  resolveAssigneeForDepartamento,
  resolveDestinationForUser,
  type RedirectDestination,
} from '@/lib/crm/cardRedirectRouting'
import { generateCardHandoverSummary, type HandoverUrgencia } from '@/lib/crm/cardHandoverSummary'

export async function createPipeline(formData: FormData) {
  try {
    const me = await getMyProfile()
    if (!hasPermission(me, 'funis', 'create')) {
      return { error: 'Sem permissão para criar funis.' }
    }

    const nome = formData.get('nome') as string
    const descricao = formData.get('descricao') as string
    const is_public = formData.get('is_public') === 'true'
    const gruposRaw = formData.get('grupos_ids') as string
    const gruposIds: string[] = gruposRaw ? JSON.parse(gruposRaw) : []
    const departamento_id = formData.get('departamento_id') as string

    const supabase = await createClient()
    const empresaId = me?.role_global === 'superadmin' ? formData.get('empresa_id') as string : me?.empresa_id ?? ''

    const { data: pipeline, error } = await supabase
      .from('pipelines')
      .insert([{
        nome,
        descricao,
        is_public,
        departamento_id: departamento_id || null,
        empresa_id: empresaId
      }])
      .select()
      .single()

    if (error) {
      console.error("Erro ao criar pipeline", error)
      return { error: error.message }
    }

    if (pipeline) {
        // Registrar grupos no Pipeline
        if (gruposIds.length > 0) {
          const pipelineGroupsData = gruposIds.map(grupoId => ({
              pipeline_id: pipeline.id,
              grupo_id: grupoId
          }))
          await supabase.from('pipeline_grupo_acesso').insert(pipelineGroupsData)
        }

        // Criar estágios básicos padrão
        const { data: stages } = await supabase.from('pipeline_stages').insert([
            { pipeline_id: pipeline.id, nome: 'PROSPECÇÃO', ordem: 0, cor: '#80B828' },
            { pipeline_id: pipeline.id, nome: 'NEGOCIAÇÃO', ordem: 1, cor: '#2BAADF' },
            { pipeline_id: pipeline.id, nome: 'FECHADO', ordem: 2, cor: '#1A8FBF' }
        ]).select('id')

        // Herdar permissão de grupos nos estágios recém-criados
        if (stages && gruposIds.length > 0) {
           const stageGroupsData: { stage_id: string, grupo_id: string }[] = []
           stages.forEach(stage => {
              gruposIds.forEach(grupoId => {
                 stageGroupsData.push({ stage_id: stage.id, grupo_id: grupoId })
              })
           })
           await supabase.from('pipeline_stage_grupo_acesso').insert(stageGroupsData)
        }
    }

    revalidatePath('/cockpit/crm/funis')
    return { success: true, pipelineId: pipeline?.id }
  } catch (err: any) {
    console.error("Fatal Error Create Pipeline", err)
    return { error: err?.message || 'Erro crítico na Server Action' }
  }
}

export async function createCrmCard(pipelineId: string, stageId: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'cards', 'create')) {
    return { error: 'Sem permissão para criar cards no CRM.' }
  }

  const titulo = formData.get('titulo') as string
  const descricao = formData.get('descricao') as string
  const valor = formData.get('valor') || 0
  const lead_id = (formData.get('lead_id') as string)?.trim() || null
  const responsavelFromForm = formData.get('responsavel_id') as string
  const responsavel_id = responsavelFromForm || me?.id || null
  const data_prazo_form = formData.get('data_prazo') as string || null

  if (!lead_id) {
    return { error: 'Selecione um lead da base. Todo card precisa estar vinculado a um lead.' }
  }

  const supabase = await createClient()
  const empresaId = me?.role_global === 'superadmin' ? formData.get('empresa_id') as string : me?.empresa_id ?? ''

  let leadQuery = supabase
    .from('crm_leads')
    .select('id, nome')
    .eq('id', lead_id)
  if (me?.role_global !== 'superadmin') {
    leadQuery = leadQuery.eq('empresa_id', me?.empresa_id ?? '')
  }
  const { data: lead, error: leadErr } = await leadQuery.maybeSingle()
  if (leadErr || !lead) {
    return { error: 'Lead não encontrado ou sem permissão para vinculá-lo.' }
  }

  const cliente_nome = lead.nome?.trim() || null

  // Se não digitou prazo manualmente, calcula a partir do SLA do estágio
  // sla_dias = null → mesmo dia (0 dias); sla_dias = N → hoje + N dias
  let data_prazo = data_prazo_form
  if (!data_prazo) {
    const { data: stageData } = await supabase
      .from('pipeline_stages')
      .select('sla_dias')
      .eq('id', stageId)
      .single()
    
    const slaDias = stageData?.sla_dias ?? 0
    const now = new Date()
    data_prazo = new Date(now.getTime() + slaDias * 86400000).toISOString().split('T')[0]
  }

  const { data: newCard, error: insertError } = await supabase
    .from('crm_cards')
    .insert([{
      titulo,
      descricao,
      valor: Number(valor),
      cliente_nome,
      lead_id: lead.id,
      pipeline_id: pipelineId,
      stage_id: stageId,
      empresa_id: empresaId,
      responsavel_id: responsavel_id || null,
      data_prazo: data_prazo || null,
      stage_entered_at: new Date().toISOString()
    }])
    .select('id')
    .single()

  if (insertError) {
    console.error("Erro ao criar card", insertError)
    return { error: insertError.message }
  }

  // Gravar histórico de Criação
  if (me?.id && newCard?.id) {
    await supabase.from('crm_cards_history').insert([{
       card_id: newCard.id,
       usuario_id: me.id,
       acao: 'CARD_CREATED',
       para_stage_id: stageId,
       para_pipeline_id: pipelineId
    }])
  }

  if (newCard?.id && responsavel_id && me?.id && responsavel_id !== me.id) {
    await notifyCardResponsavelOnChange({
      supabase,
      empresaId,
      cardId: newCard.id,
      cardTitulo: titulo,
      actorId: me.id,
      actorNome: me.nome_completo || 'Colega',
      notifyUserId: responsavel_id,
      changeSummary: 'você foi definido como responsável deste card',
    })
  }

  revalidatePath(`/cockpit/crm/funis/${pipelineId}`)
  return { success: true, id: newCard?.id }
}

export async function updateCardStage(cardId: string, pipelineId: string, newStageId: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'cards', 'move')) {
    return { error: 'Sem permissão para mover cards no CRM.' }
  }
  const supabase = await createClient()

  // Buscar current para histórico + notificação
  const { data: currentCard } = await supabase
    .from('crm_cards')
    .select('stage_id, titulo, responsavel_id, empresa_id')
    .eq('id', cardId)
    .single()
  const de_stage_id = currentCard?.stage_id

  // Fetch SLA from the new stage to compute data_prazo
  const { data: stageData } = await supabase
    .from('pipeline_stages')
    .select('sla_dias, nome')
    .eq('id', newStageId)
    .single()

  const now = new Date()
  // sla_dias = null → mesmo dia (0 dias); sla_dias = N → hoje + N dias
  const slaDias = stageData?.sla_dias ?? 0
  const data_prazo = new Date(now.getTime() + slaDias * 86400000).toISOString().split('T')[0]

  const updatePayload: Record<string, any> = {
    stage_id: newStageId,
    stage_entered_at: now.toISOString(),
    data_prazo,
  }

  const query = supabase.from('crm_cards').update(updatePayload).eq('id', cardId)
  
  // Tenant Isolation
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) {
    console.error("Erro ao mover card", error)
    return { error: error.message }
  }

  // Gravar histórico
  if (me?.id && de_stage_id !== newStageId) {
     await supabase.from('crm_cards_history').insert([{
        card_id: cardId,
        usuario_id: me.id,
        acao: 'STATUS_CHANGED',
        de_stage_id: de_stage_id,
        para_stage_id: newStageId,
        de_pipeline_id: pipelineId,
        para_pipeline_id: pipelineId
     }])

     if (currentCard?.responsavel_id && currentCard.empresa_id) {
       const stageLabel = stageData?.nome ? `moveu para ${stageData.nome}` : 'moveu de estágio'
       await notifyCardResponsavelOnChange({
         supabase,
         empresaId: currentCard.empresa_id,
         cardId,
         cardTitulo: currentCard.titulo || 'Card',
         actorId: me.id,
         actorNome: me.nome_completo || 'Colega',
         notifyUserId: currentCard.responsavel_id,
         changeSummary: stageLabel,
       })
     }
  }

  // A UI cuidará do swap visual, mas persistimos na DB
  revalidatePath(`/cockpit/crm/${pipelineId}`)
}

export async function transferCardPipeline(
  cardId: string,
  currentPipelineId: string,
  toPipelineId: string,
  toStageId: string,
  observacao?: string,
  urgencia?: HandoverUrgencia,
) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'cards', 'move')) {
    return { error: 'Sem permissão para transferir cards entre funis.' }
  }
  const supabase = createAdminClient()

  const { data: currentCard } = await supabase
    .from('crm_cards')
    .select('stage_id, titulo, responsavel_id, empresa_id, metadados, observacao')
    .eq('id', cardId)
    .single()
  const de_stage_id = currentCard?.stage_id

  const cardPatch: Record<string, unknown> = {
    pipeline_id: toPipelineId,
    stage_id: toStageId,
  }

  if (observacao?.trim()) {
    cardPatch.observacao = observacao.trim()
  }

  if (urgencia) {
    const prev =
      currentCard?.metadados && typeof currentCard.metadados === 'object'
        ? (currentCard.metadados as Record<string, unknown>)
        : {}
    cardPatch.metadados = { ...prev, prioridade: urgencia }
  }

  const query = supabase.from('crm_cards').update(cardPatch).eq('id', cardId)
  
  // Tenant Isolation (Obrigatório ao usar Admin Client)
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) return { error: error.message }

  if (me?.id) {
     await supabase.from('crm_cards_history').insert([{
        card_id: cardId,
        usuario_id: me.id,
        acao: 'TRANSFER_PIPELINE',
        de_stage_id: de_stage_id,
        para_stage_id: toStageId,
        de_pipeline_id: currentPipelineId,
        para_pipeline_id: toPipelineId,
        observacao: observacao,
     }])
  }

  if (currentCard?.responsavel_id && currentCard.empresa_id && me?.id) {
    const { data: toPipe } = await supabase
      .from('pipelines')
      .select('nome')
      .eq('id', toPipelineId)
      .maybeSingle()
    const { data: toStage } = await supabase
      .from('pipeline_stages')
      .select('nome')
      .eq('id', toStageId)
      .maybeSingle()
    const dest = [toPipe?.nome, toStage?.nome].filter(Boolean).join(' / ') || 'outro funil'
    await notifyCardResponsavelOnChange({
      supabase,
      empresaId: currentCard.empresa_id,
      cardId,
      cardTitulo: currentCard.titulo || 'Card',
      actorId: me.id,
      actorNome: me.nome_completo || 'Colega',
      notifyUserId: currentCard.responsavel_id,
      changeSummary: observacao
        ? `transferiu para ${dest}. Obs.: ${observacao.slice(0, 120)}`
        : `transferiu para ${dest}`,
    })
  }

  revalidatePath(`/cockpit/crm/${currentPipelineId}`)
  revalidatePath(`/cockpit/crm/${toPipelineId}`)
}

export async function updateCrmCard(cardId: string, pipelineId: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'cards', 'edit')) {
    return { error: 'Sem permissão para editar cards no CRM.' }
  }
  const supabase = await createClient()

  const titulo = formData.get('titulo') as string
  const descricao = formData.get('descricao') as string
  const valor = formData.get('valor') || 0
  const cliente_nome = formData.get('cliente_nome') as string
  const observacao = formData.get('observacao') as string
  const responsavel_id = formData.get('responsavel_id') as string || null
  let data_prazo = formData.get('data_prazo') as string || null

  const { data: before } = await supabase
    .from('crm_cards')
    .select('titulo, descricao, valor, cliente_nome, observacao, responsavel_id, data_prazo, empresa_id, stage_id')
    .eq('id', cardId)
    .single()

  const responsavelChanged =
    responsavel_id && responsavel_id !== (before?.responsavel_id ?? null)

  if (responsavelChanged && !data_prazo && !before?.data_prazo && before?.stage_id) {
    const { data: stageData } = await supabase
      .from('pipeline_stages')
      .select('sla_dias')
      .eq('id', before.stage_id)
      .maybeSingle()

    const slaDias = stageData?.sla_dias ?? 0
    const now = new Date()
    data_prazo = new Date(now.getTime() + slaDias * 86400000).toISOString().split('T')[0]
  }

  const query = supabase
    .from('crm_cards')
    .update({
      titulo,
      descricao,
      valor: Number(valor),
      cliente_nome,
      observacao,
      responsavel_id: responsavel_id || null,
      data_prazo: data_prazo || null
    })
    .eq('id', cardId)

  // Tenant Isolation
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query
  if (error) {
    console.error("Erro ao atualizar card", error)
    return { error: error.message }
  }

  // Gravar histórico de Edição
  if (me?.id) {
     await supabase.from('crm_cards_history').insert([{
        card_id: cardId,
        usuario_id: me.id,
        acao: 'CARD_EDITED',
        de_pipeline_id: pipelineId,
        para_pipeline_id: pipelineId
     }])
  }

  if (me?.id && before?.empresa_id) {
    const otherChanges = diffCrmCardChanges(
      {
        titulo: before.titulo,
        descricao: before.descricao,
        valor: before.valor,
        cliente_nome: before.cliente_nome,
        observacao: before.observacao,
        data_prazo: before.data_prazo,
      },
      {
        titulo,
        descricao,
        valor: Number(valor),
        cliente_nome,
        observacao,
        data_prazo: data_prazo || null,
      },
    )
    await notifyCardAssignmentAndChanges({
      supabase,
      empresaId: before.empresa_id,
      cardId,
      cardTitulo: titulo || before.titulo || 'Card',
      actorId: me.id,
      actorNome: me.nome_completo || 'Colega',
      previousResponsavelId: before.responsavel_id,
      nextResponsavelId: responsavel_id,
      otherChanges,
    })
  }

  revalidatePath(`/cockpit/crm/${pipelineId}`)
}

export async function toggleCardFinalizado(cardId: string, pipelineId: string, status: boolean) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'cards', 'edit')) {
    return { error: 'Sem permissão para alterar status de conclusão.' }
  }
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('crm_cards')
    .select('titulo, responsavel_id, empresa_id')
    .eq('id', cardId)
    .single()

  const query = supabase
    .from('crm_cards')
    .update({ finalizado: status })
    .eq('id', cardId)

  // Tenant Isolation
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query

  if (error) {
    console.error("Erro ao concluir card", error)
    return { error: error.message }
  }

  // Gravar histórico de Conclusão / Reativação
  if (me?.id) {
     await supabase.from('crm_cards_history').insert([{
        card_id: cardId,
        usuario_id: me.id,
        acao: status ? 'CARD_FINISHED' : 'CARD_REOPENED',
        de_pipeline_id: pipelineId,
        para_pipeline_id: pipelineId
     }])
  }

  if (me?.id && before?.responsavel_id && before.empresa_id) {
    await notifyCardResponsavelOnChange({
      supabase,
      empresaId: before.empresa_id,
      cardId,
      cardTitulo: before.titulo || 'Card',
      actorId: me.id,
      actorNome: me.nome_completo || 'Colega',
      notifyUserId: before.responsavel_id,
      changeSummary: status ? 'marcou como finalizado' : 'reativou o card',
    })
  }

  revalidatePath(`/cockpit/crm/${pipelineId}`)
  return { success: true }
}

export async function getCardHistory(cardId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('crm_cards_history')
    .select(`
       id, acao, created_at, observacao,
       usuarios ( nome_completo ),
       de_stage:pipeline_stages!de_stage_id ( nome ),
       para_stage:pipeline_stages!para_stage_id ( nome ),
       de_pipeline:pipelines!de_pipeline_id ( nome ),
       para_pipeline:pipelines!para_pipeline_id ( nome )
    `)
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
  
  return { data, error: error?.message }
}

export async function saveStageConfig(pipelineId: string, stages: any[], stageGroupMap: Record<string, string[]>) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'funis', 'edit')) {
    return { error: 'Sem permissão para editar estágios do funil.' }
  }
  const supabase = await createClient()

  // 1. Processar Estágios. Vamos obter os estágios atuais para saber se tem que deletar
  const { data: existing } = await supabase.from('pipeline_stages').select('id').eq('pipeline_id', pipelineId)
  const existingIds = existing?.map(e => e.id) || []
  
  const incomingIds = stages.filter(s => s.id).map(s => s.id)
  const toDelete = existingIds.filter(id => !incomingIds.includes(id))

  // Deleta os que não vieram na lista salva (cuidado: cascade vai apagar cards e permissions!)
  if (toDelete.length > 0) {
     await supabase.from('pipeline_stages').delete().in('id', toDelete)
  }

  // Insere ou atualiza estágios
   for (let i = 0; i < stages.length; i++) {
     const st = stages[i]
     const tempKey = st.id || `new_${i}`
     let realStageId = st.id

     if (st.id) {
       await supabase.from('pipeline_stages').update({
         nome: st.nome,
         cor: st.cor,
         ordem: st.ordem,
         sla_dias: st.sla_dias ?? null
       }).eq('id', st.id)
     } else {
       const { data: novo } = await supabase.from('pipeline_stages').insert({
          pipeline_id: pipelineId,
          nome: st.nome,
          cor: st.cor,
          ordem: st.ordem,
          sla_dias: st.sla_dias ?? null
       }).select('id').single()
       if (novo) realStageId = novo.id
     }

     // 2. Atualizar permissões de GRUPOS do Estágio!
     // Limpa permissões do stage
     if (realStageId) {
       await supabase.from('pipeline_stage_grupo_acesso').delete().eq('stage_id', realStageId)
       
       const permittedGroups = stageGroupMap[tempKey] || []
       if (permittedGroups.length > 0) {
          const acc_data = permittedGroups.map(gid => ({
             stage_id: realStageId,
             grupo_id: gid
          }))
          await supabase.from('pipeline_stage_grupo_acesso').insert(acc_data)
       }
     }
  }

  revalidatePath(`/cockpit/crm/${pipelineId}`)
}

export async function updatePipeline(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'funis', 'edit')) {
    return { error: 'Sem permissão para editar funis.' }
  }

  const id = formData.get('id') as string
  const nome = formData.get('nome') as string
  const descricao = formData.get('descricao') as string
  const is_public = formData.get('is_public') === 'true'
  const gruposRaw = formData.get('grupos_ids') as string
  const gruposIds: string[] = gruposRaw ? JSON.parse(gruposRaw) : []

  const supabase = await createClient()

  // 1. Atualizar base
  const { error } = await supabase
    .from('pipelines')
    .update({ nome, descricao, is_public })
    .eq('id', id)

  if (error) {
    console.error("Erro ao atualizar pipeline", error)
    return { error: error.message }
  }

  // 2. Limpar e recadastrar grupos associados globais
  await supabase.from('pipeline_grupo_acesso').delete().eq('pipeline_id', id)
  
  if (gruposIds.length > 0) {
    const pipelineGroupsData = gruposIds.map(grupoId => ({
        pipeline_id: id,
        grupo_id: grupoId
    }))
    await supabase.from('pipeline_grupo_acesso').insert(pipelineGroupsData)
  }

  revalidatePath('/cockpit/crm/funis')
  redirect('/cockpit/crm/funis')
}

export async function deletePipeline(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'funis', 'delete')) {
    return { error: 'Sem permissão para excluir funis.' }
  }

  const id = formData.get('id') as string
  const supabase = await createClient()

  const { error } = await supabase.from('pipelines').delete().eq('id', id)

  if (error) {
    console.error("Erro ao excluir pipeline", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/crm/funis')
  redirect('/cockpit/crm/funis')
}

export async function deleteCrmCard(cardId: string, pipelineId: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'cards', 'delete')) {
    return { error: 'Sem permissão para excluir cards.' }
  }
  const supabase = await createClient()

  const query = supabase.from('crm_cards').delete().eq('id', cardId)

  // Tenant Isolation (Lei Suprema)
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query

  if (error) {
    console.error("Erro ao excluir card", error)
    return { error: error.message }
  }

  revalidatePath(`/cockpit/crm/${pipelineId}`)
  return { success: true }
}

export async function getCardFiles(cardId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('crm_card_files')
    .select('*')
    .eq('card_id', cardId)
    .eq('empresa_id', me.empresa_id)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }

  // Gerar URLs assinadas para cada arquivo para permitir acesso seguro
  const filesWithUrls = await Promise.all((data || []).map(async (file) => {
    const { data: signedUrlData } = await supabase.storage
      .from('card_attachments')
      .createSignedUrl(file.file_url, 3600) // 1 hora de validade
    
    return { ...file, download_url: signedUrlData?.signedUrl }
  }))

  return { data: filesWithUrls }
}

export async function uploadCardFile(cardId: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'card_attachments', 'create')) {
    return { error: 'Sem permissão para anexar arquivos.' }
  }

  const file = formData.get('file') as File
  if (!file) return { error: 'Nenhum arquivo enviado.' }

  // Validação de Tamanho (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return { error: 'Arquivo excede o limite de 5MB.' }
  }

  const supabase = await createClient()
  const empresaId = me.empresa_id
  const fileName = `${Date.now()}_${file.name}`
  const filePath = `${empresaId}/${cardId}/${fileName}`

  // 1. Upload para o Storage
  const { data: storageData, error: storageError } = await supabase.storage
    .from('card_attachments')
    .upload(filePath, file)

  if (storageError) {
    console.error("Erro storage upload:", storageError)
    return { error: storageError.message }
  }

  // 2. Salvar Metadados no Banco
  const { error: dbError } = await supabase
    .from('crm_card_files')
    .insert([{
      empresa_id: empresaId,
      card_id: cardId,
      file_name: file.name,
      file_url: filePath,
      file_type: file.type,
      uploaded_by: me.id
    }])

  if (dbError) {
    // Pipeline de rollback: se falhar no DB, removemos do Storage
    await supabase.storage.from('card_attachments').remove([filePath])
    return { error: dbError.message }
  }

  // REGISTRAR NO HISTÓRICO
  await supabase.from('crm_cards_history').insert([{
     card_id: cardId,
     usuario_id: me.id,
     acao: 'ATTACHMENT_ADDED',
     observacao: `Anexo adicionado: ${file.name}`
  }])

  const { data: cardMeta } = await supabase
    .from('crm_cards')
    .select('titulo, responsavel_id, empresa_id')
    .eq('id', cardId)
    .maybeSingle()

  if (cardMeta?.responsavel_id && cardMeta.empresa_id) {
    await notifyCardResponsavelOnChange({
      supabase,
      empresaId: cardMeta.empresa_id,
      cardId,
      cardTitulo: cardMeta.titulo || 'Card',
      actorId: me.id,
      actorNome: me.nome_completo || 'Colega',
      notifyUserId: cardMeta.responsavel_id,
      changeSummary: `anexou o arquivo "${file.name}"`,
    })
  }

  return { success: true }
}

export async function deleteCardFile(fileId: string, storagePath: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'card_attachments', 'delete')) {
    return { error: 'Sem permissão para excluir anexos.' }
  }

  const supabase = await createClient()

  // 0. Buscar metadados para o histórico antes de deletar
  const { data: fileData } = await supabase
    .from('crm_card_files')
    .select('file_name, card_id')
    .eq('id', fileId)
    .single()

  let cardMeta: { titulo: string | null; responsavel_id: string | null; empresa_id: string } | null =
    null
  if (fileData?.card_id) {
    const { data } = await supabase
      .from('crm_cards')
      .select('titulo, responsavel_id, empresa_id')
      .eq('id', fileData.card_id)
      .maybeSingle()
    cardMeta = data
  }

  // 1. Remover do Storage
  const { error: storageError } = await supabase.storage
    .from('card_attachments')
    .remove([storagePath])

  if (storageError) {
    console.error("Erro storage remove:", storageError)
    // Mesmo se falhar no storage, tentamos limpar o DB se o arquivo não existir mais
  }

  // 2. Remover do Banco (Garantindo Tenant Isolation)
  const query = supabase.from('crm_card_files').delete().eq('id', fileId)
  
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error: dbError } = await query
  if (dbError) return { error: dbError.message }

  // REGISTRAR NO HISTÓRICO
  if (fileData) {
     await supabase.from('crm_cards_history').insert([{
        card_id: fileData.card_id,
        usuario_id: me.id,
        acao: 'ATTACHMENT_REMOVED',
        observacao: `Anexo removido: ${fileData.file_name}`
     }])

     if (cardMeta?.responsavel_id && cardMeta.empresa_id) {
       await notifyCardResponsavelOnChange({
         supabase,
         empresaId: cardMeta.empresa_id,
         cardId: fileData.card_id,
         cardTitulo: cardMeta.titulo || 'Card',
         actorId: me.id,
         actorNome: me.nome_completo || 'Colega',
         notifyUserId: cardMeta.responsavel_id,
         changeSummary: `removeu o anexo "${fileData.file_name}"`,
       })
     }
  }

  return { success: true }
}

export async function getTransferablePipelines() {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('pipelines')
    .select('id, nome, pipeline_stages(id, nome, ordem)')
    .eq('empresa_id', me.empresa_id)
    .order('nome')

  if (error) return { error: error.message }

  // Ordenar os estágios dentro de cada pipeline
  const pipesWithOrderedStages = (data || []).map(p => ({
     ...p,
     pipeline_stages: [...(p.pipeline_stages || [])].sort((a,b) => a.ordem - b.ordem)
  }))

  return { data: pipesWithOrderedStages }
}

export async function searchCrmCards(query: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('crm_cards')
    .select('id, titulo')
    .ilike('titulo', `%${query}%`)
    .eq('empresa_id', me.empresa_id)
    .limit(10)
    
  return { data, error: error?.message }
}

export async function getCardRedirectContext(card: {
  id?: string
  titulo?: string | null
  descricao?: string | null
  observacao?: string | null
  lead_id?: string | null
  metadados?: unknown
}): Promise<{
  data?: {
    departamentos: { id: string; nome: string }[]
    operadores: {
      id: string
      nome: string
      pendentes: number
      departamento_ids: string[]
    }[]
    inferred_departamento_id: string | null
    inferred_departamento_nome: string | null
  }
  error?: string
}> {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Não autenticado' }

  const supabase = createAdminClient()
  const facts = await buildRedirectFacts(supabase, me.empresa_id, card.lead_id)

  const departamentos = facts.departamentos
  const operadores = facts.usuarios_aptos.map((u) => ({
    id: u.id,
    nome: u.nome,
    departamento_ids: u.departamento_ids,
    pendentes: u.pendentes,
  }))

  const inferred = inferDepartamentoFromCard(facts, card)

  return {
    data: {
      departamentos,
      operadores,
      inferred_departamento_id: inferred?.departamento_id ?? null,
      inferred_departamento_nome: inferred?.departamento_nome ?? null,
    },
  }
}

/** Gera resumo IA da conversa para validação no encaminhamento cross-funil. */
export async function generateHandoverObservacao(input: {
  cardId: string
  leadId?: string | null
  dePipelineNome: string
  paraPipelineNome: string
}): Promise<{
  data?: { observacao: string; urgencia: HandoverUrgencia }
  error?: string
}> {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Não autenticado' }
  if (!hasPermission(me, 'cards', 'move')) {
    return { error: 'Sem permissão para encaminhar cards.' }
  }

  const supabase = createAdminClient()
  const { data: cardRow, error: cardError } = await supabase
    .from('crm_cards')
    .select('id, titulo, descricao, observacao, lead_id, empresa_id')
    .eq('id', input.cardId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  if (cardError || !cardRow) {
    return { error: 'Card não encontrado.' }
  }

  const result = await generateCardHandoverSummary(supabase, {
    empresaId: me.empresa_id,
    leadId: input.leadId ?? cardRow.lead_id,
    card: {
      titulo: cardRow.titulo,
      descricao: cardRow.descricao,
      observacao: cardRow.observacao,
    },
    dePipelineNome: input.dePipelineNome,
    paraPipelineNome: input.paraPipelineNome,
  })

  if (!result.success) return { error: result.error }
  return { data: { observacao: result.observacao, urgencia: result.urgencia } }
}

export async function previewCardRedirect(input:
  | { mode: 'user'; userId: string; leadId?: string | null }
  | { mode: 'departamento'; departamentoId: string; leadId?: string | null },
): Promise<{ data?: RedirectDestination; error?: string }> {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Não autenticado' }

  const supabase = createAdminClient()
  const facts = await buildRedirectFacts(supabase, me.empresa_id, input.leadId)

  if (input.mode === 'user') {
    const dest = resolveDestinationForUser(facts, input.userId)
    if (!dest) return { error: 'Operador não encontrado ou sem funil vinculado.' }
    return { data: await enrichRedirectDestination(supabase, dest) }
  }

  const dest = resolveAssigneeForDepartamento(facts, input.departamentoId)
  if (!dest) return { error: 'Departamento inválido.' }
  return { data: await enrichRedirectDestination(supabase, dest) }
}

async function enrichRedirectDestination(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dest: RedirectDestination,
): Promise<RedirectDestination> {
  if (!dest.pipeline_id) return dest

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, nome, ordem')
    .eq('pipeline_id', dest.pipeline_id)
    .order('ordem')

  return {
    ...dest,
    pipeline_stages: (stages ?? []).map((s) => ({
      id: s.id,
      nome: s.nome,
      ordem: s.ordem,
    })),
  }
}
