import { HuginMessage, BaseProvider, ProviderConfig, WebhookResult, HuginEvent } from '@/types/omnichannel';
import { getEvolutionCredentials } from '@/lib/config/environment';
import { formatWhatsAppSignatureHeader } from '@/lib/omnichannel/whatsapp-outbound';
import { AUDIO_PLACEHOLDER } from '@/lib/omnichannel/audio-transcription-constants';
import { extractAudioMessagePayload } from '@/lib/omnichannel/services/EvolutionMediaService';

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
   * Identifica quem fala: 1ª bolha com o nome, 2ª com o conteúdo (confiável no WhatsApp).
   */
  async sendMessageWithSenderLabel(
    to: string,
    senderLabel: string,
    body: string,
    config: ProviderConfig,
  ): Promise<{ success: boolean; messageId?: string; error?: unknown }> {
    const header = formatWhatsAppSignatureHeader(senderLabel)
    const text = body.trim()

    if (header) {
      const headerResult = await this.sendMessage(to, header, config, {
        delay: 400,
        presence: 'composing',
      })
      if (!headerResult.success) {
        return headerResult
      }
      await new Promise((resolve) => setTimeout(resolve, 600))
    }

    if (!text) {
      return { success: true, messageId: undefined }
    }

    return this.sendMessage(to, text, config)
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
      let ragnarStatus: 'connected' | 'disconnected' | 'pairing' = 'disconnected';

      if (state === 'open' || state === 'connected') ragnarStatus = 'connected';
      else if (state === 'connecting' || state === 'pairing' || state === 'qrcode')
        ragnarStatus = 'pairing';
      else if (
        state === 'close' ||
        state === 'closed' ||
        state === 'refused' ||
        state === 'disconnected' ||
        state === 'logout'
      )
        ragnarStatus = 'disconnected';

      return {
        event: 'status_update',
        provider: 'evolution',
        provider_id: payload.instance || '',
        status: ragnarStatus,
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

      const audioMeta = extractAudioMessagePayload(data);

      // Determinando o tipo de mensagem simplificado
      let type: any = 'text';
      if (data.message?.imageMessage) type = 'image';
      if (data.message?.videoMessage) type = 'video';
      if (audioMeta) type = 'audio';
      if (data.message?.documentMessage) type = 'document';

      const content =
        type === 'audio' && !messageContent ? AUDIO_PLACEHOLDER : messageContent;

      if (!content && type === 'text') return null;

      return {
        id: data.key.id,
        provider: 'evolution',
        provider_id: payload.instance || '',
        empresa_id: '', // Será preenchido pelo serviço de roteamento ao consultar o banco
        sender_id: senderPhone,
        sender_name: data.pushName || 'WhatsApp User',
        content: content,
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
        }
      } as HuginMessage;
    }

    return null;
  }
}
