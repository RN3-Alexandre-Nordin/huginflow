import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { EvolutionProvider } from '@/lib/omnichannel/providers/EvolutionProvider';
import { TriageService } from '@/lib/omnichannel/TriageService';
import { AiResponseService } from '@/lib/omnichannel/services/AiResponseService';
import { isChannelAiEnabled } from '@/lib/omnichannel/channel-ai';
import { normalizeWhatsAppPhone } from '@/lib/omnichannel/phone';
import { getRoutingConfig } from '@/utils/crm/routing';
import { HuginEvent, HuginMessage } from '@/types/omnichannel';

function createWebhookSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) {
    throw new Error('Supabase URL ou SERVICE_ROLE_KEY ausentes no webhook')
  }
  return createClient(url, key)
}

async function handleConnectionUpdate(
  supabase: SupabaseClient,
  event: HuginEvent,
  timestampId: number,
) {
  if (!event.provider_id) {
    console.warn(`[Webhook Evolution][${timestampId}] CONNECTION_UPDATE sem instance`);
    return NextResponse.json({ status: 'ignored', reason: 'missing_instance' });
  }

  const { error: statusError } = await supabase
    .from('crm_canais')
    .update({ status: event.status })
    .eq('provider', 'evolution')
    .eq('provider_id', event.provider_id);

  if (statusError) {
    console.error(
      `[Webhook Evolution][${timestampId}] Erro ao atualizar status (${event.provider_id}):`,
      statusError,
    );
    return NextResponse.json({ status: 'error', error: statusError.message }, { status: 500 });
  }

  console.log(
    `[Webhook Evolution][${timestampId}] Status sincronizado: ${event.provider_id} → ${event.status}`,
  );

  return NextResponse.json({
    status: 'success',
    type: 'status_synced',
    instance: event.provider_id,
    platformStatus: event.status,
  });
}

async function handleMessageUpsert(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  msg: HuginMessage,
  timestampId: number,
) {
  const instanceName = body.instance as string;
  const data = body.data as { key?: { fromMe?: boolean } } | undefined;

  if (!instanceName || !data || data.key?.fromMe) {
    console.log(
      `[Webhook Evolution][${timestampId}] Ignorado: mensagem própria ou payload incompleto.`,
    );
    return NextResponse.json({ status: 'ignored' });
  }

  const { data: canal, error: canalError } = await supabase
    .from('crm_canais')
    .select('id, empresa_id, ia_config, settings, provider_id, provider_token')
    .eq('provider_id', instanceName)
    .eq('provider', 'evolution')
    .single();

  if (canalError || !canal) {
    console.error(
      `[Webhook Evolution][${timestampId}] ERRO: Canal não encontrado para instância ${instanceName}`,
    );
    return NextResponse.json({ error: 'Instância não autorizada' }, { status: 403 });
  }

  msg.empresa_id = canal.empresa_id;
  msg.sender_id = normalizeWhatsAppPhone(msg.sender_id);

  console.log(`[Webhook Evolution][${timestampId}] Buscando lead para telefone: ${msg.sender_id}`);
  const { data: existingLead } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', canal.empresa_id)
    .eq('telefone', msg.sender_id)
    .maybeSingle();

  let leadId = existingLead?.id;
  if (!leadId) {
    console.log(`[Webhook Evolution][${timestampId}] Criando novo lead para: ${msg.sender_id}`);
    const { data: newLead, error: insertError } = await supabase
      .from('crm_leads')
      .insert([
        {
          empresa_id: canal.empresa_id,
          nome: msg.sender_name || 'Usuário WhatsApp',
          telefone: msg.sender_id,
          whatsapp: msg.sender_id,
          canal_id: canal.id,
        },
      ])
      .select('id')
      .single();

    if (insertError) {
      console.error(`[Webhook Evolution][${timestampId}] ERRO ao criar Lead:`, insertError);
      return NextResponse.json({ error: 'Erro ao criar lead' }, { status: 500 });
    }
    leadId = newLead?.id;
  }

  if (leadId) {
    const routing = await getRoutingConfig(canal.id, canal.empresa_id);
    const pipelineId = routing?.pipeline_id;
    const stageId = routing?.stage_id;

    if (pipelineId && stageId) {
      const { data: existingCard } = await supabase
        .from('crm_cards')
        .select('id')
        .eq('lead_id', leadId)
        .eq('pipeline_id', pipelineId)
        .maybeSingle();

      if (!existingCard) {
        await supabase.from('crm_cards').insert({
          empresa_id: canal.empresa_id,
          pipeline_id: pipelineId,
          stage_id: stageId,
          lead_id: leadId,
          titulo: `WhatsApp: ${msg.sender_name || 'Contato'}`,
          cliente_nome: msg.sender_name || 'Contato WhatsApp',
          descricao: msg.content?.slice(0, 500) ?? '',
        });
      }
    }
  }

  const sessaoId = await TriageService.recordInboundMessage(msg, canal.id, supabase, leadId);
  if (!sessaoId) {
    console.error(`[Webhook Evolution][${timestampId}] ERRO: Não foi possível gravar crm_conversas.`);
    return NextResponse.json({ error: 'Erro de sessão (crm_conversas)' }, { status: 500 });
  }

  console.log(`[Webhook Evolution][${timestampId}] crm_conversas OK sessao=${sessaoId}`);

  const audioMeta =
    msg.type === 'audio'
      ? {
          media_type: msg.metadata?.media_type,
          mimetype: msg.metadata?.mimetype,
          ptt: msg.metadata?.ptt,
          duration_seconds: msg.metadata?.duration_seconds,
          transcription: msg.metadata?.transcription,
        }
      : {}

  const { error: interacaoError } = await supabase.from('crm_interacoes').insert({
    empresa_id: canal.empresa_id,
    lead_id: leadId,
    conversa_id: sessaoId,
    contact_phone: msg.sender_id,
    contact_name: msg.sender_name || 'Usuário WhatsApp',
    role: 'user',
    content: msg.content,
    created_at: msg.created_at
      ? new Date(msg.created_at).toISOString()
      : new Date().toISOString(),
    metadata: {
      provider: 'evolution',
      instance: instanceName,
      provider_message_id: msg.id,
      ...audioMeta,
    },
  });

  if (interacaoError) {
    console.error(`[Webhook Evolution][${timestampId}] ERRO ao salvar interação:`, interacaoError);
    return NextResponse.json(
      { error: 'Erro ao gravar interação', details: interacaoError.message },
      { status: 500 },
    );
  }

  console.log(
    `[Webhook Evolution][${timestampId}] Interação gravada (user) lead=${leadId} sessao=${sessaoId}`,
  );

  const shouldRespond = await TriageService.shouldAiRespond(msg, canal.id, supabase);
  const iaEnabled = isChannelAiEnabled(canal.ia_config);

  if (shouldRespond && iaEnabled) {
    console.log(
      `[Webhook Evolution][${timestampId}] IA ativa → Gemini + WhatsApp (lead=${leadId})`,
    );

    msg.metadata = {
      ...msg.metadata,
      lead_id: leadId,
      conversa_id: sessaoId,
    };

    AiResponseService.processAutoResponse(msg, canal, supabase).catch((err) => {
      console.error(`[Webhook Evolution][${timestampId}] Erro AiResponseService:`, err);
    });
  } else {
    console.log(
      `[Webhook Evolution][${timestampId}] IA ignorada: shouldRespond=${shouldRespond} iaEnabled=${iaEnabled} ia_config=${JSON.stringify(canal.ia_config)}`,
    );
  }

  return NextResponse.json({
    status: 'SUCCESS',
    leadId,
    conversaId: sessaoId,
    aiTriggered: shouldRespond && iaEnabled,
  });
}

export async function POST(request: Request) {
  const timestampId = Date.now();
  try {
    const rawBody = await request.json();
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '') ?? '?'
    console.log(`[Webhook Evolution][${timestampId}] Recebido: ${body.event} → Supabase ${supabaseHost}`)

    const supabase = createWebhookSupabase();
    const provider = new EvolutionProvider();
    const parsed = provider.parseWebhook(body);

    if (!parsed) {
      return NextResponse.json({ status: 'ignored', reason: 'event_not_processable' });
    }

    if ('event' in parsed && parsed.event === 'status_update') {
      return handleConnectionUpdate(supabase, parsed as HuginEvent, timestampId);
    }

    if ('content' in parsed) {
      return handleMessageUpsert(supabase, body, parsed as HuginMessage, timestampId);
    }

    return NextResponse.json({ status: 'ignored', reason: 'unknown_payload' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error(`[Webhook Evolution][${timestampId}] ERRO CRÍTICO:`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
