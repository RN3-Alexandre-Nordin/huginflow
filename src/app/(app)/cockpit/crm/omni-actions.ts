'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  asOmniMeta,
  isOmniMessageDeleted,
  markOmniMetadataDeleted,
} from '@/lib/omnichannel/omni-message-deleted'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { EvolutionProvider } from '@/lib/omnichannel/providers/EvolutionProvider'
import { buildEvolutionProviderConfig } from '@/lib/omnichannel/evolution-config'
import { SessionPersistenceService } from '@/lib/omnichannel/SessionPersistenceService'
import { normalizeWhatsAppPhone } from '@/lib/omnichannel/phone'
import { WHATSAPP_SENDER_LABELS } from '@/lib/omnichannel/whatsapp-outbound'
import { isDeptSessionsEnabled } from '@/lib/omnichannel/dept-sessions-constants'
import { DOCUMENT_MAX_BYTES } from '@/lib/omnichannel/document-constants'
import { CardAttachmentService } from '@/lib/omnichannel/services/CardAttachmentService'
import { canAccessOmniSession } from '@/lib/omnichannel/OmniSessionAccess'
import { linkLeadToCard } from '@/lib/crm/resolveLead'
import { canConsultCard } from '@/lib/crm/cardConsultaAccess'
import { getUserDepartamentoIds } from '@/lib/crm/userDepartamentos'
import {
  ActiveSpeakerService,
  ChatThreadService,
} from '@/lib/omnichannel/ChatThreadService'
import { revalidatePath } from 'next/cache'

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

async function loadAuthorizedSessionContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: NonNullable<Awaited<ReturnType<typeof getMyProfile>>>,
  sessaoId: string,
) {
  const empresaId = me.empresa_id
  if (!empresaId) throw new Error('Empresa do usuário não identificada')

  const { data: conversa, error } = await supabase
    .from('crm_conversas')
    .select('id, empresa_id, canal_id, lead_id, external_id, atribuido_a_id, status')
    .eq('sessao_id', sessaoId)
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !conversa) throw new Error('Sessão não encontrada')
  if (!(await canAccessOmniSession(supabase, me, sessaoId, conversa))) {
    throw new Error('Sem permissão para esta conversa')
  }
  if (!conversa.canal_id) throw new Error('Canal de comunicação não configurado')
  if (!conversa.lead_id) throw new Error('Lead não identificado na conversa')

  // Credenciais do provedor ficam apenas no servidor. A autorização acima usa
  // a sessão do usuário; o admin é usado somente após tenant + departamento.
  const admin = createAdminClient()
  const [{ data: canal }, { data: lead }] = await Promise.all([
    admin
      .from('crm_canais')
      .select('id, empresa_id, provider_id, provider_token, settings')
      .eq('id', conversa.canal_id)
      .eq('empresa_id', empresaId)
      .maybeSingle(),
    admin
      .from('crm_leads')
      .select('id, empresa_id, nome, telefone, whatsapp')
      .eq('id', conversa.lead_id)
      .eq('empresa_id', empresaId)
      .maybeSingle(),
  ])

  if (!canal) throw new Error('Canal de comunicação não configurado')
  if (!lead) throw new Error('Lead não identificado na conversa')
  return { empresaId, conversa, canal, lead, validationClient: admin }
}

async function persistWhatsAppId(input: {
  supabase: Awaited<ReturnType<typeof createClient>>
  empresaId: string
  sessaoId: string
  interacaoId: string
  prevMeta: Record<string, unknown>
  providerMessageId: string
  content: string
}) {
  const nextMeta = {
    ...input.prevMeta,
    provider_message_id: input.providerMessageId,
    status: 'sent',
  }
  let writer = input.supabase
  try {
    writer = createAdminClient()
  } catch {
    writer = input.supabase
  }
  const { error: interacaoErr } = await writer
    .from('crm_interacoes')
    .update({ metadata: nextMeta })
    .eq('id', input.interacaoId)
    .eq('empresa_id', input.empresaId)
  if (interacaoErr) {
    console.error('[Omni] falha ao gravar provider_message_id em crm_interacoes', interacaoErr)
  }

  const { data: hist } = await input.supabase
    .from('crm_conversas')
    .select('id, metadata')
    .eq('sessao_id', input.sessaoId)
    .eq('empresa_id', input.empresaId)
    .eq('content', input.content)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (hist?.id) {
    const { error: histErr } = await input.supabase
      .from('crm_conversas')
      .update({
        metadata: {
          ...asOmniMeta(hist.metadata),
          provider_message_id: input.providerMessageId,
          status: 'sent',
        },
      })
      .eq('id', hist.id)
      .eq('empresa_id', input.empresaId)
    if (histErr) {
      console.error('[Omni] falha ao gravar provider_message_id em crm_conversas', histErr)
    }
  }
}

/** @param sessaoId ID estável do thread (crm_conversas.sessao_id) */
export async function sendOmniMessage(sessaoId: string, content: string) {
  try {
    const me = await getMyProfile()
    if (!me) throw new Error('Usuário não autenticado')

    const supabase = await createClient()
    const { empresaId, conversa, canal, lead, validationClient } =
      await loadAuthorizedSessionContext(supabase, me, sessaoId)
    const provider = new EvolutionProvider()

    const config = buildEvolutionProviderConfig({
      provider_id: canal.provider_id,
      provider_token: canal.provider_token,
      settings: canal.settings as Record<string, unknown> | null,
    })

    const externalId =
      normalizeWhatsAppPhone(conversa.external_id || lead.telefone || lead.whatsapp || '') || ''

    const persist = await SessionPersistenceService.persistMessage(
      supabase,
      {
        empresaId,
        canalId: conversa.canal_id,
        externalId: externalId || lead.telefone || 'unknown',
        leadId: lead.id,
        sessaoId,
        role: 'assistant',
        content,
        direcao: 'outbound',
        status: 'human',
        lastHumanInteraction: new Date().toISOString(),
        atribuidoAId: me.id,
        userId: me.id,
        contactPhone: lead.telefone,
        contactName: lead.nome || 'Cliente WhatsApp',
        metadata: {
          sent_by: me.id,
          status: 'sent_manual',
        },
        activateSpeaker: isDeptSessionsEnabled() && Boolean(externalId),
        activatedBy: me.id,
        speakerReason: 'outbound',
      },
      { validationClient },
    )

    if (!persist.success || !persist.interacaoId) {
      console.error('[Omni] ERRO NO INSERT:', persist.error)
      return { success: false, error: `Erro no Banco: ${persist.error}` }
    }

    const insertedMsg = {
      id: persist.interacaoId,
      created_at: new Date().toISOString(),
      metadata: { sent_by: me.id, status: 'sent_manual' } as Record<string, unknown>,
    }

    const recipient = externalId
    if (!recipient) {
      return { success: false, error: 'Telefone do lead não encontrado (external_id vazio).' }
    }

    const senderLabel = me.nome_completo?.trim() || WHATSAPP_SENDER_LABELS.attendantFallback
    const result = await provider.sendAttendantMessage(recipient, senderLabel, content, config)

    let waMessageId = result.messageId
    if (result.success && !waMessageId) {
      waMessageId =
        (await provider.findOutboundMessageId(
          recipient,
          content,
          config,
          insertedMsg.created_at,
        )) ?? undefined
    }

    if (result.success && waMessageId) {
      await persistWhatsAppId({
        supabase,
        empresaId: me.empresa_id!,
        sessaoId,
        interacaoId: insertedMsg.id,
        prevMeta: asOmniMeta(insertedMsg.metadata),
        providerMessageId: waMessageId,
        content,
      })
      return { success: true, messageId: waMessageId }
    }

    if (result.success && !waMessageId) {
      console.error('[Omni] WhatsApp enviou mas não retornou ID da mensagem')
      return {
        success: true,
        messageId: undefined,
        error: 'Enviado, mas sem ID do WhatsApp — apagar no celular pode falhar.',
      }
    }

    await supabase
      .from('crm_interacoes')
      .update({
        metadata: { ...insertedMsg.metadata, status: 'error', provider_error: result.error },
      })
      .eq('id', insertedMsg.id)
      .eq('empresa_id', empresaId)

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

type InteracaoMeta = Record<string, unknown>

function asMeta(value: unknown): InteracaoMeta {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as InteracaoMeta) }
    : {}
}

async function persistDeletedMetadata(input: {
  userClient: Awaited<ReturnType<typeof createClient>>
  empresaId: string
  sessaoId: string
  interacaoId?: string | null
  conversaRowId?: string | null
  providerMessageId: string | null
  originalContent: string
  nextMeta: InteracaoMeta
}): Promise<{ error?: string }> {
  let admin: ReturnType<typeof createAdminClient> | null = null
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error('[Omni] admin client indisponível para marcar deleted', err)
  }
  const clients = admin ? [admin, input.userClient] : [input.userClient]

  if (input.interacaoId) {
    let saved = false
    let lastError: string | null = null
    for (const client of clients) {
      const { data, error } = await client
        .from('crm_interacoes')
        .update({ metadata: input.nextMeta })
        .eq('id', input.interacaoId)
        .eq('empresa_id', input.empresaId)
        .select('id, metadata')
        .maybeSingle()
      if (error) {
        lastError = error.message
        continue
      }
      if (data?.id && isOmniMessageDeleted(data.metadata)) {
        saved = true
        break
      }
    }
    if (!saved) {
      return {
        error: lastError || 'Não foi possível marcar a mensagem como apagada no HuginFlow.',
      }
    }
  }

  const historicoClient = admin ?? input.userClient
  if (input.conversaRowId) {
    const { error } = await historicoClient
      .from('crm_conversas')
      .update({ metadata: input.nextMeta })
      .eq('id', input.conversaRowId)
      .eq('empresa_id', input.empresaId)
    if (error) console.error('[Omni] falha ao marcar deleted em crm_conversas', error)
  } else {
    let histQuery = historicoClient
      .from('crm_conversas')
      .update({ metadata: input.nextMeta })
      .eq('sessao_id', input.sessaoId)
      .eq('empresa_id', input.empresaId)
      .eq('content', input.originalContent)
    if (input.providerMessageId) {
      histQuery = histQuery.contains('metadata', {
        provider_message_id: input.providerMessageId,
      })
    }
    const { error } = await histQuery
    if (error) console.error('[Omni] falha ao marcar deleted no historico crm_conversas', error)
  }

  return {}
}

/**
 * Apaga no WhatsApp (delete for everyone) e marca a linha como deletada em metadata.
 * Sem alteração de schema — log formal fica para depois.
 */
export async function deleteOmniMessage(sessaoId: string, messageId: string) {
  try {
    const me = await getMyProfile()
    if (!me) return { success: false, error: 'Não autenticado' }

    const supabase = await createClient()
    const { empresaId, conversa, canal, lead } = await loadAuthorizedSessionContext(
      supabase,
      me,
      sessaoId,
    )
    const externalId = conversa.external_id

    const { data: interacao } = await supabase
      .from('crm_interacoes')
      .select('id, role, content, user_id, metadata, conversa_id, created_at')
      .eq('id', messageId)
      .eq('conversa_id', sessaoId)
      .eq('empresa_id', empresaId)
      .maybeSingle()

    const { data: conversaRow } = !interacao
      ? await supabase
          .from('crm_conversas')
          .select('id, role, content, atribuido_a_id, metadata, sessao_id, created_at')
          .eq('id', messageId)
          .eq('sessao_id', sessaoId)
          .eq('empresa_id', empresaId)
          .maybeSingle()
      : { data: null }

    const row = interacao ?? conversaRow
    if (!row) return { success: false, error: 'Mensagem não encontrada' }

    const meta = asMeta(row.metadata)
    if (isOmniMessageDeleted(meta)) {
      return { success: true }
    }

    const role = row.role as string
    if (role === 'user') {
      return { success: false, error: 'Não é possível apagar mensagem do cliente.' }
    }

    const authorId =
      ('user_id' in row ? row.user_id : null) ||
      (typeof meta.sent_by === 'string' ? meta.sent_by : null) ||
      ('atribuido_a_id' in row ? row.atribuido_a_id : null)

    const isOwn = authorId === me.id
    const canModerate = me.role_global !== 'operador'
    if (!isOwn && !canModerate) {
      return { success: false, error: 'Só é possível apagar mensagens enviadas por você.' }
    }

    const recipient =
      normalizeWhatsAppPhone(externalId || lead?.telefone || lead?.whatsapp || '') || ''
    if (!recipient) {
      return { success: false, error: 'Telefone do cliente não encontrado.' }
    }

    const provider = new EvolutionProvider()
    const config = buildEvolutionProviderConfig({
      provider_id: canal.provider_id,
      provider_token: canal.provider_token,
      settings: canal.settings as Record<string, unknown> | null,
    })

    let providerMessageId =
      typeof meta.provider_message_id === 'string' ? meta.provider_message_id : null

    if (!providerMessageId) {
      providerMessageId = await provider.findOutboundMessageId(
        recipient,
        row.content,
        config,
        'created_at' in row ? (row.created_at as string) : null,
      )
      if (providerMessageId && interacao) {
        await persistWhatsAppId({
          supabase,
          empresaId: empresaId!,
          sessaoId,
          interacaoId: interacao.id,
          prevMeta: meta,
          providerMessageId,
          content: row.content,
        })
      }
    }

    if (!providerMessageId) {
      return {
        success: false,
        error:
          'Não achamos o ID desta mensagem no WhatsApp. Envie de novo depois deste ajuste — mensagens antigas sem ID não podem ser apagadas no celular.',
      }
    }

    const wa = await provider.deleteMessageForEveryone(recipient, providerMessageId, config)
    const waAlreadyGone =
      !wa.success &&
      /not found|already|não encontr|nao encontr|404/i.test(JSON.stringify(wa.error ?? ''))
    if (!wa.success && !waAlreadyGone) {
      return {
        success: false,
        error:
          'O WhatsApp recusou apagar (janela expirada ou falha na Evolution). A mensagem permanece nos dois lados.',
      }
    }

    const nextMeta: InteracaoMeta = markOmniMetadataDeleted(meta, {
      provider_message_id: providerMessageId,
      deleted_at: new Date().toISOString(),
      deleted_by: me.id,
      original_content: row.content,
      whatsapp_deleted: true,
    })

    const marked = await persistDeletedMetadata({
      userClient: supabase,
      empresaId,
      sessaoId,
      interacaoId: interacao?.id ?? null,
      conversaRowId: conversaRow?.id ?? null,
      providerMessageId,
      originalContent: row.content,
      nextMeta,
    })
    if (marked.error) return { success: false, error: marked.error }

    revalidatePath('/cockpit/crm/chat')
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao apagar mensagem'
    console.error('[OmniActions] Erro ao apagar mensagem:', error)
    return { success: false, error: message }
  }
}

const MAX_OMNI_ATTACHMENT_BYTES = DOCUMENT_MAX_BYTES

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
      return {
        success: false,
        error: `Arquivo excede o limite de ${Math.round(MAX_OMNI_ATTACHMENT_BYTES / 1024 / 1024)} MB.`,
      }
    }

    const mimeType = file.type || 'application/octet-stream'
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      return {
        success: false,
        error: 'Formato não suportado. Envie PDF ou imagem (PNG, JPG, WEBP).',
      }
    }

    const supabase = await createClient()
    const { empresaId, conversa, canal, lead, validationClient } =
      await loadAuthorizedSessionContext(supabase, me, sessaoId)
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
    const fileBuffer = Buffer.from(arrayBuffer)
    const base64 = fileBuffer.toString('base64')
    const mediatype = resolveMediaType(mimeType)
    const displayContent = caption || `📎 ${file.name}`

    // Card aberto desta sessão (isolamento por conversa + tenant)
    let cardId: string | null = null
    const { data: cardBySessao } = await supabase
      .from('crm_cards')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('conversa_id', sessaoId)
      .eq('finalizado', false)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    cardId = cardBySessao?.id ?? null

    if (!cardId) {
      const { data: thread } = await supabase
        .from('crm_chat_threads')
        .select('card_id')
        .eq('id', sessaoId)
        .eq('empresa_id', empresaId)
        .maybeSingle()
      if (thread?.card_id) {
        const { data: openByThread } = await supabase
          .from('crm_cards')
          .select('id')
          .eq('id', thread.card_id)
          .eq('empresa_id', empresaId)
          .eq('finalizado', false)
          .maybeSingle()
        cardId = openByThread?.id ?? null
      }
    }

    const persistMedia = await SessionPersistenceService.persistMessage(
      supabase,
      {
        empresaId,
        canalId: conversa.canal_id,
        externalId,
        leadId: lead.id,
        sessaoId,
        cardId: cardId ?? undefined,
        role: 'assistant',
        content: displayContent,
        direcao: 'outbound',
        status: 'human',
        lastHumanInteraction: new Date().toISOString(),
        atribuidoAId: me.id,
        userId: me.id,
        contactPhone: lead.telefone,
        contactName: lead.nome || 'Cliente WhatsApp',
        metadata: {
          sent_by: me.id,
          status: 'pending_send',
          media_type: mediatype,
          file_name: file.name,
          mimetype: mimeType,
        },
        activateSpeaker: isDeptSessionsEnabled(),
        activatedBy: me.id,
        speakerReason: 'outbound',
      },
      { validationClient },
    )

    if (!persistMedia.success || !persistMedia.interacaoId) {
      return { success: false, error: `Erro no banco: ${persistMedia.error}` }
    }

    const insertedMsg = {
      id: persistMedia.interacaoId,
      created_at: new Date().toISOString(),
      metadata: {
        sent_by: me.id,
        status: 'pending_send',
        media_type: mediatype,
        file_name: file.name,
        mimetype: mimeType,
      } as Record<string, unknown>,
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
      let waMessageId = result.messageId
      if (!waMessageId) {
        waMessageId =
          (await provider.findOutboundMessageId(
            externalId,
            displayContent,
            config,
            insertedMsg.created_at,
          )) ?? undefined
      }
      if (waMessageId) {
        await persistWhatsAppId({
          supabase,
          empresaId,
          sessaoId,
          interacaoId: insertedMsg.id,
          prevMeta: asMeta(insertedMsg.metadata),
          providerMessageId: waMessageId,
          content: displayContent,
        })
      }

      // Anexa ao card (mesmo arquivo enviado ao cliente) — não bloqueia o envio WhatsApp
      if (cardId) {
        try {
          let attachClient = supabase
          try {
            attachClient = createAdminClient()
          } catch {
            attachClient = supabase
          }
          const attach = await CardAttachmentService.attachFromInbound(attachClient, {
            cardId,
            empresaId,
            buffer: fileBuffer,
            fileName: file.name,
            mimeType,
            providerMessageId: waMessageId || `omni-outbound:${insertedMsg.id}`,
            interacaoId: insertedMsg.id,
            source: 'whatsapp_outbound',
            uploadedBy: me.id,
          })
          if (!attach.ok) {
            console.error('[OmniActions] Anexo no card falhou:', attach.error)
          }
        } catch (attachErr) {
          console.error('[OmniActions] Anexo no card exception:', attachErr)
        }
      } else {
        console.warn(
          `[OmniActions] Sessão ${sessaoId} sem card aberto — arquivo enviado no WhatsApp sem gravar em crm_card_files`,
        )
      }

      revalidatePath('/cockpit/crm/chat')
      return { success: true, messageId: waMessageId }
    }

    await supabase
      .from('crm_interacoes')
      .update({
        metadata: { ...insertedMsg.metadata, status: 'error', provider_error: result.error },
      })
      .eq('id', insertedMsg.id)
      .eq('empresa_id', empresaId)

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

    let lead = firstRelation(card.crm_leads)

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

    const pipeline = firstRelation(card.pipelines)
    const departamentoId = pipeline?.departamento_id ?? null
    if (me.role_global === 'operador') {
      const userDeptIds = await getUserDepartamentoIds(supabase, me.id, me.grupo_id)
      let allowed = canConsultCard(me, userDeptIds, {
        responsavel_id: card.responsavel_id,
        departamento_id: departamentoId,
      })
      if (!allowed && me.grupo_id && card.pipeline_id) {
        const { data: pipelineAccess } = await supabase
          .from('pipeline_grupo_acesso')
          .select('pipeline_id')
          .eq('grupo_id', me.grupo_id)
          .eq('pipeline_id', card.pipeline_id)
          .maybeSingle()
        allowed = Boolean(pipelineAccess)
      }
      if (!allowed) return { success: false, error: 'Sem permissão para este card' }
    }

    const validationClient = createAdminClient()
    const { data: canal } = await validationClient
      .from('crm_canais')
      .select('id, empresa_id, provider_id, provider_token, settings')
      .eq('empresa_id', me.empresa_id)
      .eq('tipo', 'whatsapp')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!canal) {
      return { success: false, error: 'Nenhum canal WhatsApp configurado para a empresa.' }
    }

    let departamentoNome: string | null = pipeline?.nome ?? null
    if (departamentoId) {
      const { data: dep } = await supabase
        .from('departamentos')
        .select('nome')
        .eq('id', departamentoId)
        .eq('empresa_id', me.empresa_id)
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
              .eq('empresa_id', me.empresa_id)
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
                .eq('empresa_id', me.empresa_id)
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

    // Grava histórico + interação + thread via caminho único
    const startPersist = await SessionPersistenceService.persistMessage(
      supabase,
      {
        empresaId: me.empresa_id!,
        canalId: canal.id,
        externalId,
        leadId: lead.id,
        sessaoId: sessaoId ?? undefined,
        cardId: card.id,
        pipelineId: card.pipeline_id,
        departamentoId,
        role: 'assistant',
        content: text,
        direcao: 'outbound',
        status: 'human',
        lastHumanInteraction: new Date().toISOString(),
        atribuidoAId: me.id,
        userId: me.id,
        contactPhone: externalId,
        contactName: lead.nome || 'Cliente WhatsApp',
        metadata: {
          sent_by: me.id,
          status: 'pending_send',
          started_from_card: true,
          departamento: departamentoNome,
          departamento_id: departamentoId,
        },
        activateSpeaker: isDeptSessionsEnabled(),
        activatedBy: me.id,
        speakerReason: forceAssume ? 'transfer' : 'outbound',
      },
      { validationClient },
    )

    if (!startPersist.success || !startPersist.sessaoId) {
      return { success: false, error: startPersist.error || 'Falha ao gravar sessão de conversa.' }
    }
    sessaoId = startPersist.sessaoId

    await supabase
      .from('crm_cards')
      .update({
        conversa_id: sessaoId,
        responsavel_id: card.responsavel_id || me.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cardId)
      .eq('empresa_id', me.empresa_id)

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

    if (startPersist.interacaoId && result.messageId) {
      await persistWhatsAppId({
        supabase,
        empresaId: me.empresa_id!,
        sessaoId,
        interacaoId: startPersist.interacaoId,
        prevMeta: {
          sent_by: me.id,
          status: 'pending_send',
          started_from_card: true,
          departamento: departamentoNome,
        },
        providerMessageId: result.messageId,
        content: text,
      })
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

  if (!card) {
    return { enabled: true, hasLead: false, hasPhone: false }
  }

  const lead = firstRelation(card.crm_leads)
  const hasLead = Boolean(card.lead_id && lead)
  const externalFromLead = lead
    ? normalizeWhatsAppPhone(lead.telefone || lead.whatsapp || '')
    : ''

  if (!hasLead || !externalFromLead) {
    return {
      enabled: true,
      hasLead: false,
      hasPhone: false,
      clienteNome: (card.cliente_nome as string | null) || card.titulo || null,
    }
  }

  const leadRow = lead!
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
