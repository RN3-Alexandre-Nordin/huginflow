import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { EvolutionApiService } from '@/lib/omnichannel/services/EvolutionApiService';
import { getOmnichannelConfig } from '@/lib/config/environment';
import { DEFAULT_IA_CONFIG } from '@/lib/omnichannel/channel-ai';

/**
 * POST /api/channels/create
 * Orquestra a criação de canais omnichannel usando credenciais SEGURAS do servidor (.env).
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  // 1. Obter perfil do usuário logado
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { data: profile } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('auth_user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });

  try {
    const { nome, tipo, provider } = await request.json();

    if (!nome || !provider) {
      return NextResponse.json({ error: 'Nome e Provider são obrigatórios' }, { status: 400 });
    }

    let omnichannel
    try {
      omnichannel = getOmnichannelConfig()
    } catch (configError: unknown) {
      const message =
        configError instanceof Error ? configError.message : 'Configuração omnichannel inválida.'
      return NextResponse.json({ error: message }, { status: 500 })
    }

    const { evolutionApiUrl: serverApiUrl, evolutionApiToken: serverApiToken, webhookUrl, environment } =
      omnichannel

    // 2. Gerar nome de instância único baseado no nome digitado pelo usuário
    const normalizedName = nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]/g, '_')     // Substitui caracteres especiais por _
      .substring(0, 30);              // Limita o tamanho inicial
    
    const shortId = Math.random().toString(36).substring(7);
    const instanceName = `${normalizedName}_${shortId}`;

    let qrCodeBase64 = null;

        // 3. Orquestração Baseada no Provedor (Usando Credenciais Seguras)
    if (provider === 'evolution') {
      let createResponse: unknown
      try {
        createResponse = await EvolutionApiService.createInstance(
          instanceName,
          serverApiUrl,
          serverApiToken,
        )
        console.log(`[Channel Create] Instância criada: ${instanceName}`, createResponse)
      } catch (createError: unknown) {
        const message = createError instanceof Error ? createError.message : String(createError)
        console.error(`[Channel Create] Erro ao criar instância: ${instanceName}`, createError)
        throw new Error(`Falha ao criar instância na Evolution: ${message}`)
      }

      try {
        await EvolutionApiService.setInstanceSettings(
          instanceName,
          {
            rejectCall: true,
            msgCall: 'Este número só recebe mensagens de WhatsApp.',
            groupsIgnore: true,
            alwaysOnline: true,
            readMessages: false,
            readStatus: false,
            syncFullHistory: false,
          },
          serverApiUrl,
          serverApiToken,
        )
        console.log(`[Channel Create] Settings aplicadas: ${instanceName}`)
      } catch (settingsError: unknown) {
        const message =
          settingsError instanceof Error ? settingsError.message : String(settingsError)
        console.warn(`[Channel Create] Aviso ao aplicar settings: ${message}`)
      }

      const webhookResult = await EvolutionApiService.registerWebhook(
        instanceName,
        webhookUrl,
        serverApiUrl,
        serverApiToken,
      )
      if (!webhookResult.success) {
        await EvolutionApiService.logoutInstance(instanceName, serverApiUrl, serverApiToken)
        const detail =
          typeof webhookResult.error === 'object'
            ? JSON.stringify(webhookResult.error)
            : String(webhookResult.error)
        throw new Error(`Falha ao registrar webhook na Evolution: ${detail}`)
      }
      console.log(`[Channel Create] Webhook registrado: ${instanceName}`)

      qrCodeBase64 = await EvolutionApiService.resolveQRCode(
        instanceName,
        createResponse,
        serverApiUrl,
        serverApiToken,
      )
      if (qrCodeBase64) {
        console.log(`[Channel Create] QR Code obtido com sucesso para ${instanceName}`)
      } else {
        console.warn(
          `[Channel Create] QR Code indisponível após retries para ${instanceName}; cliente pode solicitar novamente.`,
        )
      }
    } else {
      return NextResponse.json({ error: 'Provedor ainda não integrado ou indisponível.' }, { status: 501 });
    }

    // 4. Registrar em crm_canais preservando a rastreabilidade interna
    // O provider_token é salvo mas o segredo real reside no .env se for global.
    const { data: canal, error: canalError } = await supabase
      .from('crm_canais')
      .insert([{
        empresa_id: profile.empresa_id,
        nome: nome,
        tipo: tipo || 'whatsapp',
        provider: provider,
        provider_id: instanceName,
        provider_token: serverApiToken,
        status: provider === 'evolution' ? 'pairing' : qrCodeBase64 ? 'pairing' : 'connected',
        settings: {
          apiUrl: serverApiUrl,
          instanceName: instanceName
        },
        ia_config: DEFAULT_IA_CONFIG,
      }])
      .select('id')
      .single();

    if (canalError) {
      // Rollback na Evolution se falhar no DB
      await EvolutionApiService.logoutInstance(instanceName, serverApiUrl, serverApiToken);
      throw canalError;
    }

    return NextResponse.json({
      success: true,
      canalId: canal.id,
      instanceName: instanceName,
      qrcode: qrCodeBase64,
      environment,
      evolutionApiUrl: serverApiUrl,
      webhookUrl,
    });

  } catch (error: any) {
    console.error('Erro na criação segura de canal:', error);
    return NextResponse.json({ error: error.message || 'Falha ao criar canal' }, { status: 500 });
  }
}
