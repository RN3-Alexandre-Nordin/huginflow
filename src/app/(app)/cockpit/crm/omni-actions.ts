'use server'

import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { EvolutionProvider } from '@/lib/omnichannel/providers/EvolutionProvider'
import { buildEvolutionProviderConfig } from '@/lib/omnichannel/evolution-config'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'
import { normalizeWhatsAppPhone } from '@/lib/omnichannel/phone'
import { WHATSAPP_SENDER_LABELS } from '@/lib/omnichannel/whatsapp-outbound'
import { isDeptSessionsEnabled } from '@/lib/omnichannel/dept-sessions-constants'
import { linkLeadToCard } from '@/lib/crm/resolveLead'
import {
  ActiveSpeakerService,
  ChatThreadService,
} from '@/lib/omnichannel/ChatThreadService'
import { revalidatePath } from 'next/cache'

/** @param sessaoId ID estável do thread (crm_conversas.sessao_id) */
export async function sendOmniMessage(sessaoId: string, content: string) {
  try {
    const me = await getMyProfile()
    if (!me) throw new Error('Usuário não autenticado')

    const supabase = await createClient()

    const { data: conversa, error: convError } = await supabase
      .from('crm_conversas')
      .select(
        `
        *,
        crm_canais (*),
        crm_leads (*)
      `,
      )
      .eq('sessao_id', sessaoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (convError || !conversa) throw new Error('Sessão não encontrada')
    if (!conversa.crm_canais) throw new Error('Canal de comunicação não configurado')
    if (!conversa.crm_leads) throw new Error('Lead não identificado na conversa')

    const canal = conversa.crm_canais
    const lead = conversa.crm_leads
    const provider = new EvolutionProvider()

    const config = buildEvolutionProviderConfig({
      provider_id: canal.provider_id,
      provider_token: canal.provider_token,
      settings: canal.settings as Record<string, unknown> | null,
    })

    const { data: insertedMsg, error: insertError } = await supabase
      .from('crm_interacoes')
      .insert({
        empresa_id: me.empresa_id,
        conversa_id: sessaoId,
        lead_id: lead.id,
        user_id: me.id,
        contact_phone: lead.telefone,
        contact_name: lead.nome || 'Cliente WhatsApp',
        content: content,
        role: 'assistant',
        metadata: {
          sent_by: me.id,
          status: 'sent_manual',
        },
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Omni] ERRO NO INSERT:', JSON.stringify(insertError, null, 2))
      return { success: false, error: `Erro no Banco (RLS ou Schema): ${insertError.message}` }
    }

    const externalId =
      normalizeWhatsAppPhone(conversa.external_id || lead.telefone || lead.whatsapp || '') || ''

    const historicoId = await ConversaHistoricoService.appendMessage(
      {
        empresa_id: me.empresa_id,
        canal_id: conversa.canal_id,
        external_id: externalId,
        lead_id: lead.id,
        role: 'assistant',
        content,
        direcao: 'outbound',
        status: 'human',
        last_human_interaction: new Date().toISOString(),
        atribuido_a_id: me.id,
        metadata: { sent_by: me.id, status: 'sent_manual' },
        sessao_id: sessaoId,
      },
      supabase,
    )

    if (!historicoId) console.error('[Omni] Erro ao gravar linha em crm_conversas')

    if (isDeptSessionsEnabled() && externalId) {
      const thread = await ChatThreadService.getById(supabase, sessaoId)
      await ActiveSpeakerService.activate(supabase, {
        empresaId: me.empresa_id!,
        canalId: conversa.canal_id,
        externalId,
        sessaoId,
        departamentoId: thread?.departamento_id,
        activatedBy: me.id,
        reason: 'outbound',
      })
    }

    const recipient = externalId
    if (!recipient) {
      return { success: false, error: 'Telefone do lead não encontrado (external_id vazio).' }
    }

    const senderLabel = me.nome_completo?.trim() || WHATSAPP_SENDER_LABELS.attendantFallback
    const result = await provider.sendAttendantMessage(recipient, senderLabel, content, config)

    if (result.success) {
      await supabase
        .from('crm_interacoes')
        .update({
          metadata: {
            ...insertedMsg.metadata,
            provider_message_id: result.messageId,
            status: 'sent',
          },
        })
        .eq('id', insertedMsg.id)

      return { success: true, messageId: result.messageId }
    }

    await supabase
      .from('crm_interacoes')
      .update({
        metadata: { ...insertedMsg.metadata, status: 'error', provider_error: result.error },
      })
      .eq('id', insertedMsg.id)

    return {
      success: false,
      error:
        'Gravado no banco, mas falhou ao enviar para o WhatsApp: ' + JSON.stringify(result.error),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar'
    console.error('[OmniActions] Erro ao enviar mensagem:', error)
    return { success: false, error: message }
  }
}

const MAX_OMNI_ATTACHMENT_BYTES = 5 * 1024 * 1024

function resolveMediaType(mimeType: string): 'image' | 'document' {
  if (mimeType.startsWith('image/')) return 'image'
  return 'document'
}

/** Envia PDF/imagem do operador para o WhatsApp via Evolution. */
export async function sendOmniAttachment(formData: FormData) {
  try {
    const me = await getMyProfile()
    if (!me) throw new Error('Usuário não autenticado')

    const sessaoId = String(formData.get('sessaoId') ?? '')
    const caption = String(formData.get('caption') ?? '').trim()
    const file = formData.get('file')

    if (!sessaoId) return { success: false, error: 'Sessão não informada.' }
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: 'Selecione um arquivo válido.' }
    }
    if (file.size > MAX_OMNI_ATTACHMENT_BYTES) {
      return { success: false, error: 'Arquivo excede o limite de 5 MB.' }
    }

    const mimeType = file.type || 'application/octet-stream'
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      return {
        success: false,
        error: 'Formato não suportado. Envie PDF ou imagem (PNG, JPG, WEBP).',
      }
    }

    const supabase = await createClient()

    const { data: conversa, error: convError } = await supabase
      .from('crm_conversas')
      .select(`*, crm_canais (*), crm_leads (*)`)
      .eq('sessao_id', sessaoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (convError || !conversa) throw new Error('Sessão não encontrada')
    if (!conversa.crm_canais) throw new Error('Canal de comunicação não configurado')
    if (!conversa.crm_leads) throw new Error('Lead não identificado na conversa')

    const canal = conversa.crm_canais
    const lead = conversa.crm_leads
    const provider = new EvolutionProvider()
    const config = buildEvolutionProviderConfig({
      provider_id: canal.provider_id,
      provider_token: canal.provider_token,
      settings: canal.settings as Record<string, unknown> | null,
    })

    const externalId =
      normalizeWhatsAppPhone(conversa.external_id || lead.telefone || lead.whatsapp || '') || ''
    if (!externalId) {
      return { success: false, error: 'Telefone do lead não encontrado.' }
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mediatype = resolveMediaType(mimeType)
    const displayContent = caption || `📎 ${file.name}`

    const { data: insertedMsg, error: insertError } = await supabase
      .from('crm_interacoes')
      .insert({
        empresa_id: me.empresa_id,
        conversa_id: sessaoId,
        lead_id: lead.id,
        user_id: me.id,
        contact_phone: lead.telefone,
        contact_name: lead.nome || 'Cliente WhatsApp',
        content: displayContent,
        role: 'assistant',
        metadata: {
          sent_by: me.id,
          status: 'pending_send',
          media_type: mediatype,
          file_name: file.name,
          mimetype: mimeType,
        },
      })
      .select()
      .single()

    if (insertError) {
      return { success: false, error: `Erro no banco: ${insertError.message}` }
    }

    await ConversaHistoricoService.appendMessage(
      {
        empresa_id: me.empresa_id,
        canal_id: conversa.canal_id,
        external_id: externalId,
        lead_id: lead.id,
        role: 'assistant',
        content: displayContent,
        direcao: 'outbound',
        status: 'human',
        last_human_interaction: new Date().toISOString(),
        atribuido_a_id: me.id,
        metadata: {
          sent_by: me.id,
          status: 'pending_send',
          media_type: mediatype,
          file_name: file.name,
        },
        sessao_id: sessaoId,
      },
      supabase,
    )

    if (isDeptSessionsEnabled()) {
      const thread = await ChatThreadService.getById(supabase, sessaoId)
      await ActiveSpeakerService.activate(supabase, {
        empresaId: me.empresa_id!,
        canalId: conversa.canal_id,
        externalId,
        sessaoId,
        departamentoId: thread?.departamento_id,
        activatedBy: me.id,
        reason: 'outbound',
      })
    }

    const senderLabel = me.nome_completo?.trim() || WHATSAPP_SENDER_LABELS.attendantFallback
    const result = await provider.sendAttendantMedia(
      externalId,
      senderLabel,
      {
        mediatype,
        mimetype: mimeType,
        media: base64,
        fileName: file.name,
        caption,
      },
      config,
    )

    if (result.success) {
      await supabase
        .from('crm_interacoes')
        .update({
          metadata: {
            ...insertedMsg.metadata,
            provider_message_id: result.messageId,
            status: 'sent',
          },
        })
        .eq('id', insertedMsg.id)

      revalidatePath('/cockpit/crm/chat')
      return { success: true, messageId: result.messageId }
    }

    await supabase
      .from('crm_interacoes')
      .update({
        metadata: { ...insertedMsg.metadata, status: 'error', provider_error: result.error },
      })
      .eq('id', insertedMsg.id)

    return {
      success: false,
      error:
        'Gravado no banco, mas falhou ao enviar anexo no WhatsApp: ' +
        JSON.stringify(result.error),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao enviar anexo'
    console.error('[OmniActions] Erro ao enviar anexo:', error)
    return { success: false, error: message }
  }
}

export type StartOmniConversationResult =
  | {
      success: true
      sessaoId: string
      assumed: boolean
      createdThread: boolean
    }
  | {
      success: false
      error: string
      needsAssume?: boolean
      activeDepartamentoNome?: string | null
      activeSessaoId?: string
    }

/**
 * Inicia (ou retoma) conversa WhatsApp a partir de um card — cria thread isolada se necessário.
 */
export async function startOmniConversation(
  cardId: string,
  content: string,
  opts?: { forceAssume?: boolean; leadId?: string },
): Promise<StartOmniConversationResult> {
  try {
    const me = await getMyProfile()
    if (!me?.empresa_id) return { success: false, error: 'Não autenticado' }

    const text = content?.trim()
    if (!text) return { success: false, error: 'Informe a mensagem inicial.' }

    const supabase = await createClient()
    const forceAssume = opts?.forceAssume === true

    const { data: card, error: cardErr } = await supabase
      .from('crm_cards')
      .select(
        `
        id, titulo, conversa_id, pipeline_id, lead_id, empresa_id, responsavel_id, cliente_nome,
        pipelines ( id, nome, departamento_id ),
        crm_leads ( id, nome, telefone, whatsapp )
      `,
      )
      .eq('id', cardId)
      .eq('empresa_id', me.empresa_id)
      .maybeSingle()

    if (cardErr || !card) return { success: false, error: 'Card não encontrado' }

    let lead = card.crm_leads as {
      id: string
      nome: string | null
      telefone: string | null
      whatsapp: string | null
    } | null

    if (!card.lead_id || !lead) {
      const leadIdInput = opts?.leadId?.trim()
      if (!leadIdInput) {
        return {
          success: false,
          error: 'Selecione um lead cadastrado na base. Contato novo exige cadastro prévio.',
        }
      }

      const { data: selectedLead, error: leadErr } = await supabase
        .from('crm_leads')
        .select('id, nome, telefone, whatsapp')
        .eq('id', leadIdInput)
        .eq('empresa_id', me.empresa_id)
        .maybeSingle()

      if (leadErr || !selectedLead) {
        return { success: false, error: 'Lead selecionado não encontrado.' }
      }

      await linkLeadToCard(supabase, cardId, me.empresa_id, selectedLead.id)
      if (!card.responsavel_id) {
        await supabase
          .from('crm_cards')
          .update({ responsavel_id: me.id })
          .eq('id', cardId)
          .eq('empresa_id', me.empresa_id)
      }
      lead = selectedLead
    }

    if (!lead) {
      return { success: false, error: 'Não foi possível vincular o lead ao card.' }
    }
    const externalId = normalizeWhatsAppPhone(lead.telefone || lead.whatsapp || '')
    if (!externalId) {
      return { success: false, error: 'Lead sem telefone/WhatsApp válido.' }
    }

    const { data: canal } = await supabase
      .from('crm_canais')
      .select('*')
      .eq('empresa_id', me.empresa_id)
      .eq('tipo', 'whatsapp')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!canal) {
      return { success: false, error: 'Nenhum canal WhatsApp configurado para a empresa.' }
    }

    const pipeline = card.pipelines as {
      id: string
      nome: string
      departamento_id: string | null
    } | null
    const departamentoId = pipeline?.departamento_id ?? null
    let departamentoNome: string | null = pipeline?.nome ?? null
    if (departamentoId) {
      const { data: dep } = await supabase
        .from('departamentos')
        .select('nome')
        .eq('id', departamentoId)
        .maybeSingle()
      if (dep?.nome) departamentoNome = dep.nome
    }

    if (isDeptSessionsEnabled()) {
      const speaker = await ActiveSpeakerService.get(
        supabase,
        me.empresa_id,
        canal.id,
        externalId,
      )
      if (speaker?.active_sessao_id) {
        const openThread = await ChatThreadService.getOpenByCard(supabase, cardId)
        const sameThread =
          openThread?.id === speaker.active_sessao_id ||
          card.conversa_id === speaker.active_sessao_id

        if (!sameThread && !forceAssume) {
          let activeDepartamentoNome: string | null = null
          if (speaker.active_departamento_id) {
            const { data: dep } = await supabase
              .from('departamentos')
              .select('nome')
              .eq('id', speaker.active_departamento_id)
              .maybeSingle()
            activeDepartamentoNome = dep?.nome ?? null
          }
          if (!activeDepartamentoNome) {
            const activeThread = await ChatThreadService.getById(
              supabase,
              speaker.active_sessao_id,
            )
            if (activeThread?.pipeline_id) {
              const { data: p } = await supabase
                .from('pipelines')
                .select('nome')
                .eq('id', activeThread.pipeline_id)
                .maybeSingle()
              activeDepartamentoNome = p?.nome ?? null
            }
          }
          return {
            success: false,
            needsAssume: true,
            error:
              'Outro departamento está conduzindo o atendimento neste número. Confirme para assumir.',
            activeDepartamentoNome,
            activeSessaoId: speaker.active_sessao_id,
          }
        }
      }
    }

    let sessaoId = card.conversa_id as string | null
    let createdThread = false

    if (isDeptSessionsEnabled()) {
      const { thread, created } = await ChatThreadService.ensureThreadForCard(supabase, {
        empresaId: me.empresa_id,
        canalId: canal.id,
        externalId,
        leadId: lead.id,
        cardId: card.id,
        pipelineId: card.pipeline_id,
        departamentoId,
        forceNewIfSharedPhone: true,
      })
      sessaoId = thread.id
      createdThread = created
    } else if (!sessaoId) {
      // Legado: cria sessão na primeira mensagem
      sessaoId = null
    }

    const provider = new EvolutionProvider()
    const config = buildEvolutionProviderConfig({
      provider_id: canal.provider_id,
      provider_token: canal.provider_token,
      settings: canal.settings as Record<string, unknown> | null,
    })

    // Grava histórico primeiro (cria sessao se legado)
    const historicoId = await ConversaHistoricoService.appendMessage(
      {
        empresa_id: me.empresa_id,
        canal_id: canal.id,
        external_id: externalId,
        lead_id: lead.id,
        role: 'assistant',
        content: text,
        direcao: 'outbound',
        status: 'human',
        last_human_interaction: new Date().toISOString(),
        atribuido_a_id: me.id,
        metadata: {
          sent_by: me.id,
          status: 'sent_manual',
          started_from_card: true,
          departamento_id: departamentoId,
        },
        sessao_id: sessaoId ?? undefined,
      },
      supabase,
    )

    if (!historicoId) {
      return { success: false, error: 'Falha ao gravar sessão de conversa.' }
    }
    sessaoId = historicoId

    await supabase
      .from('crm_cards')
      .update({
        conversa_id: sessaoId,
        responsavel_id: card.responsavel_id || me.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cardId)
      .eq('empresa_id', me.empresa_id)

    if (isDeptSessionsEnabled()) {
      await ChatThreadService.syncThreadFromAppend(supabase, {
        sessaoId,
        empresaId: me.empresa_id,
        canalId: canal.id,
        externalId,
        leadId: lead.id,
        status: 'human',
        cardId: card.id,
        departamentoId,
        pipelineId: card.pipeline_id,
      })
      await ActiveSpeakerService.activate(supabase, {
        empresaId: me.empresa_id,
        canalId: canal.id,
        externalId,
        sessaoId,
        departamentoId,
        activatedBy: me.id,
        reason: forceAssume ? 'transfer' : 'outbound',
      })
    }

    await supabase.from('crm_interacoes').insert({
      empresa_id: me.empresa_id,
      conversa_id: sessaoId,
      lead_id: lead.id,
      user_id: me.id,
      contact_phone: externalId,
      contact_name: lead.nome || 'Cliente WhatsApp',
      content: text,
      role: 'assistant',
      metadata: {
        sent_by: me.id,
        status: 'pending_send',
        started_from_card: true,
        departamento: departamentoNome,
      },
    })

    const senderLabel = me.nome_completo?.trim() || WHATSAPP_SENDER_LABELS.attendantFallback
    const result = await provider.sendAttendantMessage(externalId, senderLabel, text, config)

    if (!result.success) {
      return {
        success: false,
        error:
          'Sessão criada, mas falhou o envio WhatsApp: ' +
          JSON.stringify(result.error ?? 'erro desconhecido'),
      }
    }

    revalidatePath('/cockpit/crm/chat')
    revalidatePath(`/cockpit/crm/funis/${card.pipeline_id}`)

    return {
      success: true,
      sessaoId,
      assumed: forceAssume,
      createdThread,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao iniciar conversa'
    console.error('[startOmniConversation]', error)
    return { success: false, error: message }
  }
}

/** Estado do falante ativo para UI do card. */
export type OmniLeadOption = {
  id: string
  nome: string | null
  telefone: string | null
  whatsapp: string | null
}

/** Busca leads da empresa para vincular ao card antes de iniciar WhatsApp. */
export async function searchLeadsForOmni(query: string) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { error: 'Não autenticado', data: [] as OmniLeadOption[] }

  const q = query.trim()
  if (q.length < 2) return { data: [] as OmniLeadOption[] }

  const safe = q.replace(/[%_]/g, '')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('crm_leads')
    .select('id, nome, telefone, whatsapp')
    .eq('empresa_id', me.empresa_id)
    .or(
      `nome.ilike.%${safe}%,telefone.ilike.%${safe}%,whatsapp.ilike.%${safe}%,email.ilike.%${safe}%`,
    )
    .order('nome', { ascending: true })
    .limit(15)

  if (error) return { error: error.message, data: [] as OmniLeadOption[] }
  return { data: (data ?? []) as OmniLeadOption[] }
}

export async function getActiveSpeakerForCard(cardId: string) {
  const me = await getMyProfile()
  if (!me?.empresa_id) return { enabled: false }

  if (!isDeptSessionsEnabled()) {
    return { enabled: false }
  }

  const supabase = await createClient()
  const { data: card } = await supabase
    .from('crm_cards')
    .select('id, lead_id, conversa_id, cliente_nome, titulo, crm_leads(telefone, whatsapp)')
    .eq('id', cardId)
    .eq('empresa_id', me.empresa_id)
    .maybeSingle()

  const hasLead = Boolean(card?.lead_id && card?.crm_leads)
  const lead = card?.crm_leads as { telefone: string | null; whatsapp: string | null } | null
  const externalFromLead = lead
    ? normalizeWhatsAppPhone(lead.telefone || lead.whatsapp || '')
    : ''

  if (!hasLead || !externalFromLead) {
    return {
      enabled: true,
      hasLead: false,
      hasPhone: false,
      clienteNome: (card?.cliente_nome as string | null) || card?.titulo || null,
    }
  }

  const leadRow = card!.crm_leads as { telefone: string | null; whatsapp: string | null }
  const externalId = normalizeWhatsAppPhone(leadRow.telefone || leadRow.whatsapp || '')
  if (!externalId) {
    return {
      enabled: true,
      hasLead: true,
      hasPhone: false,
      clienteNome: (card.cliente_nome as string | null) || card.titulo || null,
    }
  }

  const { data: canal } = await supabase
    .from('crm_canais')
    .select('id')
    .eq('empresa_id', me.empresa_id)
    .eq('tipo', 'whatsapp')
    .limit(1)
    .maybeSingle()

  if (!canal) {
    return { enabled: true, hasLead: true, hasPhone: true, hasCanal: false }
  }

  const speaker = await ActiveSpeakerService.get(supabase, me.empresa_id, canal.id, externalId)
  const thread = await ChatThreadService.getOpenByCard(supabase, cardId)

  let activeDepartamentoNome: string | null = null
  if (speaker?.active_departamento_id) {
    const { data: dep } = await supabase
      .from('departamentos')
      .select('nome')
      .eq('id', speaker.active_departamento_id)
      .maybeSingle()
    activeDepartamentoNome = dep?.nome ?? null
  }

  const isActiveHere =
    !!speaker &&
    (speaker.active_sessao_id === thread?.id || speaker.active_sessao_id === card.conversa_id)

  return {
    enabled: true,
    hasLead: true,
    hasPhone: true,
    hasCanal: true,
    sessaoId: thread?.id ?? card.conversa_id,
    isActiveSpeaker: isActiveHere,
    activeSessaoId: speaker?.active_sessao_id ?? null,
    activeDepartamentoNome,
  }
}
