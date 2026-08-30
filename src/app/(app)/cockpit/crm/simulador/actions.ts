'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { canAccessSimulador } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { GeminiChatService } from '@/lib/crm/GeminiChatService'
import { AUDIO_PLACEHOLDER } from '@/lib/omnichannel/audio-transcription-constants'
import type { TranscriptionMetadata } from '@/lib/omnichannel/services/AudioTranscriptionService'
import { AudioTranscriptionService } from '@/lib/omnichannel/services/AudioTranscriptionService'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'
import { TriageActionExecutor } from '@/lib/omnichannel/triage/TriageActionExecutor'

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

  const sessaoId = await ConversaHistoricoService.appendMessage(
    {
      empresa_id: targetEmpresaId,
      canal_id: canalId,
      external_id: cleanPhone,
      lead_id: leadId,
      role: 'user',
      content: userContent,
      direcao: 'inbound',
      status: 'ai',
      metadata: { ...(userMetadata ?? {}), provider: 'simulator' },
    },
    supabase,
  )

  await supabase.from('crm_interacoes').insert([
    {
      empresa_id: targetEmpresaId,
      lead_id: leadId,
      conversa_id: sessaoId,
      contact_phone: cleanPhone,
      contact_name: name,
      role: 'user',
      content: userContent,
      metadata: { ...(userMetadata ?? {}), provider: 'simulator' },
    },
  ])

  const aiResult = await GeminiChatService.generateReply(supabase, {
    empresaId: targetEmpresaId,
    leadId,
    conversaId: sessaoId ?? undefined,
    contactPhone: cleanPhone,
    contactName: name,
    message: messageText,
  })

  if (!aiResult.success) {
    return { error: aiResult.error }
  }

  let triageResult = {
    executed: [] as string[],
    cardId: null as string | null,
    responsavelId: null as string | null,
    handover: false,
    reasoning: 'Sessão não criada — triagem não executada.',
  }

  if (sessaoId) {
    triageResult = await TriageActionExecutor.execute(supabase, {
      empresaId: targetEmpresaId,
      leadId,
      sessaoId,
      canalId,
      contactPhone: cleanPhone,
      contactName: name,
      facts: aiResult.facts,
      tags: aiResult.tags,
    })
  }

  let responsavelNome: string | null = null
  if (triageResult.responsavelId) {
    const { data: resp } = await supabase
      .from('usuarios')
      .select('nome_completo')
      .eq('id', triageResult.responsavelId)
      .maybeSingle()
    responsavelNome = resp?.nome_completo ?? null
  }

  await supabase.from('crm_interacoes').insert([
    {
      empresa_id: targetEmpresaId,
      lead_id: leadId,
      conversa_id: sessaoId,
      contact_phone: cleanPhone,
      contact_name: name,
      role: 'assistant',
      content: aiResult.response,
      metadata: {
        provider: 'simulator',
        is_ai: true,
        crm_status: aiResult.crmStatus ?? null,
        triage_actions: triageResult.executed,
        card_id: triageResult.cardId,
        responsavel_id: triageResult.responsavelId,
      },
    },
  ])

  if (sessaoId) {
    await ConversaHistoricoService.appendMessage(
      {
        empresa_id: targetEmpresaId,
        canal_id: canalId,
        external_id: cleanPhone,
        lead_id: leadId,
        role: 'assistant',
        content: aiResult.responseForWhatsApp || aiResult.response,
        direcao: 'outbound',
        status: triageResult.handover ? 'human' : 'ai',
        atribuido_a_id: triageResult.responsavelId,
        is_ai: true,
        metadata: {
          provider: 'simulator',
          is_ai: true,
          triage_actions: triageResult.executed,
        },
      },
      supabase,
    )

    if (triageResult.handover) {
      await supabase
        .from('crm_conversas')
        .update({
          status: 'human',
          atribuido_a_id: triageResult.responsavelId,
          last_human_interaction: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('sessao_id', sessaoId)
        .eq('empresa_id', targetEmpresaId)
    }
  }

  revalidatePath('/cockpit/crm/simulador')
  revalidatePath('/cockpit/crm/chat')
  revalidatePath('/cockpit')

  return {
    success: true,
    response: aiResult.responseForWhatsApp || aiResult.response,
    responseRaw: aiResult.response,
    userContent,
    transcriptionOk: true,
    triage: {
      actions: triageResult.executed,
      crmStatus: aiResult.crmStatus,
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

  const metadata: TranscriptionMetadata & { provider: string } = {
    ...transcription.metadata,
    provider: 'simulator',
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
