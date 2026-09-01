import type { SupabaseClient } from '@supabase/supabase-js'

export type AttachInboundInput = {
  cardId: string
  empresaId: string
  buffer: Buffer
  fileName: string
  mimeType: string
  providerMessageId?: string
  interacaoId?: string
}

export type AttachInboundResult =
  | { ok: true; fileId: string; storagePath: string; deduplicated?: boolean }
  | { ok: false; error: string }

export class CardAttachmentService {
  static async attachFromInbound(
    supabase: SupabaseClient,
    input: AttachInboundInput,
  ): Promise<AttachInboundResult> {
    const {
      cardId,
      empresaId,
      buffer,
      fileName,
      mimeType,
      providerMessageId,
      interacaoId,
    } = input

    if (providerMessageId) {
      const { data: existing } = await supabase
        .from('crm_card_files')
        .select('id, file_url')
        .eq('empresa_id', empresaId)
        .eq('provider_message_id', providerMessageId)
        .maybeSingle()

      if (existing?.id) {
        return {
          ok: true,
          fileId: existing.id,
          storagePath: existing.file_url,
          deduplicated: true,
        }
      }
    }

    const safeName = fileName.replace(/[^\w.\-() ]+/g, '_')
    const storageName = `${Date.now()}_${safeName}`
    const filePath = `${empresaId}/${cardId}/${storageName}`

    const { error: storageError } = await supabase.storage
      .from('card_attachments')
      .upload(filePath, buffer, { contentType: mimeType, upsert: false })

    if (storageError) {
      return { ok: false, error: storageError.message }
    }

    const insertPayload: Record<string, unknown> = {
      empresa_id: empresaId,
      card_id: cardId,
      file_name: safeName,
      file_url: filePath,
      file_type: mimeType,
      uploaded_by: null,
      source: 'whatsapp_inbound',
    }

    if (interacaoId) insertPayload.interacao_id = interacaoId
    if (providerMessageId) insertPayload.provider_message_id = providerMessageId

    const { data: inserted, error: dbError } = await supabase
      .from('crm_card_files')
      .insert([insertPayload])
      .select('id')
      .single()

    if (dbError) {
      await supabase.storage.from('card_attachments').remove([filePath])
      return { ok: false, error: dbError.message }
    }

    return {
      ok: true,
      fileId: inserted!.id as string,
      storagePath: filePath,
    }
  }
}
