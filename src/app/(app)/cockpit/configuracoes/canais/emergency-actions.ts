'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { EvolutionApiService } from '@/lib/omnichannel/services/EvolutionApiService'
import { getOmnichannelConfig } from '@/lib/config/environment'

export async function createQuickChannel(formData: FormData) {
  const me = await getMyProfile()
  if (!me) {
     console.error("[EmergencyAction] Tentativa de criação sem autenticação")
     return;
  }

  const nome = formData.get('nome') as string || `Canal-${Math.floor(Math.random() * 1000)}`
  const empresa_id = me.empresa_id

  const supabase = await createClient()

  try {
    const debugUrl = `/cockpit/configuracoes/canais/debug?v=${Date.now()}`;
    const { environment, webhookUrl, evolutionApiUrl } = getOmnichannelConfig()
    console.log(
      `[EmergencyAction] ambiente=${environment} evolution=${evolutionApiUrl} webhook=${webhookUrl} canal=${nome}`,
    )
    
    // 1. Criar na Evolution API via Service (Static Call)
    const instanceData = await EvolutionApiService.createInstance(nome);

    if (!instanceData?.instance?.instanceId) {
       throw new Error(`Resposta inválida da Evolution: ${JSON.stringify(instanceData)}`);
    }

    console.log(`[EmergencyAction] Instância ok: ${instanceData.instance.instanceId}`);

    // 2. Salvar no Banco de Dados
    const { data: canal, error: dbError } = await supabase
      .from('crm_canais')
      .insert([{
        nome,
        empresa_id,
        provedor: 'evolution',
        status: 'disconnected',
        provider_data: {
          instance_id: instanceData.instance.instanceId,
          instance_name: instanceData.instance.instanceName,
          apikey: instanceData.hash.apikey
        }
      }])
      .select()
      .single()

    if (dbError) throw dbError

    revalidatePath('/cockpit/configuracoes/canais')
    redirect(`${debugUrl}&status=success`);
  } catch (err: any) {
    console.error("[EmergencyAction] Erro crítico:", err)
    const errMessage = encodeURIComponent(err.message || 'Erro Desconhecido');
    redirect(`/cockpit/configuracoes/canais/debug?error=${errMessage}`);
  }
}
