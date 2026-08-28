'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { canAccessSimulador } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { GeminiChatService } from '@/lib/crm/GeminiChatService'
import { AUDIO_PLACEHOLDER } from '@/lib/omnichannel/audio-transcription-constants'
import type { TranscriptionMetadata } from '@/lib/omnichannel/services/AudioTranscriptionService'
import { AudioTranscriptionService } from '@/lib/omnichannel/services/AudioTranscriptionService'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

type SimulatorChatResult =
  | {
      success: true
      response: string
      userContent: string
      transcriptionOk: boolean
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
  await supabase.from('crm_interacoes').insert([
    {
      empresa_id: targetEmpresaId,
      lead_id: leadId,
      contact_phone: cleanPhone,
      contact_name: name,
      role: 'user',
      content: userContent,
      metadata: userMetadata ?? { provider: 'simulator' },
    },
  ])

  const aiResult = await GeminiChatService.generateReply(supabase, {
    empresaId: targetEmpresaId,
    leadId,
    contactPhone: cleanPhone,
    contactName: name,
    message: messageText,
  })

  if (!aiResult.success) {
    return { error: aiResult.error }
  }

  await supabase.from('crm_interacoes').insert([
    {
      empresa_id: targetEmpresaId,
      lead_id: leadId,
      contact_phone: cleanPhone,
      contact_name: name,
      role: 'assistant',
      content: aiResult.response,
      metadata: { provider: 'simulator', is_ai: true },
    },
  ])

  revalidatePath('/cockpit/crm/simulador')
  return {
    success: true,
    response: aiResult.response,
    userContent,
    transcriptionOk: true,
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
