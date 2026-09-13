'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { hasPermission } from '@/utils/permissions'
import { getMyProfile } from '@/app/(app)/cockpit/actions'

const CONFIG_PATH = '/cockpit/estoque/configuracao'

async function resolveEmpresaId(
  me: Awaited<ReturnType<typeof getMyProfile>>,
  formData?: FormData,
) {
  if (me?.role_global === 'superadmin') {
    return (formData?.get('empresa_id') as string) || me?.empresa_id || ''
  }
  return me?.empresa_id ?? ''
}

function canManageConfig(me: Awaited<ReturnType<typeof getMyProfile>>) {
  if (me?.role_global === 'superadmin') return true
  return (
    hasPermission(me, 'estoque_config', 'edit') ||
    hasPermission(me, 'estoque_config', 'create') ||
    hasPermission(me, 'estoque', 'edit') ||
    hasPermission(me, 'estoque', 'create')
  )
}

export async function saveEstoqueConfig(formData: FormData) {
  const me = await getMyProfile()
  if (!canManageConfig(me)) {
    return { error: 'Sem permissão para alterar as configurações do estoque.' }
  }

  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const nfeXmlDiretorio = ((formData.get('nfe_xml_diretorio') as string) || '').trim() || null
  const nfeXmlLocalPadraoId = (formData.get('nfe_xml_local_padrao_id') as string) || null
  const reqSaldoModo = (formData.get('req_saldo_insuficiente_modo') as string) || 'atende_parcial_pendente'
  const aprovacaoViaWorkflow = formData.get('aprovacao_via_workflow') === 'on' || formData.get('aprovacao_via_workflow') === 'true'
  const aprovacaoFunilId = (formData.get('aprovacao_funil_id') as string) || null
  const aprovacaoEstagioId = (formData.get('aprovacao_estagio_id') as string) || null

  const allowedModos = ['atende_parcial_pendente', 'nao_atende_requisicao', 'pula_item']
  if (!allowedModos.includes(reqSaldoModo)) {
    return { error: 'Modo de atendimento de saldo insuficiente inválido.' }
  }

  if (aprovacaoViaWorkflow && !aprovacaoFunilId) {
    return { error: 'Ao ativar a aprovação via Workflow, selecione o Funil de aprovação.' }
  }

  const supabase = await createClient()

  let finalEstagioId = aprovacaoEstagioId || null
  if (aprovacaoViaWorkflow && aprovacaoFunilId && !finalEstagioId) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', aprovacaoFunilId)
      .order('ordem', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstStage?.id) {
      finalEstagioId = firstStage.id
    }
  }

  const { error } = await supabase.from('est_config').upsert(
    {
      empresa_id: empresaId,
      nfe_xml_diretorio: nfeXmlDiretorio,
      nfe_xml_local_padrao_id: nfeXmlLocalPadraoId || null,
      req_saldo_insuficiente_modo: reqSaldoModo,
      aprovacao_via_workflow: aprovacaoViaWorkflow,
      aprovacao_funil_id: aprovacaoViaWorkflow ? (aprovacaoFunilId || null) : null,
      aprovacao_estagio_id: aprovacaoViaWorkflow ? finalEstagioId : null,
      updated_at: new Date().toISOString(),
      updated_by: me?.id || null,
    },
    { onConflict: 'empresa_id' }
  )

  if (error) {
    return { error: error.message }
  }

  revalidatePath(CONFIG_PATH)
  return { success: true }
}

export async function reconstruirSaldosAction(formData?: FormData) {
  const me = await getMyProfile()
  if (!canManageConfig(me)) {
    return { error: 'Sem permissão para executar recálculo de saldos de estoque.' }
  }

  const empresaId = await resolveEmpresaId(me, formData)
  if (!empresaId) return { error: 'Empresa não identificada.' }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('est_reconstruir_saldos_from_cardex', {
    p_empresa_id: empresaId,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/cockpit/estoque')
  revalidatePath(CONFIG_PATH)
  revalidatePath('/cockpit/estoque/locais')

  return { success: true, result: data }
}
