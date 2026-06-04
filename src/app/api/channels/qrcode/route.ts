import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { EvolutionApiService } from '@/lib/omnichannel/services/EvolutionApiService';
import { getResolvedEvolutionCreds } from '@/lib/omnichannel/evolution-config';

/**
 * GET /api/channels/qrcode?canalId=<canalId>
 * Retorna o QR Code de uma instância Evolution já criada
 * Útil se o QR expirou ou o usuário precisa de uma nova tentativa
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  // 1. Validar autenticação
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const canalId = searchParams.get('canalId');

    if (!canalId) {
      return NextResponse.json({ error: 'canalId é obrigatório' }, { status: 400 });
    }

    // 2. Buscar dados do canal
    const { data: canal, error: canalError } = await supabase
      .from('crm_canais')
      .select('id, provider_id, provider_token, settings, empresa_id')
      .eq('id', canalId)
      .single();

    if (canalError || !canal) {
      return NextResponse.json({ error: 'Canal não encontrado' }, { status: 404 });
    }

    // 3. Validar que o usuário tem acesso a este canal
    const { data: profile } = await supabase
      .from('usuarios')
      .select('empresa_id')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile || profile.empresa_id !== canal.empresa_id) {
      return NextResponse.json({ error: 'Acesso negado a este canal' }, { status: 403 });
    }

    const { apiUrl, apiKey: apiToken } = getResolvedEvolutionCreds({
      provider_id: canal.provider_id,
      provider_token: canal.provider_token,
      settings: canal.settings as Record<string, unknown> | null,
    });

    if (!apiUrl || !apiToken) {
      return NextResponse.json({ error: 'Credenciais da Evolution não configuradas' }, { status: 500 });
    }

    // 5. Buscar QR Code da API Evolution
    console.log(`[QRCode] Buscando QR Code para instância: ${canal.provider_id}`);
    const qrCodeBase64 = await EvolutionApiService.getQRCode(
      canal.provider_id,
      apiUrl,
      apiToken
    );

    if (!qrCodeBase64) {
      return NextResponse.json(
        { error: 'QR Code não disponível. A instância pode estar conectada ou indisponível.' },
        { status: 503 }
      );
    }

    console.log(`[QRCode] QR Code obtido com sucesso para: ${canal.provider_id}`);

    return NextResponse.json({
      success: true,
      qrcode: qrCodeBase64,
      instanceName: canal.provider_id,
      canalId: canal.id,
    });

  } catch (error: any) {
    console.error('[QRCode] Erro ao obter QR Code:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao obter QR Code' },
      { status: 500 }
    );
  }
}
