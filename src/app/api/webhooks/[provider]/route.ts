import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { ProviderFactory } from '@/lib/omnichannel/ProviderFactory';
import { TriageService } from '@/lib/omnichannel/TriageService';
import { HuginMessage, HuginEvent } from '@/types/omnichannel';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerSlug } = await params;
  const body = await request.json();
  const supabase = await createClient();

  // 1. Obter o Provedor correspondente
  const provider = ProviderFactory.getProvider(providerSlug);
  if (!provider) {
    return NextResponse.json({ error: 'Provedor não suportado' }, { status: 400 });
  }

  // 2. Parsear o webhook bruto (Pode retornar mensagens ou eventos de sistema)
  const parsed = provider.parseWebhook(body);
  if (!parsed) {
    return NextResponse.json({ status: 'ignored', reason: 'Evento não processável' });
  }

  // 3. SE FOR ATUALIZAÇÃO DE STATUS: Atualizar banco diretamente
  if ('event' in parsed && (parsed as HuginEvent).event === 'status_update') {
    const event = parsed as HuginEvent;
    
    const { error: statusError } = await supabase
      .from('crm_canais')
      .update({ status: event.status })
      .eq('provider', providerSlug)
      .eq('provider_id', event.provider_id);

    if (statusError) {
      console.error(`Erro ao atualizar status do canal: ${event.provider_id}`, statusError);
      return NextResponse.json({ status: 'error', error: statusError.message });
    }

    return NextResponse.json({ status: 'success', type: 'status_synced' });
  }

  // 4. SE FOR MENSAGENS: Iniciar processamento de negócio
  const messages = Array.isArray(parsed) ? (parsed as HuginMessage[]) : [parsed as HuginMessage];

  for (const msg of messages) {
    // Identificar o Canal e Empresa através do provider_id
    const { data: canal, error: canalError } = await supabase
      .from('crm_canais')
      .select('id, empresa_id, ia_config, settings')
      .eq('provider', providerSlug)
      .eq('provider_id', msg.provider_id)
      .single();

    if (canalError || !canal) {
      console.error(`Canal não configurado: ${providerSlug} - ${msg.provider_id}`);
      continue;
    }

    msg.empresa_id = canal.empresa_id;

    // Lógica de Leads (Busca ou Criação)
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('empresa_id', canal.empresa_id)
      .eq('telefone', msg.sender_id)
      .single();

    let leadId = lead?.id;
    if (!leadId) {
      const { data: newLead } = await supabase
        .from('crm_leads')
        .insert([{
          empresa_id: canal.empresa_id,
          nome: msg.sender_name || 'Desconhecido',
          telefone: msg.sender_id,
          whatsapp: msg.sender_id,
          canal_id: canal.id
        }])
        .select('id')
        .single();
      leadId = newLead?.id;
    }

    // Atualizar Estado da Conversa e Triagem
    const conversaId = await TriageService.recordInboundMessage(msg, canal.id, supabase);
    const shouldRespond = await TriageService.shouldAiRespond(msg, canal.id, supabase);

    // Lógica de CRM (Cards no Kanban)
    if (leadId) {
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('empresa_id', canal.empresa_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (pipeline) {
        const { data: stage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', pipeline.id)
          .order('ordem', { ascending: true })
          .limit(1)
          .single();

        if (stage) {
          const { data: currentCard } = await supabase
            .from('crm_cards')
            .select('id')
            .eq('lead_id', leadId)
            .eq('pipeline_id', pipeline.id)
            .limit(1);

          if (!currentCard || currentCard.length === 0) {
            await supabase.from('crm_cards').insert({
              empresa_id: canal.empresa_id,
              pipeline_id: pipeline.id,
              stage_id: stage.id,
              lead_id: leadId,
              titulo: `Omnichannel: ${msg.sender_name || 'Desconhecido'}`,
              cliente_nome: msg.sender_name || 'Desconhecido',
              descricao: `Mensagem (${providerSlug}): ${msg.content}`
            });
          }
        }
      }
    }

    // Salvar Interação Histórica
    await supabase.from('crm_interacoes').insert({
      empresa_id: canal.empresa_id,
      lead_id: leadId,
      conversa_id: conversaId,
      contact_phone: msg.sender_id,
      contact_name: msg.sender_name || 'Desconhecido',
      role: 'user',
      content: msg.content,
      metadata: { 
        provider: msg.provider,
        provider_id: msg.provider_id,
        ai_triage: shouldRespond 
      }
    });

    // IA Response (Triagem)
    if (shouldRespond && canal.ia_config?.ativo) {
      console.log(`IA Ativada no canal ${canal.id}`);
    }
  }

  return NextResponse.json({ status: 'success' });
}
