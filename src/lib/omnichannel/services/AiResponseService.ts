import { createClient } from '@/utils/supabase/server';
import { RagnarMessage } from '@/types/omnichannel';

export class AiResponseService {
  /**
   * Processa uma resposta automática via n8n com política de resiliência (Retry + Timeout).
   * Protocolo: 3 tentativas, 30s timeout, zero persistência local de sucesso, alerta de falha.
   */
  static async processAutoResponse(message: RagnarMessage, canalId: string) {
    const supabase = await createClient();
    const maxRetries = 3;
    const retryDelay = 2000; // 2 segundos
    const timeoutMs = 30000; // 30 segundos
    const n8nWebhook = process.env.N8N_WEBHOOK;

    if (!n8nWebhook) {
      console.error("[AiResponse] N8N_WEBHOOK não configurado no ambiente.");
      return;
    }

    const empresaId = message.empresa_id;
    const leadId = message.metadata?.lead_id;
    const conversaId = message.metadata?.conversa_id;

    if (!empresaId || !leadId || !conversaId) {
      console.error(`[AiResponse] Metadados insuficientes: empresa=${empresaId}, lead=${leadId}, conversa=${conversaId}`);
      return;
    }

    try {
      // 1. Marcar conversa como 'processing' para evitar loops e indicar atividade
      await supabase
        .from('crm_conversas')
        .update({ status: 'processing' as any })
        .eq('id', conversaId);

      // 2. Montar o Payload para o n8n no padrão solicitado (Evolution API + Metadados)
      const n8nPayload = {
        event: "messages.upsert",
        instance: "Ragnar_Prod",
        data: {
          key: {
            remoteJid: `${message.sender_id.replace(/\D/g, "")}@s.whatsapp.net`,
            fromMe: false,
            id: message.id
          },
          pushName: message.sender_name || 'Usuário WhatsApp',
          message: {
            conversation: message.content
          },
          messageType: "conversation"
        },
        metadata: {
          empresa_id: empresaId,
          cliente_id: leadId
        }
      };

      // 3. Loop de Retentativa para o N8N_WEBHOOK
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
        attempt++;
        console.log(`[AiResponse] Tentativa ${attempt}/${maxRetries} vinculada ao lead ${leadId}`);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          const response = await fetch(n8nWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(n8nPayload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            success = true;
            console.log(`[AiResponse] Sucesso: n8n recebeu a mensagem na tentativa ${attempt}`);
            
            // Retornar o status da conversa para 'ai'
            await supabase
              .from('crm_conversas')
              .update({ status: 'ai' as any })
              .eq('id', conversaId);

          } else {
            console.warn(`[AiResponse] Erro ${response.status} no n8n (tentativa ${attempt})`);
            if (attempt < maxRetries) await new Promise(res => setTimeout(res, retryDelay));
          }
        } catch (err: any) {
          if (err.name === 'AbortError') {
            console.warn(`[AiResponse] Timeout de 30s atingido na tentativa ${attempt}`);
          } else {
            console.error(`[AiResponse] Erro na requisição (tentativa ${attempt}):`, err.message);
          }
          if (attempt < maxRetries) await new Promise(res => setTimeout(res, retryDelay));
        }
      }

      // 4. Tratamento de Falha Crítica após todas as tentativas
      if (!success) {
        console.error(`[AiResponse] FALHA CRÍTICA: n8n não respondeu após ${maxRetries} tentativas.`);
        
        // Reverter status para 'ai' para não travar o lead em 'processing' indefinidamente
        await supabase
          .from('crm_conversas')
          .update({ status: 'ai' as any })
          .eq('id', conversaId);

        // Notificar administrador via crm_interacoes usando o novo campo log_sistema
        const errorLog = `Falha crítica: Mônica (IA) não respondeu após 3 tentativas para o cliente [${leadId}], número do whatsapp ${message.sender_id} e o nome do cliente ${message.sender_name || 'Desconhecido'}. Verifique o n8n.`;
        
        await supabase.from('crm_interacoes').insert({
          empresa_id: empresaId,
          lead_id: leadId,
          conversa_id: conversaId,
          contact_phone: message.sender_id,
          contact_name: message.sender_name || 'Usuário',
          role: 'system' as any,
          content: '(Erro de comunicação com motor de IA)',
          log_sistema: errorLog,
          metadata: { 
            error: true,
            attempts: maxRetries,
            type: 'ai_failure'
          }
        });

        console.error(`[ALERT] ${errorLog}`);
      }

    } catch (error) {
      console.error("[AiResponse] Erro inesperado no processamento da IA:", error);
    }
  }
}
