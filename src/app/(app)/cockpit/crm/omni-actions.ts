'use server'

import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { EvolutionProvider } from '@/lib/omnichannel/providers/EvolutionProvider'
import { buildEvolutionProviderConfig } from '@/lib/omnichannel/evolution-config'
import { ConversaHistoricoService } from '@/lib/omnichannel/ConversaHistoricoService'
import { WHATSAPP_SENDER_LABELS } from '@/lib/omnichannel/whatsapp-outbound'

/** @param sessaoId ID estável do thread (crm_conversas.sessao_id) */
export async function sendOmniMessage(sessaoId: string, content: string) {
  try {
    const me = await getMyProfile()
    if (!me) throw new Error('Usuário não autenticado')

    const supabase = await createClient()

    // 1. Buscar Detalhes da Conversa, Canal e Lead
    const { data: conversa, error: convError } = await supabase
      .from('crm_conversas')
      .select(`
        *,
        crm_canais (*),
        crm_leads (*)
      `)
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

    console.log(`[Omni] Iniciando processo para sessão: ${sessaoId}`)

    // 2. Salvar Interação no Banco (Prioridade 1)
    console.log(`[Omni] Salvando no Supabase: Empresa=${me.empresa_id}, Lead=${lead.id}, Sessão=${sessaoId}`)
    
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
          status: 'sent_manual'
        }
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Omni] ERRO NO INSERT:', JSON.stringify(insertError, null, 2))
      return { success: false, error: `Erro no Banco (RLS ou Schema): ${insertError.message}` }
    }
    console.log('[Omni] Sucesso: Mensagem gravada no banco (ID:', insertedMsg.id, ')')

    // 3. Nova linha em crm_conversas (histórico) + pausa IA
    const externalId =
      conversa.external_id ||
      lead.telefone?.replace(/\D/g, '') ||
      lead.whatsapp?.replace(/\D/g, '') ||
      ''

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
        metadata: { sent_by: me.id, status: 'sent_manual' },
      },
      supabase,
    )

    if (!historicoId) console.error('[Omni] Erro ao gravar linha em crm_conversas')

    // 4. Disparar via Provider (WhatsApp)
    const recipient =
      conversa.external_id ||
      lead.telefone?.replace(/\D/g, '') ||
      lead.whatsapp?.replace(/\D/g, '') ||
      ''

    if (!recipient) {
      return { success: false, error: 'Telefone do lead não encontrado (external_id vazio).' }
    }

    const senderLabel = me.nome_completo?.trim() || WHATSAPP_SENDER_LABELS.attendantFallback

    console.log(`[Omni] Tentando envio via WhatsApp para: ${recipient} (${senderLabel})`)
    const result = await provider.sendMessageWithSenderLabel(
      recipient,
      senderLabel,
      content,
      config,
    )

    if (result.success) {
      // Atualiza o registro com o ID da mensagem do WhatsApp
      await supabase
        .from('crm_interacoes')
        .update({ 
          metadata: { 
            ...insertedMsg.metadata, 
            provider_message_id: result.messageId,
            status: 'sent' 
          } 
        })
        .eq('id', insertedMsg.id)
      
      console.log('[Omni] Sucesso total: Banco e WhatsApp OK')
      return { success: true, messageId: result.messageId }
    } else {
      console.error('[Omni] Erro no WhatsApp, mas banco está OK:', result.error)
      // Marca a mensagem no banco como falha de envio
      await supabase
        .from('crm_interacoes')
        .update({ metadata: { ...insertedMsg.metadata, status: 'error', provider_error: result.error } })
        .eq('id', insertedMsg.id)
        
      return { success: false, error: 'Gravado no banco, mas falhou ao enviar para o WhatsApp: ' + JSON.stringify(result.error) }
    }

  } catch (error: any) {
    console.error('[OmniActions] Erro ao enviar mensagem:', error)
    return { success: false, error: error.message }
  }
}
