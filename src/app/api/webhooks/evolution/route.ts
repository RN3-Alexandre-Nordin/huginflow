import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { EvolutionProvider } from '@/lib/omnichannel/providers/EvolutionProvider';
import { TriageService } from '@/lib/omnichannel/TriageService';
import { AiResponseService } from '@/lib/omnichannel/services/AiResponseService';
import { RagnarMessage } from '@/types/omnichannel';

export async function POST(request: Request) {
  const timestampId = Date.now();
  try {
    let rawBody = await request.json();
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    
    console.log(`[Webhook Evolution][${timestampId}] Recebido:`, body.event);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const event = body.event?.toLowerCase();
    if (event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored' });
    }

    const instanceName = body.instance;
    const data = body.data;

    if (!instanceName || !data || data.key?.fromMe) {
      console.log(`[Webhook Evolution][${timestampId}] Ignorado: Mensagem enviada pelo próprio número ou payload incompleto.`);
      return NextResponse.json({ status: 'ignored' });
    }

    // 1. Buscar Canal
    const { data: canal, error: canalError } = await supabase
      .from('crm_canais')
      .select('id, empresa_id, ia_config, settings')
      .eq('provider_id', instanceName)
      .eq('provider', 'evolution')
      .single();

    if (canalError || !canal) {
      console.error(`[Webhook Evolution][${timestampId}] ERRO: Canal não encontrado para instância ${instanceName}`);
      return NextResponse.json({ error: 'Instância não autorizada' }, { status: 403 });
    }

    // 2. Parsear Mensagem
    const provider = new EvolutionProvider();
    const parsed = provider.parseWebhook(body);

    if (!parsed || !('content' in parsed)) {
      console.log(`[Webhook Evolution][${timestampId}] Ignorado: Conteúdo da mensagem vazio ou não suportado.`);
      return NextResponse.json({ status: 'ignored' });
    }

    const msg = parsed as RagnarMessage;
    msg.empresa_id = canal.empresa_id;

    // 3. Gerenciar Lead (Buscar ou Criar)
    console.log(`[Webhook Evolution][${timestampId}] Buscando lead para telefone: ${msg.sender_id}`);
    const { data: existingLead } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('empresa_id', canal.empresa_id)
      .eq('telefone', msg.sender_id)
      .single();

    let leadId = existingLead?.id;
    if (!leadId) {
      console.log(`[Webhook Evolution][${timestampId}] Criando novo lead para: ${msg.sender_id}`);
      const { data: newLead, error: insertError } = await supabase
        .from('crm_leads')
        .insert([{
          empresa_id: canal.empresa_id,
          nome: msg.sender_name || 'Usuário WhatsApp',
          telefone: msg.sender_id,
          whatsapp: msg.sender_id,
          canal_id: canal.id
        }])
        .select('id')
        .single();
      
      if (insertError) {
        console.error(`[Webhook Evolution][${timestampId}] ERRO ao criar Lead:`, insertError);
        return NextResponse.json({ error: 'Erro ao criar lead' }, { status: 500 });
      }
      leadId = newLead?.id;
    }

    // 4. Atualizar Estado da Conversa
    const conversaId = await TriageService.updateConversaState(msg, canal.id, supabase, leadId);
    if (!conversaId) {
      console.error(`[Webhook Evolution][${timestampId}] ERRO: Não foi possível obter/criar conversa.`);
      return NextResponse.json({ error: 'Erro de sessão' }, { status: 500 });
    }

    // 5. Salvar Interação
    const { error: interacaoError } = await supabase.from('crm_interacoes').insert({
      empresa_id: canal.empresa_id,
      lead_id: leadId,
      conversa_id: conversaId,
      contact_phone: msg.sender_id,
      contact_name: msg.sender_name || 'Usuário WhatsApp',
      role: 'user',
      content: msg.content,
      created_at: msg.created_at ? new Date(msg.created_at).toISOString() : new Date().toISOString(),
      metadata: { 
        provider: 'evolution',
        instance: instanceName,
        provider_message_id: msg.id
      }
    });

    if (interacaoError) {
      console.error(`[Webhook Evolution][${timestampId}] ERRO ao salvar interação:`, interacaoError);
    }

    // 6. Triagem para Resposta da IA
    const shouldRespond = await TriageService.shouldAiRespond(msg, canal.id, supabase);
    
    if (shouldRespond && canal.ia_config?.ativo) {
      console.log(`[Webhook Evolution][${timestampId}] IA Habilitada. Ativando AiResponseService para Lead ${leadId}`);
      
      msg.metadata = { 
        ...msg.metadata, 
        lead_id: leadId, 
        conversa_id: conversaId 
      };

      // Execução assíncrona
      AiResponseService.processAutoResponse(msg, canal.id).catch(err => {
        console.error(`[Webhook Evolution][${timestampId}] Erro AiResponseService:`, err);
      });
    } else {
      console.log(`[Webhook Evolution][${timestampId}] IA não deve responder (shouldRespond=${shouldRespond})`);
    }

    return NextResponse.json({ status: 'SUCCESS', leadId, conversaId });
  } catch (error: any) {
    console.error(`[Webhook Evolution][${timestampId}] ERRO CRÍTICO:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
