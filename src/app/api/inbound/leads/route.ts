import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * POST /api/inbound/leads
 *
 * Endpoint público de entrada de leads da Landing Page.
 * Recebe os dados do formulário, resolve a configuração de roteamento
 * pelo token_canal e cria um card no CRM com isolamento de tenant garantido.
 *
 * Não requer autenticação de usuário — usa service role internamente.
 * O token_canal é o mecanismo de autorização do canal de origem.
 */
export async function POST(request: Request) {
  // ----------------------------------------------------------------
  // 1. Parse e validação dos campos obrigatórios
  // ----------------------------------------------------------------
  let body: {
    nome?: string;
    email?: string;
    telefone?: string;
    mensagem?: string;
    token?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Body inválido. Envie um JSON válido.' },
      { status: 400 }
    );
  }

  const { nome, email, telefone, mensagem, token } = body;

  if (!nome || !email || !telefone || !token) {
    return NextResponse.json(
      {
        error: 'Campos obrigatórios ausentes.',
        required: ['nome', 'email', 'telefone', 'token'],
      },
      { status: 400 }
    );
  }

  // ----------------------------------------------------------------
  // 2. Instanciar cliente admin (service role — bypassa RLS)
  // ----------------------------------------------------------------
  const supabase = createAdminClient();

  // ----------------------------------------------------------------
  // 3. Resolver o canal pelo token e obter a configuração de roteamento
  //    Fluxo: crm_canais (token) → crm_canais_roteamento → org_id / pipeline_id / stage_id
  // ----------------------------------------------------------------
  const { data: canal, error: canalError } = await supabase
    .from('crm_canais')
    .select('id, status, empresa_id')
    .eq('token', token)
    .single();

  if (canalError || !canal) {
    console.warn('[inbound/leads] Canal não encontrado para o token fornecido.');
    return NextResponse.json(
      { error: 'Canal de origem não encontrado ou token inválido.' },
      { status: 404 }
    );
  }

  if (canal.status === 'inactive' || canal.status === 'disconnected') {
    console.warn(`[inbound/leads] Canal ${canal.id} está inativo (status: ${canal.status}).`);
    return NextResponse.json(
      { error: 'Este canal está inativo e não aceita novos leads.' },
      { status: 404 }
    );
  }

  const { data: roteamento, error: roteamentoError } = await supabase
    .from('crm_canais_roteamento')
    .select('org_id, pipeline_id, stage_id')
    .eq('canal_id', canal.id)
    .eq('org_id', canal.empresa_id)
    .single();

  if (roteamentoError || !roteamento) {
    console.error(
      `[inbound/leads] Configuração de roteamento não encontrada para o canal ${canal.id}:`,
      roteamentoError
    );
    return NextResponse.json(
      { error: 'Configuração de destino do canal não encontrada.' },
      { status: 404 }
    );
  }

  const { org_id, pipeline_id, stage_id } = roteamento;

  // Garantia extra de multi-tenancy: canal, organização, funil e etapa precisam formar
  // uma cadeia válida no mesmo tenant antes de qualquer escrita com service role.
  if (!org_id || org_id !== canal.empresa_id || !pipeline_id || !stage_id) {
    console.error(`[inbound/leads] Roteamento incompleto para canal ${canal.id}:`, roteamento);
    return NextResponse.json(
      { error: 'Configuração de destino incompleta. Verifique o roteamento do canal.' },
      { status: 404 }
    );
  }

  const { data: pipeline } = await supabase
    .from('pipelines')
    .select('id')
    .eq('id', pipeline_id)
    .eq('empresa_id', canal.empresa_id)
    .maybeSingle();
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('id', stage_id)
    .eq('pipeline_id', pipeline_id)
    .maybeSingle();

  if (!pipeline || !stage) {
    console.error(`[inbound/leads] Destino inválido para canal ${canal.id}.`);
    return NextResponse.json(
      { error: 'Configuração de destino do canal inválida.' },
      { status: 404 }
    );
  }

  // ----------------------------------------------------------------
  // 4. Criar o registro na tabela de Leads (crm_leads)
  // ----------------------------------------------------------------
  const { data: lead, error: leadError } = await supabase
    .from('crm_leads')
    .insert([
      {
        nome,
        email,
        telefone,
        whatsapp: telefone, // Duplicar para garantir compatibilidade
        canal_id: canal.id,
        empresa_id: org_id,
      },
    ])
    .select('id')
    .single();

  if (leadError || !lead) {
    console.error('[inbound/leads] Erro ao inserir lead:', leadError);
    return NextResponse.json(
      { error: 'Falha ao registrar o lead.' },
      { status: 500 }
    );
  }

  // ----------------------------------------------------------------
  // 5. Criar o card no CRM vinculado ao lead
  // ----------------------------------------------------------------
  const titulo = `Lead LP: ${nome}`;
  const descricaoCompleta = mensagem ?? '';

  const { data: card, error: cardError } = await supabase
    .from('crm_cards')
    .insert([
      {
        empresa_id: org_id,
        pipeline_id,
        stage_id,
        lead_id: lead.id, // Vínculo essencial
        titulo,
        descricao: descricaoCompleta,
        data_prazo: new Date().toISOString().split('T')[0], // Data de entrega hoje
        stage_entered_at: new Date().toISOString(),
      },
    ])
    .select('id')
    .single();

  if (cardError || !card) {
    console.error('[inbound/leads] Erro ao inserir card no CRM:', cardError);
    const { error: rollbackError } = await supabase
      .from('crm_leads')
      .delete()
      .eq('id', lead.id)
      .eq('empresa_id', canal.empresa_id);
    if (rollbackError) {
      console.error('[inbound/leads] Falha no rollback do lead:', rollbackError);
    }
    return NextResponse.json(
      { error: 'Falha ao registrar o lead no fluxo de destino.' },
      { status: 500 }
    );
  }

  // ----------------------------------------------------------------
  // 6. Retornar sucesso com os IDs gerados
  // ----------------------------------------------------------------
  console.info(`[inbound/leads] Lead (${lead.id}) e Card (${card.id}) criados com sucesso.`);

  return NextResponse.json(
    {
      success: true,
      lead_id: lead.id,
      card_id: card.id,
      destino: {
        empresa_id: org_id,
        pipeline_id,
        stage_id,
      }
    },
    { status: 201 }
  );
}
