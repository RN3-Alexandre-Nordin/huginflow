export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact';
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Representa uma mensagem de chat unificada no HuginFlow
 */
export interface HuginMessage {
  id: string; // ID original no provedor
  provider: string; // 'evolution', 'meta', etc
  provider_id: string; // instance_name, business_phone_id, etc
  empresa_id: string;
  sender_id: string; // Telefone ou ID do remetente
  sender_name?: string;
  content: string;
  type: MessageType;
  metadata?: any;
  created_at: Date;
  direction: MessageDirection;
}

/**
 * Representa um evento de sistema (ex: mudança de status da conexão)
 */
export interface HuginEvent {
  event: 'status_update';
  provider: string;
  provider_id: string;
  status: 'connected' | 'disconnected' | 'pairing';
  metadata?: any;
}

export type WebhookResult = HuginMessage | HuginMessage[] | HuginEvent | null;

export interface ProviderConfig {
  provider: string;
  provider_id: string;
  provider_token?: string;
  settings?: any;
  ia_config?: {
    ativo: boolean;
    timeout: number;
    prompt_base: string;
  };
}

export interface BaseProvider {
  sendMessage(to: string, content: string, config: ProviderConfig): Promise<{ success: boolean; messageId?: string; error?: any }>;
  parseWebhook(payload: any): WebhookResult;
}
