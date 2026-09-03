'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { canAccessSimulador } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { GeminiChatService } from '@/lib/crm/GeminiChatService'
import { AUDIO_PLACEHOLDER } from '@/lib/omnichannel/audio-transcription-constants'
import type { TranscriptionMetadata } from '@/lib/omnichannel/services/AudioTranscriptionService'
import { AudioTranscriptionService } from '@/lib/omnichannel/services/AudioTranscriptionService'
import { SessionPersistenceService } from '@/lib/omnichannel/SessionPersistenceService'
import { TriageActionExecutor } from '@/lib/omnichannel/triage/TriageActionExecutor'
import {
  DEFAULT_OUT_OF_SCOPE_REPLY,
  evaluateMessageScope,
} from '@/lib/omnichannel/triage/scopeGate'
import { stripOutboundTags } from '@/lib/omnichannel/triage/parseTriageTags'
import {
  DOCUMENT_AUTO_REPLY_IN_HOURS,
  DOCUMENT_AUTO_REPLY_OUT_HOURS,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TOO_LARGE,
  ILLEGIBLE_DOCUMENT_OBSERVATION,
  inferCategoryFromHints,
} from '@/lib/omnichannel/document-constants'
import { DocumentProcessingService } from '@/lib/omnichannel/services/DocumentProcessingService'
import { DocumentCardEnsurer } from '@/lib/omnichannel/services/DocumentCardEnsurer'
import { CardDocumentMatcher } from '@/lib/omnichannel/triage/CardDocumentMatcher'
import { CardAttachmentService } from '@/lib/omnichannel/services/CardAttachmentService'
import { buildSystemFacts } from '@/lib/omnichannel/triage/systemFacts'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export type TriageDebug = {
  actions: string[]
  crmStatus?: string
  triage: Record<string, string | undefined> | null
  cardId: string | null
  responsavelId: string | null
  responsavelNome: string | null
  handover: boolean
  dentroHorario: boolean
  reasoning: string
  sessaoId: string | null
  /** Origem da mensagem no simulador */
  mediaKind?: 'text' | 'audio' | 'document'
  mediaOk?: boolean
  mediaDetail?: string
  documentCategoria?: string
  documentLegivel?: boolean
  attached?: boolean
}

type SimulatorChatResult =
  | {
      success: true
      response: string
      /** Resposta bruta com tags (debug) */
      responseRaw: string
      userContent: string
      transcriptionOk: boolean
      triage: TriageDebug
    }
  | { error: string }

async function resolveLeadId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetEmpresaId: string,
  cleanPhone: string,
  name: string,
): Promise<{ leadId: string } | { error: string }> {
  const { data: existingLead } = await supabase
    .from('crm_leads')
    .select('id, nome')
    .eq('telefone', cleanPhone)
    .eq('empresa_id', targetEmpresaId)
    .maybeSingle()

  if (existingLead) {
    return { leadId: existingLead.id }
  }

  const { data: newLead, error: leadError } = await supabase
    .from('crm_leads')
    .insert([
      {
        nome: name,
        telefone: cleanPhone,
        empresa_id: targetEmpresaId,
        canal_id: null,
      },
    ])
    .select('id')
    .single()

  if (leadError) return { error: 'Falha ao criar lead: ' + leadError.message }
  return { leadId: newLead.id }
}

/** Garante um canal placeholder da empresa para FK de crm_conversas (sem Evolution). */
async function ensureSimulatorCanal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('crm_canais')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('provider', 'simulator')
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data, error } = await supabase
    .from('crm_canais')
    .insert({
      empresa_id: empresaId,
      nome: 'Simulador (teste local)',
      tipo: 'whatsapp',
      provider: 'simulator',
      provider_id: `sim-${empresaId.slice(0, 8)}`,
      status: 'connected',
      ia_config: { enabled: true },
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    // Fallback: tenta qualquer canal da empresa
    const { data: anyCanal } = await supabase
      .from('crm_canais')
      .select('id')
      .eq('empresa_id', empresaId)
      .limit(1)
      .maybeSingle()
    if (anyCanal?.id) return anyCanal.id
    throw new Error(
      `Não foi possível criar canal do simulador: ${error?.message ?? 'erro desconhecido'}`,
    )
  }

  return data.id
}

async function runSimulatorExchange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetEmpresaId: string,
  cleanPhone: string,
  name: string,
  leadId: string,
  messageText: string,
  userContent: string,
  userMetadata?: Record<string, unknown>,
): Promise<SimulatorChatResult> {
  const canalId = await ensureSimulatorCanal(supabase, targetEmpresaId)

  const userPersist = await SessionPersistenceService.persistMessage(supabase, {
    empresaId: targetEmpresaId,
    canalId,
    externalId: cleanPhone,
    leadId,
    role: 'user',
    content: userContent,
    direcao: 'inbound',
    status: 'ai',
    contactPhone: cleanPhone,
    contactName: name,
    metadata: { ...(userMetadata ?? {}), provider: 'simulator' },
  })

  const sessaoId = userPersist.sessaoId ?? null
  if (!userPersist.success || !sessaoId) {
    return { error: userPersist.error || 'Não foi possível abrir a sessão de conversa.' }
  }

  const { data: openCard } = await supabase
    .from('crm_cards')
    .select('id')
    .eq('empresa_id', targetEmpresaId)
    .eq('lead_id', leadId)
    .eq('finalizado', false)
    .limit(1)
    .maybeSingle()

  const scope = await evaluateMessageScope(supabase, {
    empresaId: targetEmpresaId,
    leadId,
    message: messageText,
    hasOpenCard: Boolean(openCard?.id),
  })

  if (!scope.inScope) {
    const textToSend = scope.reply || DEFAULT_OUT_OF_SCOPE_REPLY
    await SessionPersistenceService.persistMessage(supabase, {
      empresaId: targetEmpresaId,
      canalId,
      externalId: cleanPhone,
      leadId,
      sessaoId,
      role: 'system',
      content: '(Escopo IA)',
      direcao: 'outbound',
      contactPhone: cleanPhone,
      contactName: name,
      logSistema: `OUT_OF_SCOPE (gate): ${scope.reason}`,
      metadata: {
        type: 'ai_scope_reasoning',
        action: 'OUT_OF_SCOPE',
        crm_status: 'FORA_ESCOPO',
        provider: 'simulator',
      },
    })

    await SessionPersistenceService.persistMessage(supabase, {
      empresaId: targetEmpresaId,
      canalId,
      externalId: cleanPhone,
      leadId,
      sessaoId,
      role: 'assistant',
      content: textToSend,
      direcao: 'outbound',
      status: 'ai',
      isAi: true,
      contactPhone: cleanPhone,
      contactName: name,
      metadata: {
        provider: 'simulator',
        is_ai: true,
        crm_status: 'FORA_ESCOPO',
        triage_actions: ['OUT_OF_SCOPE'],
        scope_gate: true,
      },
    })

    revalidatePath('/cockpit/crm/simulador')
    revalidatePath('/cockpit/crm/chat')
    revalidatePath('/cockpit')

    return {
      success: true,
      response: textToSend,
      responseRaw: textToSend,
      userContent,
      transcriptionOk: true,
      triage: {
        actions: ['OUT_OF_SCOPE'],
        crmStatus: 'FORA_ESCOPO',
        triage: null,
        cardId: null,
        responsavelId: null,
        responsavelNome: null,
        handover: false,
        dentroHorario: true,
        reasoning: scope.reason,
        sessaoId,
        mediaKind: (userMetadata?.media_type as TriageDebug['mediaKind']) || 'text',
        mediaOk: true,
        mediaDetail:
          typeof userMetadata?.media_detail === 'string' ? userMetadata.media_detail : undefined,
      },
    }
  }

  const aiResult = await GeminiChatService.generateReply(supabase, {
    empresaId: targetEmpresaId,
    leadId,
    conversaId: sessaoId,
    contactPhone: cleanPhone,
    contactName: name,
    message: messageText,
  })

  if (!aiResult.success) {
    return { error: aiResult.error }
  }

  let responseForWhatsApp = aiResult.responseForWhatsApp
  let crmStatus = aiResult.crmStatus
  if (aiResult.tags.actions.includes('OUT_OF_SCOPE')) {
    const cleaned = stripOutboundTags(responseForWhatsApp || aiResult.response)
    responseForWhatsApp = cleaned.length >= 12 ? cleaned : DEFAULT_OUT_OF_SCOPE_REPLY
    crmStatus = crmStatus ?? 'FORA_ESCOPO'
  }

  const triageResult = await TriageActionExecutor.execute(supabase, {
    empresaId: targetEmpresaId,
    leadId,
    sessaoId,
    canalId,
    contactPhone: cleanPhone,
    contactName: name,
    facts: aiResult.facts,
    tags: aiResult.tags,
  })

  let responsavelNome: string | null = null
  if (triageResult.responsavelId) {
    const { data: resp } = await supabase
      .from('usuarios')
      .select('nome_completo')
      .eq('id', triageResult.responsavelId)
      .maybeSingle()
    responsavelNome = resp?.nome_completo ?? null
  }

  await SessionPersistenceService.persistMessage(supabase, {
    empresaId: targetEmpresaId,
    canalId,
    externalId: cleanPhone,
    leadId,
    sessaoId,
    cardId: triageResult.cardId,
    role: 'assistant',
    content: responseForWhatsApp || aiResult.response,
    direcao: 'outbound',
    status: triageResult.handover ? 'human' : 'ai',
    atribuidoAId: triageResult.responsavelId,
    isAi: true,
    contactPhone: cleanPhone,
    contactName: name,
    metadata: {
      provider: 'simulator',
      is_ai: true,
      crm_status: crmStatus ?? null,
      triage_actions: triageResult.executed,
      card_id: triageResult.cardId,
      responsavel_id: triageResult.responsavelId,
      triage: aiResult.tags.triage ?? null,
    },
  })

  if (triageResult.handover) {
    await supabase
      .from('crm_conversas')
      .update({
        status: 'human',
        atribuido_a_id: triageResult.responsavelId,
        updated_at: new Date().toISOString(),
      })
      .eq('sessao_id', sessaoId)
      .eq('empresa_id', targetEmpresaId)
  }

  revalidatePath('/cockpit/crm/simulador')
  revalidatePath('/cockpit/crm/chat')
  revalidatePath('/cockpit')

  return {
    success: true,
    response: responseForWhatsApp || aiResult.response,
    responseRaw: aiResult.response,
    userContent,
    transcriptionOk: true,
    triage: {
      actions: triageResult.executed,
      crmStatus,
      triage: aiResult.tags.triage
        ? (aiResult.tags.triage as Record<string, string | undefined>)
        : null,
      cardId: triageResult.cardId,
      responsavelId: triageResult.responsavelId,
      responsavelNome,
      handover: triageResult.handover,
      dentroHorario: aiResult.facts.dentro_horario,
      reasoning: triageResult.reasoning,
      sessaoId,
      mediaKind: (userMetadata?.media_type as TriageDebug['mediaKind']) || 'text',
      mediaOk: true,
      mediaDetail: typeof userMetadata?.media_detail === 'string' ? userMetadata.media_detail : undefined,
    },
  }
}

export async function processChat(phone: string, name: string, message: string) {
  const me = await getMyProfile()
  if (!canAccessSimulador(me)) {
    return { error: 'Sem permissão para utilizar o simulador.' }
  }

  const supabase = await createClient()
  const targetEmpresaId = me?.empresa_id

  if (!targetEmpresaId) return { error: 'Empresa não identificada para carregar configurações de IA.' }

  const cleanPhone = phone.replace(/\D/g, '')
  const leadResult = await resolveLeadId(supabase, targetEmpresaId, cleanPhone, name)
  if ('error' in leadResult) return leadResult

  return runSimulatorExchange(
    supabase,
    targetEmpresaId,
    cleanPhone,
    name,
    leadResult.leadId,
    message,
    message,
    { provider: 'simulator' },
  )
}

export async function processChatAudio(formData: FormData) {
  const me = await getMyProfile()
  if (!canAccessSimulador(me)) {
    return { error: 'Sem permissão para utilizar o simulador.' }
  }

  const supabase = await createClient()
  const targetEmpresaId = me?.empresa_id
  if (!targetEmpresaId) {
    return { error: 'Empresa não identificada para carregar configurações de IA.' }
  }

  const phone = String(formData.get('phone') ?? '')
  const name = String(formData.get('name') ?? 'Cliente Teste')
  const audio = formData.get('audio')

  if (!(audio instanceof File) || audio.size === 0) {
    return { error: 'Selecione um arquivo de áudio válido.' }
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return { error: 'Áudio muito grande (máximo 25MB).' }
  }

  const cleanPhone = phone.replace(/\D/g, '')
  const leadResult = await resolveLeadId(supabase, targetEmpresaId, cleanPhone, name)
  if ('error' in leadResult) return leadResult

  const arrayBuffer = await audio.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const mimeType = audio.type || 'audio/webm'
  const filename = audio.name || 'simulator-audio.webm'

  const transcription = await AudioTranscriptionService.transcribeUploadedBuffer(
    targetEmpresaId,
    buffer,
    mimeType,
    filename,
    supabase,
    { ptt: true },
  )

  console.log(`[Simulador] Transcrição áudio: ${transcription.reasoning}`)

  const messageText = transcription.ok ? transcription.text : transcription.fallbackText
  const userContent = transcription.ok ? `🎤 ${transcription.text}` : transcription.fallbackText

  const metadata: TranscriptionMetadata & {
    provider: string
    media_type: string
    media_detail: string
  } = {
    ...transcription.metadata,
    provider: 'simulator',
    media_type: 'audio',
    media_detail: transcription.reasoning,
  }

  const result = await runSimulatorExchange(
    supabase,
    targetEmpresaId,
    cleanPhone,
    name,
    leadResult.leadId,
    messageText,
    userContent,
    metadata,
  )

  if ('error' in result) return result

  return {
    ...result,
    transcriptionOk: transcription.ok,
    placeholder: AUDIO_PLACEHOLDER,
    triage: {
      ...result.triage,
      mediaKind: 'audio' as const,
      mediaOk: transcription.ok,
      mediaDetail: transcription.reasoning,
    },
  }
}

/**
 * Upload de PDF/imagem no simulador — mesmo pipeline de documentos (OCR + classificar + card/anexo),
 * sem Evolution.
 */
export async function processChatDocument(formData: FormData) {
  const me = await getMyProfile()
  if (!canAccessSimulador(me)) {
    return { error: 'Sem permissão para utilizar o simulador.' }
  }

  const supabase = await createClient()
  const targetEmpresaId = me?.empresa_id
  if (!targetEmpresaId) {
    return { error: 'Empresa não identificada para carregar configurações de IA.' }
  }

  const phone = String(formData.get('phone') ?? '')
  const name = String(formData.get('name') ?? 'Cliente Teste')
  const caption = String(formData.get('caption') ?? '').trim()
  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um PDF ou imagem válida.' }
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return { error: `Arquivo excede o limite de ${Math.round(DOCUMENT_MAX_BYTES / 1024 / 1024)} MB.` }
  }

  const cleanPhone = phone.replace(/\D/g, '')
  const leadResult = await resolveLeadId(supabase, targetEmpresaId, cleanPhone, name)
  if ('error' in leadResult) return leadResult

  const canalId = await ensureSimulatorCanal(supabase, targetEmpresaId)
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const mimeType = file.type || 'application/octet-stream'
  const fileName = file.name || 'documento.pdf'

  const docResult = await DocumentProcessingService.processUploadedBuffer(
    targetEmpresaId,
    buffer,
    mimeType,
    fileName,
    supabase,
    { caption: caption || undefined },
  )

  console.log(`[Simulador] Documento: ${docResult.reasoning}`)

  const facts = await buildSystemFacts(supabase, targetEmpresaId, leadResult.leadId)
  const autoReply = facts.dentro_horario
    ? DOCUMENT_AUTO_REPLY_IN_HOURS
    : DOCUMENT_AUTO_REPLY_OUT_HOURS

  const userContent = docResult.ok
    ? docResult.displayContent
    : docResult.tooLarge
      ? DOCUMENT_TOO_LARGE
      : docResult.fallbackContent

  const userDocPersist = await SessionPersistenceService.persistMessage(supabase, {
    empresaId: targetEmpresaId,
    canalId,
    externalId: cleanPhone,
    leadId: leadResult.leadId,
    role: 'user',
    content: userContent,
    direcao: 'inbound',
    status: 'ai',
    contactPhone: cleanPhone,
    contactName: name,
    metadata: {
      provider: 'simulator',
      ...(docResult.ok ? docResult.metadata : docResult.metadata),
    },
  })

  const sessaoId = userDocPersist.sessaoId ?? null
  if (!userDocPersist.success || !sessaoId) {
    return { error: userDocPersist.error || 'Não foi possível abrir a sessão de conversa.' }
  }

  const reasons: string[] = [docResult.reasoning]
  let cardId: string | null = null
  let responsavelId: string | null = null
  let handover = false
  let attached = false
  let triageActions: string[] = []
  let documentCategoria = inferCategoryFromHints(fileName, caption) ?? 'documento_nao_identificado'
  let documentLegivel = false
  let documentResumo = fileName

  if (!docResult.ok) {
    documentCategoria =
      inferCategoryFromHints(fileName, caption) ?? 'documento_nao_identificado'
    const ensured = await DocumentCardEnsurer.ensure(supabase, {
      empresaId: targetEmpresaId,
      leadId: leadResult.leadId,
      sessaoId,
      canalId,
      contactPhone: cleanPhone,
      contactName: name,
      facts,
      categoria: documentCategoria,
      resumo: `Documento (${fileName}) — processamento falhou: ${docResult.error}`,
      observacao: ILLEGIBLE_DOCUMENT_OBSERVATION,
      origem: 'simulator_document_failed',
      ilegivel: true,
    })
    cardId = ensured.cardId
    responsavelId = ensured.responsavelId
    handover = ensured.handover || Boolean(ensured.cardId)
    triageActions = ensured.created ? ['CREATE_CARD', 'HANDOVER'] : ['HANDOVER']
    reasons.push(ensured.reasoning)

    if (cardId && docResult.buffer && !docResult.tooLarge) {
      const attach = await CardAttachmentService.attachFromInbound(supabase, {
        cardId,
        empresaId: targetEmpresaId,
        buffer: docResult.buffer,
        fileName: docResult.fileName ?? fileName,
        mimeType: docResult.mimeType ?? mimeType,
        providerMessageId: `sim-doc-${Date.now()}`,
      })
      attached = attach.ok
      reasons.push(attach.ok ? 'Documento anexado (fallback).' : `Falha anexo: ${attach.error}`)
    }

    const reply = docResult.tooLarge ? DOCUMENT_TOO_LARGE : autoReply
    await persistSimulatorAssistant(
      supabase,
      targetEmpresaId,
      canalId,
      cleanPhone,
      name,
      leadResult.leadId,
      sessaoId,
      reply,
      cardId,
      responsavelId,
      true,
      reasons.join(' '),
    )

    revalidatePath('/cockpit/crm/simulador')
    revalidatePath('/cockpit/crm/chat')
    revalidatePath('/cockpit')

    return {
      success: true as const,
      response: reply,
      responseRaw: reply,
      userContent,
      transcriptionOk: false,
      triage: {
        actions: triageActions,
        triage: { categoria: documentCategoria, resumo: documentResumo },
        cardId,
        responsavelId,
        responsavelNome: null,
        handover: true,
        dentroHorario: facts.dentro_horario,
        reasoning: reasons.join(' '),
        sessaoId,
        mediaKind: 'document' as const,
        mediaOk: false,
        mediaDetail: docResult.reasoning,
        documentCategoria,
        documentLegivel: false,
        attached,
      },
    }
  }

  const { classification } = docResult
  documentCategoria = classification.categoria
  documentLegivel = classification.legivel
  documentResumo = classification.resumo

  const match = await CardDocumentMatcher.findMatchingCard(supabase, {
    empresaId: targetEmpresaId,
    leadId: leadResult.leadId,
    sessaoId,
    categoria: classification.categoria,
  })

  if (match) {
    cardId = match.cardId
    reasons.push(match.matchReason)
    const attach = await CardAttachmentService.attachFromInbound(supabase, {
      cardId,
      empresaId: targetEmpresaId,
      buffer: docResult.buffer,
      fileName: docResult.fileName,
      mimeType: docResult.mimeType,
      providerMessageId: `sim-doc-${Date.now()}`,
    })
    attached = attach.ok
    reasons.push(
      attach.ok
        ? attach.deduplicated
          ? 'Anexo já existia.'
          : 'Anexo salvo no card.'
        : `Falha anexo: ${attach.error}`,
    )

    const { data: cardRow } = await supabase
      .from('crm_cards')
      .select('responsavel_id')
      .eq('id', cardId)
      .single()
    responsavelId = cardRow?.responsavel_id ?? null
    handover = true
    triageActions = ['ATTACH_EXISTING', 'HANDOVER']

    await supabase
      .from('crm_conversas')
      .update({
        status: 'human',
        atribuido_a_id: responsavelId,
        updated_at: new Date().toISOString(),
      })
      .eq('sessao_id', sessaoId)
      .eq('empresa_id', targetEmpresaId)
  } else {
    const ensured = await DocumentCardEnsurer.ensure(supabase, {
      empresaId: targetEmpresaId,
      leadId: leadResult.leadId,
      sessaoId,
      canalId,
      contactPhone: cleanPhone,
      contactName: name,
      facts,
      categoria: classification.categoria,
      resumo: classification.resumo,
      observacao:
        !classification.legivel || classification.categoria === 'documento_nao_identificado'
          ? ILLEGIBLE_DOCUMENT_OBSERVATION
          : classification.resumo,
      origem: 'simulator_document',
      ilegivel: !classification.legivel,
    })
    cardId = ensured.cardId
    responsavelId = ensured.responsavelId
    handover = ensured.handover
    triageActions = ensured.created ? ['CREATE_CARD', 'HANDOVER'] : ['HANDOVER']
    reasons.push(ensured.reasoning)

    if (cardId) {
      const attach = await CardAttachmentService.attachFromInbound(supabase, {
        cardId,
        empresaId: targetEmpresaId,
        buffer: docResult.buffer,
        fileName: docResult.fileName,
        mimeType: docResult.mimeType,
        providerMessageId: `sim-doc-${Date.now()}`,
      })
      attached = attach.ok
      reasons.push(attach.ok ? 'Documento anexado ao card.' : `Falha anexo: ${attach.error}`)
    }
  }

  if (!cardId) {
    const ensured = await DocumentCardEnsurer.ensure(supabase, {
      empresaId: targetEmpresaId,
      leadId: leadResult.leadId,
      sessaoId,
      canalId,
      contactPhone: cleanPhone,
      contactName: name,
      facts,
      categoria: 'documento_nao_identificado',
      resumo: `Documento ${fileName} — encaminhamento de emergência`,
      observacao: ILLEGIBLE_DOCUMENT_OBSERVATION,
      origem: 'simulator_document_emergency',
      ilegivel: true,
    })
    cardId = ensured.cardId
    responsavelId = ensured.responsavelId
    handover = ensured.handover || Boolean(ensured.cardId)
    reasons.push(`Emergência: ${ensured.reasoning}`)
    triageActions = ['CREATE_CARD', 'HANDOVER']
    if (cardId) {
      const attach = await CardAttachmentService.attachFromInbound(supabase, {
        cardId,
        empresaId: targetEmpresaId,
        buffer: docResult.buffer,
        fileName: docResult.fileName,
        mimeType: docResult.mimeType,
        providerMessageId: `sim-doc-${Date.now()}`,
      })
      attached = attach.ok
    }
  }

  let responsavelNome: string | null = null
  if (responsavelId) {
    const { data: resp } = await supabase
      .from('usuarios')
      .select('nome_completo')
      .eq('id', responsavelId)
      .maybeSingle()
    responsavelNome = resp?.nome_completo ?? null
  }

  await SessionPersistenceService.persistMessage(supabase, {
    empresaId: targetEmpresaId,
    canalId,
    externalId: cleanPhone,
    leadId: leadResult.leadId,
    sessaoId,
    cardId,
    role: 'system',
    content: '(Documento simulador)',
    direcao: 'outbound',
    contactPhone: cleanPhone,
    contactName: name,
    logSistema: reasons.join(' '),
    metadata: {
      type: 'simulator_document_reasoning',
      card_id: cardId,
      categoria: documentCategoria,
    },
  })

  await persistSimulatorAssistant(
    supabase,
    targetEmpresaId,
    canalId,
    cleanPhone,
    name,
    leadResult.leadId,
    sessaoId,
    autoReply,
    cardId,
    responsavelId,
    handover || Boolean(cardId),
    reasons.join(' '),
  )

  revalidatePath('/cockpit/crm/simulador')
  revalidatePath('/cockpit/crm/chat')
  revalidatePath('/cockpit')

  return {
    success: true as const,
    response: autoReply,
    responseRaw: autoReply,
    userContent,
    transcriptionOk: documentLegivel,
    triage: {
      actions: triageActions,
      triage: {
        categoria: documentCategoria,
        resumo: documentResumo,
      },
      cardId,
      responsavelId,
      responsavelNome,
      handover: handover || Boolean(cardId),
      dentroHorario: facts.dentro_horario,
      reasoning: reasons.join(' '),
      sessaoId,
      mediaKind: 'document' as const,
      mediaOk: true,
      mediaDetail: docResult.reasoning,
      documentCategoria,
      documentLegivel,
      attached,
    },
  }
}

async function persistSimulatorAssistant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: string,
  canalId: string,
  phone: string,
  name: string,
  leadId: string,
  sessaoId: string | null,
  text: string,
  cardId: string | null,
  responsavelId: string | null,
  handover: boolean,
  reasoning: string,
) {
  if (!sessaoId) return

  await SessionPersistenceService.persistMessage(supabase, {
    empresaId,
    canalId,
    externalId: phone,
    leadId,
    sessaoId,
    cardId,
    role: 'assistant',
    content: text,
    direcao: 'outbound',
    status: handover ? 'human' : 'ai',
    atribuidoAId: responsavelId,
    isAi: true,
    contactPhone: phone,
    contactName: name,
    metadata: {
      provider: 'simulator',
      is_ai: true,
      document_auto_reply: true,
      card_id: cardId,
      reasoning,
    },
  })

  if (handover) {
    await supabase
      .from('crm_conversas')
      .update({
        status: 'human',
        atribuido_a_id: responsavelId,
        updated_at: new Date().toISOString(),
      })
      .eq('sessao_id', sessaoId)
      .eq('empresa_id', empresaId)
  }
}

/**
 * Recupera as interações existentes para a página
 */
export async function getChatHistory(phone: string) {
  const me = await getMyProfile()
  if (!canAccessSimulador(me)) {
    return []
  }

  const supabase = await createClient()
  const cleanPhone = phone.replace(/\D/g, '')
  const { data } = await supabase
    .from('crm_interacoes')
    .select('*')
    .eq('contact_phone', cleanPhone)
    .eq('empresa_id', me?.empresa_id ?? '')
    .order('created_at', { ascending: true })

  return data || []
}
