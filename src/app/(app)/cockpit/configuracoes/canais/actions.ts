"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { EvolutionApiService } from "@/lib/omnichannel/services/EvolutionApiService";
import { buildEvolutionProviderConfig } from "@/lib/omnichannel/evolution-config";
import { getMyProfile } from "@/app/(app)/cockpit/actions";

/** Credenciais Evolution: dev/prod sempre do .env (nunca settings clonados de outro ambiente). */
function resolveEvolutionCredentials(
  providerId: string,
  apiUrl?: string,
  apiToken?: string,
) {
  const config = buildEvolutionProviderConfig({
    provider_id: providerId,
    provider_token: apiToken,
    settings: apiUrl ? { apiUrl } : null,
  });
  return {
    apiUrl: (config.settings as { apiUrl?: string })?.apiUrl ?? "",
    apiToken: config.provider_token ?? "",
  };
}

/**
 * Atualiza a configuração de IA de um canal.
 */
export async function updateChannelAIConfig(id: string, iaConfig: any) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("crm_canais")
    .update({ ia_config: iaConfig })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/cockpit/configuracoes/canais");
  return { success: true };
}

/**
 * Alterna o status de um canal entre 'connected' e 'inactive'.
 */
export async function toggleChannelStatus(id: string, currentStatus: string) {
  const supabase = await createClient();

  const newStatus = currentStatus === "inactive" ? "connected" : "inactive";

  const { error } = await supabase
    .from("crm_canais")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/cockpit/configuracoes/canais");
  return { success: true, status: newStatus };
}

/**
 * Sincroniza o status real do canal com o provedor externo.
 * Útil para casos onde o Webhook não disparou ou está em ambiente local.
 */
export async function syncChannelStatus(id: string, provider: string, providerId: string, apiUrl?: string, apiToken?: string) {
  const supabase = await createClient();

  if (provider === 'evolution') {
    try {
      const creds = resolveEvolutionCredentials(providerId, apiUrl, apiToken);
      const state = await EvolutionApiService.getConnectionStatus(
        providerId,
        creds.apiUrl,
        creds.apiToken,
      );
      console.log(`[actions] Sincronizando status para ${providerId}: Evo State = ${state}`);
      
      let platformStatus = 'pairing';

      if (state === 'open' || state === 'connected') {
        platformStatus = 'connected';
      } else if (state === 'close' || state === 'refused' || state === 'disconnected') {
        platformStatus = 'disconnected';
      }

      const { data: current } = await supabase
        .from("crm_canais")
        .select("id, empresa_id, nome, provider, provider_id, status")
        .eq("id", id)
        .maybeSingle();

      const { error } = await supabase
        .from("crm_canais")
        .update({ status: platformStatus })
        .eq("id", id);

      if (error) throw error;

      if (current && current.status !== platformStatus) {
        const { notifyInboundChannelStatusChange } = await import(
          "@/lib/omnichannel/empresa-webhooks"
        );
        await notifyInboundChannelStatusChange({
          empresaId: current.empresa_id,
          channelId: current.id,
          channelName: current.nome,
          provider: current.provider,
          providerId: current.provider_id,
          previousStatus: current.status,
          newStatus: platformStatus,
        });
      }

      revalidatePath("/cockpit/configuracoes/canais");
      return { success: true, status: platformStatus };
    } catch (e) {
      console.error(`Erro ao sincronizar status do canal ${id}:`, e);
      return { success: false, error: String(e) };
    }
  }

  return { success: false, reason: 'Provedor não suporta sincronismo ativo' };
}

/**
 * Remove um canal e sua respectiva instância no provedor.
 */
export async function deleteChannel(id: string, provider: string, providerId: string, apiUrl?: string, apiToken?: string) {
  const supabase = await createClient();

  try {
    // 1. Remover do provedor externo se for Evolution
    if (provider === 'evolution') {
      const creds = resolveEvolutionCredentials(providerId, apiUrl, apiToken);
      await EvolutionApiService.logoutInstance(providerId, creds.apiUrl, creds.apiToken);
    }

    // 2. Remover do Supabase
    const { error } = await supabase
      .from("crm_canais")
      .delete()
      .eq("id", id);

    if (error) {
      // Código PostgreSQL 23503: restrição de chave estrangeira
      if (error.code === '23503') {
        return { 
          success: false, 
          error: "Não é possível remover este canal pois existem leads ou conversas vinculadas a ele. Remova as associações primeiro ou desative a IA." 
        };
      }
      throw error;
    }

    revalidatePath("/cockpit/configuracoes/canais");
    return { success: true };
  } catch (e: any) {
    console.error(`Erro ao deletar canal ${id}:`, e);
    return { success: false, error: e.message || "Erro desconhecido ao deletar canal." };
  }
}

/**
 * Busca um novo QR Code para uma instância existente usando as credenciais do canal.
 */
export async function getReconnectQRCode(provider: string, providerId: string, apiUrl?: string, apiToken?: string) {
  if (provider === 'evolution') {
    const creds = resolveEvolutionCredentials(providerId, apiUrl, apiToken);
    const qrcode = await EvolutionApiService.getQRCode(
      providerId,
      creds.apiUrl,
      creds.apiToken,
    );
    return { qrcode };
  }
  return { qrcode: null };
}
/**
 * Busca todos os pipelines (boards) e suas etapas para a empresa logada.
 */
export async function getPipelinesAndStages(empresaId: string) {
  console.log('[getPipelinesAndStages] Iniciando consulta para empresa:', empresaId);
  const me = await getMyProfile();
  if (!me) {
    console.error('[getPipelinesAndStages] Falha: Usuário não autenticado');
    return { success: false, error: "Usuário não autenticado" };
  }

  // Permite se for Superadmin OU se o empresa_id do usuário bater com o da query
  if (me.role_global !== 'superadmin' && me.empresa_id !== empresaId) {
    console.error('[getPipelinesAndStages] Erro de Permissão:', { me_empresa: me.empresa_id, target: empresaId });
    return { success: false, error: "Você não tem permissão para acessar os dados desta empresa." };
  }

  const supabaseAdmin = createAdminClient();

  const { data, error } = await supabaseAdmin
    .from("pipelines")
    .select(`
      id,
      nome,
      pipeline_stages (
        id,
        nome,
        ordem
      )
    `)
    .eq("empresa_id", empresaId)
    .order("nome");

  if (error) {
    console.error("[getPipelinesAndStages] Erro no Banco:", error);
    return { success: false, error: error.message };
  }

  console.log(`[getPipelinesAndStages] Sucesso: ${data?.length || 0} pipelines encontrados.`);
  return { success: true, data };
}

/**
 * Cria um canal do tipo Landing Page com configuração de roteamento.
 */
export async function createLandingPageChannel(nome: string, pipelineId: string, stageId: string, empresaId: string) {
  const supabaseAdmin = createAdminClient();

  // 1. Criar o Canal Interno
  const { data: canal, error: canalError } = await supabaseAdmin
    .from("crm_canais")
    .insert([
      {
        empresa_id: empresaId,
        nome: nome,
        tipo: 'landing-page',
        provider: 'internal',
        provider_id: `lp_${Math.random().toString(36).substring(7)}`,
        status: 'connected',
        token: crypto.randomUUID()
      }
    ])
    .select("id")
    .single();

  if (canalError) {
    console.error("Erro ao criar canal de landing page:", canalError);
    return { success: false, error: canalError.message };
  }

  // 2. Criar configuração de roteamento
  const { error: routeError } = await supabaseAdmin
    .from("crm_canais_roteamento")
    .insert([
      {
        canal_id: canal.id,
        org_id: empresaId,
        pipeline_id: pipelineId,
        stage_id: stageId
      }
    ]);

  if (routeError) {
    console.error("Erro ao criar roteamento:", routeError);
    return { success: false, error: routeError.message };
  }

  revalidatePath("/cockpit/configuracoes/canais");
  return { success: true, canalId: canal.id };
}

export async function updateLandingPageDestination(canalId: string, empresaId: string, nome: string, pipelineId: string, stageId: string) {
  const me = await getMyProfile();
  if (!me) return { success: false, error: "Usuário não autenticado" };

  if (me.role_global !== 'superadmin' && me.empresa_id !== empresaId) {
    return { success: false, error: "Sem acesso a esta empresa" };
  }

  const supabaseAdmin = createAdminClient();

  // 1. Update nome
  const { error: nomeError } = await supabaseAdmin
    .from("crm_canais")
    .update({ nome })
    .eq("id", canalId);

  if (nomeError) return { success: false, error: nomeError.message };

  // 2. Update roteamento (using logic fetch-then-insert/update to avoid unique constraint issues)
  const { data: existingRoute } = await supabaseAdmin
    .from("crm_canais_roteamento")
    .select("id")
    .eq("canal_id", canalId)
    .single();

  if (existingRoute) {
    const { error: updateError } = await supabaseAdmin
      .from("crm_canais_roteamento")
      .update({
        pipeline_id: pipelineId,
        stage_id: stageId,
      })
      .eq("id", existingRoute.id);
    
    if (updateError) {
      console.error("Erro ao atualizar roteamento:", updateError);
      return { success: false, error: updateError.message };
    }
  } else {
    const { error: insertError } = await supabaseAdmin
      .from("crm_canais_roteamento")
      .insert([
        {
          canal_id: canalId,
          org_id: empresaId,
          pipeline_id: pipelineId,
          stage_id: stageId,
        }
      ]);

    if (insertError) {
      console.error("Erro ao inserir roteamento:", insertError);
      return { success: false, error: insertError.message };
    }
  }

  revalidatePath("/cockpit/configuracoes/canais");
  return { success: true };
}
