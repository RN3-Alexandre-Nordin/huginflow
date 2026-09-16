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
  const reqPlanilhaAutoAtender =
    formData.get('req_planilha_auto_atender') === 'on' ||
    formData.get('req_planilha_auto_atender') === 'true'
  const aprovacaoViaWorkflow = formData.get('aprovacao_via_workflow') === 'on' || formData.get('aprovacao_via_workflow') === 'true'
  const aprovacaoFunilId = (formData.get('aprovacao_funil_id') as string) || null
  const aprovacaoEstagioId = (formData.get('aprovacao_estagio_id') as string) || null

  const reqAprovacaoAtiva =
    formData.get('req_aprovacao_ativa') === 'on' ||
    formData.get('req_aprovacao_ativa') === 'true'
  const reqAprovadorUsuarioId = ((formData.get('req_aprovador_usuario_id') as string) || '').trim() || null
  const reqValorMinimoRaw = (formData.get('req_aprovacao_valor_minimo') as string) || '0'
  const reqAprovacaoValorMinimo = Number(String(reqValorMinimoRaw).replace(',', '.'))

  const allowedModos = ['atende_parcial_pendente', 'nao_atende_requisicao', 'pula_item']
  if (!allowedModos.includes(reqSaldoModo)) {
    return { error: 'Modo de atendimento de saldo insuficiente inválido.' }
  }

  if (Number.isNaN(reqAprovacaoValorMinimo) || reqAprovacaoValorMinimo < 0) {
    return { error: 'Valor mínimo de aprovação inválido (use 0 ou um número positivo).' }
  }

  if (reqAprovacaoAtiva && !reqAprovadorUsuarioId) {
    return { error: 'Ao exigir aprovação, selecione o usuário aprovador.' }
  }

  if (aprovacaoViaWorkflow && !aprovacaoFunilId) {
    return { error: 'Ao ativar a aprovação via Workflow, selecione o Funil de aprovação.' }
  }

  const supabase = await createClient()

  if (reqAprovacaoAtiva && reqAprovadorUsuarioId) {
    const { data: aprovadorOk } = await supabase
      .from('usuarios')
      .select('id')
      .eq('id', reqAprovadorUsuarioId)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .maybeSingle()
    if (!aprovadorOk && me?.role_global !== 'superadmin') {
      return { error: 'Aprovador inválido ou inativo nesta empresa.' }
    }
  }

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
      req_planilha_auto_atender: reqPlanilhaAutoAtender,
      req_aprovacao_ativa: reqAprovacaoAtiva,
      req_aprovador_usuario_id: reqAprovacaoAtiva ? reqAprovadorUsuarioId : null,
      req_aprovacao_valor_minimo: reqAprovacaoValorMinimo,
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
