import { HuginMessage, BaseProvider, ProviderConfig, WebhookResult, HuginEvent } from '@/types/omnichannel';
import { getEvolutionCredentials } from '@/lib/config/environment';
import {
  formatAttendantWhatsAppCaption,
  formatAttendantWhatsAppText,
} from '@/lib/omnichannel/whatsapp-outbound';
import { AUDIO_PLACEHOLDER } from '@/lib/omnichannel/audio-transcription-constants';
import { DOCUMENT_PLACEHOLDER } from '@/lib/omnichannel/document-constants';
import {
  extractAudioMessagePayload,
  extractDocumentMessagePayload,
  extractImageMessagePayload,
} from '@/lib/omnichannel/services/EvolutionMediaService';

/** Normaliza nomes de evento da Evolution (MESSAGES_UPSERT → messages.upsert). */
export function normalizeEvolutionEvent(event: string | undefined): string {
  if (!event) return '';
  return event.trim().toLowerCase().replace(/_/g, '.');
}

/** Extrai dígitos do telefone a partir do remoteJid ou número bruto. */
export function phoneFromRemoteJid(remoteJid: string | undefined): string | null {
  if (!remoteJid) return null;
  if (remoteJid.includes('@g.us')) return null;
  const local = remoteJid.split('@')[0]?.replace(/\D/g, '') ?? '';
  return local.length >= 8 ? local : null;
}

type SendTextOptions = {
  delay?: number
  presence?: 'composing' | 'recording' | 'paused' | 'available'
}

export type SendMediaInput = {
  mediatype: 'image' | 'document' | 'video'
  mimetype: string
  /** Base64 ou URL pública */
  media: string
  fileName: string
  caption?: string
}

export class EvolutionProvider implements BaseProvider {
  /**
   * Envia uma mensagem de texto simples via Evolution API
   */
  async sendMessage(
    to: string,
    content: string,
    config: ProviderConfig,
    sendOptions?: SendTextOptions,
  ): Promise<{ success: boolean; messageId?: string; error?: any }> {
    const envCreds = getEvolutionCredentials();
    const baseUrl = config.settings?.apiUrl || envCreds.apiUrl;
    const apiKey = config.provider_token || envCreds.apiKey;
    const instance = config.provider_id;

    if (!instance || !apiKey) {
      return { success: false, error: 'Configuração da Evolution API incompleta (Instance ou API Key ausente)' };
    }

    try {
      const response = await fetch(`${baseUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          number: to,
          options: {
            delay: sendOptions?.delay ?? 1200,
            presence: sendOptions?.presence ?? 'composing',
            linkPreview: false
          },
          text: content
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error(
          `[Evolution] sendText ${response.status} instance=${instance} url=${baseUrl}`,
          data,
        );
        return { success: false, error: data };
      }

      const messageId = data?.key?.id ?? data?.messageId;
      if (!messageId && data?.error) {
        return { success: false, error: data };
      }

      return { success: true, messageId };
    } catch (error) {
      console.error(`[Evolution] sendText rede instance=${instance} url=${baseUrl}:`, error);
      return { success: false, error };
    }
  }

  /**
   * Mensagem da IA ou sistema — sem identificação de remetente no WhatsApp.
   */
  async sendPlainMessage(
    to: string,
    body: string,
    config: ProviderConfig,
  ): Promise<{ success: boolean; messageId?: string; error?: unknown }> {
    const text = body.trim()
    if (!text) return { success: true, messageId: undefined }
    return this.sendMessage(to, text, config)
  }

  /**
   * Atendente humano — uma bolha: *Nome:* + texto (identificação visível no WhatsApp do cliente).
   */
  async sendAttendantMessage(
    to: string,
    attendantName: string,
    body: string,
    config: ProviderConfig,
  ): Promise<{ success: boolean; messageId?: string; error?: unknown }> {
    const text = formatAttendantWhatsAppText(attendantName, body)
    if (!text) return { success: true, messageId: undefined }
    return this.sendMessage(to, text, config)
  }

  /**
   * Envia PDF/imagem/vídeo via Evolution API (base64 ou URL).
   */
  async sendMedia(
    to: string,
    input: SendMediaInput,
    config: ProviderConfig,
  ): Promise<{ success: boolean; messageId?: string; error?: unknown }> {
    const envCreds = getEvolutionCredentials()
    const baseUrl = config.settings?.apiUrl || envCreds.apiUrl
    const apiKey = config.provider_token || envCreds.apiKey
    const instance = config.provider_id

    if (!instance || !apiKey) {
      return { success: false, error: 'Configuração da Evolution API incompleta (Instance ou API Key ausente)' }
    }

    try {
      const response = await fetch(`${baseUrl}/message/sendMedia/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: to,
          mediatype: input.mediatype,
          mimetype: input.mimetype,
          media: input.media,
          fileName: input.fileName,
          caption: input.caption ?? '',
          options: {
            delay: 800,
            presence: 'composing',
          },
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        console.error(
          `[Evolution] sendMedia ${response.status} instance=${instance} url=${baseUrl}`,
          data,
        )
        return { success: false, error: data }
      }

      const messageId = data?.key?.id ?? data?.messageId
      if (!messageId && data?.error) {
        return { success: false, error: data }
      }

      return { success: true, messageId }
    } catch (error) {
      console.error(`[Evolution] sendMedia rede instance=${instance} url=${baseUrl}:`, error)
      return { success: false, error }
    }
  }

  /**
   * Atendente humano + anexo — legenda na mesma bolha: *Nome:* + texto opcional.
   */
  async sendAttendantMedia(
    to: string,
    attendantName: string,
    input: SendMediaInput,
    config: ProviderConfig,
  ): Promise<{ success: boolean; messageId?: string; error?: unknown }> {
    return this.sendMedia(
      to,
      {
        ...input,
        caption: formatAttendantWhatsAppCaption(attendantName, input.caption),
      },
      config,
    )
  }

  /**
   * @deprecated Prefer sendPlainMessage (IA) ou sendAttendantMessage (humano).
   */
  async sendMessageWithSenderLabel(
    to: string,
    senderLabel: string,
    body: string,
    config: ProviderConfig,
  ): Promise<{ success: boolean; messageId?: string; error?: unknown }> {
    return this.sendAttendantMessage(to, senderLabel, body, config)
  }

  /**
   * Converte o payload bruto do webhook da Evolution para HuginMessage ou HuginEvent
   */
  parseWebhook(payload: any): WebhookResult {
    const eventName = normalizeEvolutionEvent(payload.event);

    // 1. Tratamento de Mudança de Status da Conexão
    if (eventName === 'connection.update') {
      const rawState =
        payload.data?.state ??
        payload.data?.instance?.state ??
        payload.state;
      const state = typeof rawState === 'string' ? rawState.toLowerCase() : '';
      let platformStatus: 'connected' | 'disconnected' | 'pairing' = 'disconnected';

      if (state === 'open' || state === 'connected') platformStatus = 'connected';
      else if (state === 'connecting' || state === 'pairing' || state === 'qrcode')
        platformStatus = 'pairing';
      else if (
        state === 'close' ||
        state === 'closed' ||
        state === 'refused' ||
        state === 'disconnected' ||
        state === 'logout'
      )
        platformStatus = 'disconnected';

      return {
        event: 'status_update',
        provider: 'evolution',
        provider_id: payload.instance || '',
        status: platformStatus,
        metadata: { raw: payload.data }
      } as HuginEvent;
    }

    // 2. Tratamento de Recebimento de Mensagem
    if (eventName === 'messages.upsert') {
      const data = payload.data;
      if (!data || data.key?.fromMe) return null;

      const senderPhone = phoneFromRemoteJid(data.key?.remoteJid);
      if (!senderPhone) return null;

      const messageContent =
        data.message?.conversation ||
        data.message?.extendedTextMessage?.text ||
        data.message?.imageMessage?.caption ||
        data.message?.videoMessage?.caption ||
        data.message?.documentMessage?.caption ||
        (data.message?.buttonsResponseMessage?.selectedDisplayText as string | undefined) ||
        (data.message?.listResponseMessage?.title as string | undefined) ||
        '';

      const audioMeta = extractAudioMessagePayload(data)
      const docMeta = extractDocumentMessagePayload(data)
      const imgMeta = extractImageMessagePayload(data)

      // Determinando o tipo de mensagem simplificado
      let type: any = 'text'
      if (imgMeta && !docMeta) type = 'image'
      if (data.message?.videoMessage) type = 'video'
      if (audioMeta) type = 'audio'
      if (docMeta) type = 'document'

      let content = messageContent
      if (type === 'audio' && !messageContent) content = AUDIO_PLACEHOLDER
      if ((type === 'document' || type === 'image') && !messageContent) {
        content = DOCUMENT_PLACEHOLDER
      }

      if (!content && type === 'text') return null

      return {
        id: data.key.id,
        provider: 'evolution',
        provider_id: payload.instance || '',
        empresa_id: '',
        sender_id: senderPhone,
        sender_name: data.pushName || 'WhatsApp User',
        content,
        type: type,
        created_at: new Date(data.messageTimestamp * 1000),
        direction: 'inbound',
        metadata: {
          raw: data,
          instance: payload.instance,
          provider_message_id: data.key.id,
          ...(audioMeta
            ? {
                media_type: 'audio',
                mimetype: audioMeta.mimetype,
                ptt: audioMeta.ptt,
                duration_seconds: audioMeta.seconds,
                transcription: { status: 'pending' as const },
              }
            : {}),
          ...(docMeta
            ? {
                media_type: 'document',
                mimetype: docMeta.mimetype,
                file_name: docMeta.fileName,
                file_length: docMeta.fileLength,
                document: { status: 'pending' as const },
              }
            : {}),
          ...(imgMeta && !docMeta
            ? {
                media_type: 'image',
                mimetype: imgMeta.mimetype,
                file_name: imgMeta.fileName,
                file_length: imgMeta.fileLength,
                document: { status: 'pending' as const },
              }
            : {}),
        }
      } as HuginMessage
    }

    return null;
  }
}
