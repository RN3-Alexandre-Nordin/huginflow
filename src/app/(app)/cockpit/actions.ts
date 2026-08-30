'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/utils/permissions'
import { getFullPermissionsJSON } from '@/constants/permissions'
import { EvolutionApiService } from '@/lib/omnichannel/services/EvolutionApiService'

export async function createEmpresa(formData: FormData) {
  const me = await getMyProfile()
  
  // Guard: SuperAdmin RN3 ou permissão explícita 'create' no módulo 'empresas'
  if (me?.role_global !== 'superadmin' && !hasPermission(me, 'empresas', 'create')) {
    return { error: 'Acesso negado. Apenas superusuários ou usuários autorizados podem criar empresas.' }
  }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('empresas')
    .insert([{
      nome: formData.get('nome') as string,
      tipo_societario: (formData.get('tipo_societario') as string) || null,
      cnpj: formData.get('cnpj') as string || null,
      email: formData.get('email') as string || null,
      telefone: formData.get('telefone') as string || null,
      website: formData.get('website') as string || null,
      endereco: formData.get('endereco') as string || null,
      cidade: (formData.get('cidade') as string) || null,
      ramo_atividade: formData.get('ramo_atividade') as string || null,
      responsavel_nome: formData.get('responsavel_nome') as string || null,
      responsavel_cargo: formData.get('responsavel_cargo') as string || null,
      responsavel_cpf: (formData.get('responsavel_cpf') as string) || null,
      responsavel_nacionalidade: (formData.get('responsavel_nacionalidade') as string) || null,
      responsavel_estado_civil: (formData.get('responsavel_estado_civil') as string) || null,
      responsavel_profissao: (formData.get('responsavel_profissao') as string) || null,
      responsavel_email: formData.get('responsavel_email') as string || null,
      responsavel_telefone: formData.get('responsavel_telefone') as string || null,
      // Novos campos de IA (Gemini)
      ai_context_prompt: formData.get('ai_context_prompt') as string || null,
      ai_model: formData.get('ai_model') as string || 'gpt-4',
      ia_silence_timeout: Number(formData.get('ia_silence_timeout')) || 60,
      ativo: true,
      status: 'active',
    }])

  if (error) {
    console.error("Erro ao criar empresa", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/empresas')
  redirect('/cockpit/empresas')
}

export async function updateEmpresa(empresaId: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'empresas', 'edit')) {
    return { error: 'Sem permissão para editar empresas.' }
  }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('empresas')
    .update({
      nome: formData.get('nome') as string,
      tipo_societario: (formData.get('tipo_societario') as string) || null,
      cnpj: formData.get('cnpj') as string || null,
      email: formData.get('email') as string || null,
      telefone: formData.get('telefone') as string || null,
      website: formData.get('website') as string || null,
      endereco: formData.get('endereco') as string || null,
      cidade: (formData.get('cidade') as string) || null,
      ramo_atividade: formData.get('ramo_atividade') as string || null,
      responsavel_nome: formData.get('responsavel_nome') as string || null,
      responsavel_cargo: formData.get('responsavel_cargo') as string || null,
      responsavel_cpf: (formData.get('responsavel_cpf') as string) || null,
      responsavel_nacionalidade: (formData.get('responsavel_nacionalidade') as string) || null,
      responsavel_estado_civil: (formData.get('responsavel_estado_civil') as string) || null,
      responsavel_profissao: (formData.get('responsavel_profissao') as string) || null,
      responsavel_email: formData.get('responsavel_email') as string || null,
      responsavel_telefone: formData.get('responsavel_telefone') as string || null,
      // Novos campos de IA
      ai_context_prompt: formData.get('ai_context_prompt') as string || null,
      ai_model: formData.get('ai_model') as string || 'gpt-4',
      ia_silence_timeout: Number(formData.get('ia_silence_timeout')) || 60,
    })
    .eq('id', empresaId)

  if (error) {
    console.error("Erro ao atualizar empresa", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/empresas')
  revalidatePath(`/cockpit/empresas/${empresaId}/editar`)
  redirect(`/cockpit/empresas/${empresaId}/editar`)
}

export async function updateEmpresaStatus(empresaId: string, ativo: boolean) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'empresas', 'edit')) {
    return { error: 'Sem permissão para alterar status da empresa.' }
  }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('empresas')
    .update({ ativo, status: ativo ? 'active' : 'suspended' })
    .eq('id', empresaId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/cockpit/empresas')
}

export async function createDepartamento(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'departamentos', 'create')) {
    return { error: 'Sem permissão para criar departamentos.' }
  }

  const nome = formData.get('nome') as string
  const empresa_id = me?.role_global === 'superadmin' ? formData.get('empresa_id') as string : me?.empresa_id ?? ''
  const descricao = formData.get('descricao') as string

  const supabase = await createClient()

  const { error } = await supabase
    .from('departamentos')
    .insert([{ nome, empresa_id, descricao }])

  if (error) {
    console.error("Erro ao criar departamento", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/departamentos')
  redirect('/cockpit/departamentos')
}

export async function updateDepartamento(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'departamentos', 'edit')) {
    return { error: 'Sem permissão para editar departamentos.' }
  }

  const nome = formData.get('nome') as string
  const descricao = formData.get('descricao') as string
  const empresa_id = me?.role_global === 'superadmin' ? formData.get('empresa_id') as string : me?.empresa_id ?? ''

  const supabase = await createClient()

  const query = supabase
    .from('departamentos')
    .update({ nome, descricao, empresa_id })
    .eq('id', id)

  // Tenant Isolation: Impede edição de ID de outra empresa
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query

  if (error) {
    console.error("Erro ao atualizar departamento", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/departamentos')
  revalidatePath(`/cockpit/departamentos/${id}/editar`)
  redirect('/cockpit/departamentos')
}

export async function deleteDepartamento(id: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'departamentos', 'delete')) {
    return { error: 'Sem permissão para excluir departamentos.' }
  }

  const supabase = await createClient()
  const query = supabase.from('departamentos').delete().eq('id', id)
  
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query

  if (error) {
    console.error("Erro ao deletar departamento", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/departamentos')
  redirect('/cockpit/departamentos')
}

export async function deleteEmpresa(empresaId: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'empresas', 'delete')) {
    return { error: 'Sem permissão para excluir empresas.' }
  }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('empresas')
    .delete()
    .eq('id', empresaId)

  if (error) {
    console.error("Erro ao deletar empresa", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/empresas')
  redirect('/cockpit/empresas')
}

export async function createGrupoAcesso(formData: FormData) {
  const nome = formData.get('nome') as string
  const descricao = formData.get('descricao') as string
  const is_admin = formData.get('is_admin') === 'true'
  const permissoesStr = formData.get('permissoes') as string
  
  // Se for admin, ignora o que veio do front e gera o JSON completo
  const permissoes = is_admin 
    ? getFullPermissionsJSON() 
    : JSON.parse(permissoesStr || '{}')

  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  // 1. Obter perfil do usuário com grupo e permissões
  const { data: me } = await supabase
    .from('usuarios')
    .select('*, grupos_acesso(is_admin, permissoes)')
    .eq('auth_user_id', authUser?.id ?? '')
    .single()

  // 2. RBAC: Validar permissão de criação
  if (!hasPermission(me, 'grupos', 'create')) {
    return { error: 'Você não tem permissão para criar grupos de acesso.' }
  }

  // 3. Isolamento de Tenant (Segurança Crítica)
  let empresa_id = formData.get('empresa_id') as string
  if (me?.role_global !== 'superadmin') {
    empresa_id = me?.empresa_id ?? ''
  }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('grupos_acesso')
    .insert([{ nome, descricao, empresa_id, permissoes, is_admin }])

  if (error) {
    console.error("Erro ao criar grupo", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/grupos')
  redirect('/cockpit/grupos')
}

export async function updateGrupoAcesso(id: string, formData: FormData) {
  const nome = formData.get('nome') as string
  const descricao = formData.get('descricao') as string
  const is_admin = formData.get('is_admin') === 'true'
  const permissoesStr = formData.get('permissoes') as string
  
  // Se for admin, ignora o que veio do front e gera o JSON completo
  const permissoes = is_admin 
    ? getFullPermissionsJSON() 
    : JSON.parse(permissoesStr || '{}')

  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  // 1. Obter perfil do usuário
  const { data: me } = await supabase
    .from('usuarios')
    .select('*, grupos_acesso(is_admin, permissoes)')
    .eq('auth_user_id', authUser?.id ?? '')
    .single()

  // 2. RBAC: Validar permissão de edição
  if (!hasPermission(me, 'grupos', 'edit')) {
    return { error: 'Você não tem permissão para editar este grupo.' }
  }

  // 3. Isolamento de Tenant (Segurança Crítica)
  let empresa_id = formData.get('empresa_id') as string
  if (me?.role_global !== 'superadmin') {
    empresa_id = me?.empresa_id ?? ''
  }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('grupos_acesso')
    .update({ nome, descricao, empresa_id, permissoes, is_admin })
    .eq('id', id)

  if (error) {
    console.error("Erro ao atualizar grupo", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/grupos')
  revalidatePath(`/cockpit/grupos/${id}/editar`)
  redirect('/cockpit/grupos')
}

export async function deleteGrupoAcesso(id: string) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  // 1. Obter perfil do usuário
  const { data: me } = await supabase
    .from('usuarios')
    .select('*, grupos_acesso(is_admin, permissoes)')
    .eq('auth_user_id', authUser?.id ?? '')
    .single()

  // 2. RBAC: Validar permissão de exclusão
  if (!hasPermission(me, 'grupos', 'delete')) {
    return { error: 'Você não tem permissão para excluir este grupo.' }
  }

  // 3. Isolamento de Tenant
  const supabaseAdmin = createAdminClient()
  const query = supabaseAdmin.from('grupos_acesso').delete().eq('id', id)
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query

  if (error) {
    console.error("Erro ao deletar grupo", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/grupos')
  redirect('/cockpit/grupos')
}

export async function createUsuario(formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'usuarios', 'invite')) {
    return { error: 'Sem permissão para convidar/criar usuários.' }
  }

  const email = formData.get('email') as string
  const senha = formData.get('senha') as string
  const nome_completo = formData.get('nome_completo') as string
  const empresa_id = me?.role_global === 'superadmin' ? formData.get('empresa_id') as string : me?.empresa_id ?? ''
  const role_global = formData.get('role_global') as string
  const grupo_id = formData.get('grupo_id') as string || null
  const telefone = formData.get('telefone') as string || null
  const ramal = formData.get('ramal') as string || null
  const endereco = formData.get('endereco') as string || null
  const data_nascimento = formData.get('data_nascimento') as string || null

  const supabaseAdmin = createAdminClient()

  if (!email?.trim() || !senha || !nome_completo?.trim() || !empresa_id || !role_global) {
    return { error: 'Preencha e-mail, senha, nome, empresa e perfil.' }
  }
  if (senha.length < 6) {
    return { error: 'A senha deve ter no mínimo 6 caracteres.' }
  }

  // Criar usuário diretamente no Auth sem enviar e-mail de convite
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: senha,
    email_confirm: true, // Confirma imediatamente, sem necessidade de verificação por e-mail
    user_metadata: { nome_completo, role_global }
  })
  
  if (authError) {
    console.error("Erro ao criar usuário no Auth", authError)
    return { error: authError.message }
  }

  const authUserId = authData.user.id
  const supabase = await createClient()
  const { error } = await supabase.from('usuarios').insert([{
    id: authUserId,
    auth_user_id: authUserId,
    email: email.trim().toLowerCase(),
    nome_completo,
    empresa_id,
    role_global,
    grupo_id,
    telefone,
    ramal,
    endereco,
    data_nascimento,
    must_change_password: true,
  }])

  if (error) {
    console.error("Erro ao criar perfil de usuário", error)
    // Evita usuário órfão no Auth (login existe sem linha em usuarios)
    const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(authUserId)
    if (rollbackError) {
      console.error('Rollback Auth falhou após erro no perfil:', rollbackError)
      return {
        error: `${error.message} (Auth criado; limpeza falhou — contate suporte com e-mail ${email})`,
      }
    }
    return { error: error.message }
  }

  revalidatePath('/cockpit/usuarios')
  redirect('/cockpit/usuarios')
}

export async function updateUsuario(id: string, formData: FormData) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'usuarios', 'edit')) {
    return { error: 'Sem permissão para editar usuários.' }
  }

  const nome_completo = formData.get('nome_completo') as string
  const role_global = formData.get('role_global') as string
  const grupo_id = formData.get('grupo_id') as string || null
  const empresa_id = me?.role_global === 'superadmin' ? formData.get('empresa_id') as string : me?.empresa_id ?? ''
  const is_superuser_raw = formData.get('is_superuser')
  const is_superuser = is_superuser_raw === 'true'
  const telefone = formData.get('telefone') as string || null
  const ramal = formData.get('ramal') as string || null
  const endereco = formData.get('endereco') as string || null
  const data_nascimento = formData.get('data_nascimento') as string || null
  const nova_senha = (formData.get('nova_senha') as string)?.trim() ?? ''
  const confirmar_senha = (formData.get('confirmar_senha') as string)?.trim() ?? ''

  const supabase = await createClient()

  const { data: target, error: targetError } = await supabase
    .from('usuarios')
    .select('auth_user_id, empresa_id, role_global')
    .eq('id', id)
    .single()

  if (targetError || !target) {
    return { error: 'Usuário não encontrado.' }
  }

  if (me?.role_global !== 'superadmin' && target.empresa_id !== me?.empresa_id) {
    return { error: 'Sem permissão para editar este usuário.' }
  }

  if (target.role_global === 'superadmin' && me?.role_global !== 'superadmin') {
    return { error: 'Sem permissão para alterar este usuário.' }
  }

  if (nova_senha || confirmar_senha) {
    if (nova_senha !== confirmar_senha) {
      return { error: 'As senhas não coincidem.' }
    }
    if (nova_senha.length < 6) {
      return { error: 'A senha deve ter no mínimo 6 caracteres.' }
    }
    if (!target.auth_user_id) {
      return { error: 'Usuário sem conta de login vinculada.' }
    }
  }

  // Build update payload - only include is_superuser if it was explicitly sent
  const updatePayload: Record<string, unknown> = { nome_completo, role_global, grupo_id, empresa_id, telefone, ramal, endereco, data_nascimento }
  if (is_superuser_raw !== null) {
    updatePayload.is_superuser = is_superuser
  }

  const { error } = await supabase
    .from('usuarios')
    .update(updatePayload)
    .eq('id', id)

  if (error) {
    console.error("Erro ao atualizar usuário", error)
    return { error: error.message }
  }

  if (nova_senha) {
    const supabaseAdmin = createAdminClient()
    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(target.auth_user_id, {
      password: nova_senha,
    })
    if (pwError) {
      console.error('Erro ao atualizar senha do usuário', pwError)
      return { error: pwError.message }
    }

    const { error: flagError } = await supabase
      .from('usuarios')
      .update({ must_change_password: true })
      .eq('id', id)

    if (flagError) {
      console.error('Erro ao marcar troca de senha obrigatória', flagError)
    }
  }

  revalidatePath('/cockpit/usuarios')
  revalidatePath(`/cockpit/usuarios/${id}/editar`)
  redirect('/cockpit/usuarios')
}

export async function deleteUsuario(id: string, auth_user_id: string) {
  const me = await getMyProfile()
  if (!hasPermission(me, 'usuarios', 'delete')) {
    return { error: 'Sem permissão para excluir usuários.' }
  }

  const supabaseAdmin = createAdminClient()

  if (auth_user_id) {
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(auth_user_id)
    if (authError) {
      console.error("Erro ao deletar usuário no Auth", authError)
      return { error: authError.message }
    }
  }

  const supabase = await createClient()
  const query = supabase.from('usuarios').delete().eq('id', id)
  
  if (me?.role_global !== 'superadmin') {
    query.eq('empresa_id', me?.empresa_id ?? '')
  }

  const { error } = await query

  if (error) {
    console.error("Erro ao deletar perfil de usuário", error)
    return { error: error.message }
  }

  revalidatePath('/cockpit/usuarios')
  redirect('/cockpit/usuarios')
}

export async function getMyProfile() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null

  const { data: me } = await supabase
    .from('usuarios')
    .select('*, grupos_acesso(is_admin, permissoes)')
    .eq('auth_user_id', authUser.id)
    .single()
    
  return me
}


export async function getWorkflowActivities(userId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }

  const supabase = await createClient()

  // Buscar todos os cards assigned to user que não estão finalizados
  const { data, error } = await supabase
    .from('crm_cards')
    .select(`
      id,
      titulo,
      data_prazo,
      pipeline_id,
      stage_id,
      pipelines (
        nome
      ),
      pipeline_stages (
        nome
      )
    `)
    .eq('responsavel_id', userId)
    .eq('finalizado', false)
    .order('data_prazo', { ascending: true })

  if (error) {
    console.error("Erro ao buscar atividades de workflow", error)
    return { error: error.message }
  }

  return { data }
}



export async function getCockpitMetrics(userId: string) {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }

  const supabase = await createClient()

  // 1. Cards Atrasados (Data estritamente antes de hoje na DB)
  const { count: countAtrasados } = await supabase
    .from('crm_cards')
    .select('*', { count: 'exact', head: true })
    .eq('responsavel_id', userId)
    .eq('finalizado', false)
    .filter('data_prazo', 'lt', 'now()') // Postgres handles 'now()' effectively relative to current_date if it's timestamp

  // Para bater EXATAMENTE com o SQL do usuário: data_prazo < current_date
  // Usamos a data local do servidor (ou passada pelo cliente se necessário)
  const todayStr = new Date().toISOString().split('T')[0];

  const { count: countAtrasadosFinal } = await supabase
    .from('crm_cards')
    .select('*', { count: 'exact', head: true })
    .eq('responsavel_id', userId)
    .eq('finalizado', false)
    .lt('data_prazo', todayStr)

  const { count: countHoje } = await supabase
    .from('crm_cards')
    .select('*', { count: 'exact', head: true })
    .eq('responsavel_id', userId)
    .eq('finalizado', false)
    .gte('data_prazo', todayStr)
    .lt('data_prazo', new Date(new Date(todayStr).getTime() + 86400000).toISOString().split('T')[0])

  // Contador de Movimentações (Status Changed) de HOJE feito por este usuário
  const { count: countMovimentacoes } = await supabase
    .from('crm_cards_history')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .eq('acao', 'STATUS_CHANGED')
    .gte('created_at', todayStr)

  // Gargalo Atual: Contagem de cards ativos por estágio
  const { data: bottleneckData } = await getCockpitBottleneck(userId)
  const winner = bottleneckData && bottleneckData.length > 0 ? bottleneckData[0] : null
  const bottleneckStr = winner ? `${winner.count} em ${winner.stageName}` : 'Fluindo'

  return { 
    data: {
      atrasados: countAtrasadosFinal || 0,
      hoje: countHoje || 0,
      movimentacoes: countMovimentacoes || 0,
      gargalo: bottleneckStr,
      chats: 12 
    }
  }
}

export async function getCockpitBottleneck(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('crm_cards')
    .select(`
      stage_id,
      pipeline_id,
      pipeline_stages ( nome )
    `)
    .eq('responsavel_id', userId)
    .eq('finalizado', false)

  if (error) {
     console.error("Erro ao buscar gargalos", error)
     return { error: error.message }
  }

  // Agrupamento manual em JS (eficiente para volumes típicos de cockpit)
  const grouping: Record<string, { stageName: string, count: number, pipelineId: string, stageId: string }> = {}
  
  data.forEach((card: any) => {
     const sId = card.stage_id
     if (!grouping[sId]) {
        grouping[sId] = {
           stageId: sId,
           stageName: card.pipeline_stages?.nome || 'Sem Nome',
           count: 0,
           pipelineId: card.pipeline_id
        }
     }
     grouping[sId].count++
  })

  const sorted = Object.values(grouping).sort((a,b) => b.count - a.count)

  return { data: sorted }
}

export async function getTodayMovementsDetails(userId: string) {
  const supabase = await createClient()
  const todayStr = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('crm_cards_history')
    .select(`
      id,
      created_at,
      card_id,
      acao,
      crm_cards (
        titulo,
        pipeline_id
      ),
      de_stage:pipeline_stages!de_stage_id ( nome ),
      para_stage:pipeline_stages!para_stage_id ( nome )
    `)
    .eq('usuario_id', userId)
    .eq('acao', 'STATUS_CHANGED')
    .gte('created_at', todayStr)
    .order('created_at', { ascending: false })

  if (error) {
     console.error("Erro ao buscar histórico de hoje", error)
     return { error: error.message }
  }

  return { data }
}

export type ManagerDashboardMetrics = {
  vendasMes: number
  vendasVariacaoPct: number | null
  leadsNoFunil: number
  chatsOperacionais: number
  gargalos: number
}

export type ManagerChartPeriodo = 'dia' | 'semana' | 'mes'

export type ManagerChartMetric = 'conversao' | 'entrada' | 'receita' | 'whatsapp'

export type ManagerChartPoint = {
  label: string
  valor: number
  criados: number
  concluidos: number
  receita: number
  threads: number
}

export type ManagerChartResponse = {
  titulo: string
  subtitulo: string
  metrica: ManagerChartMetric
  unidade: 'percent' | 'count' | 'currency'
  pontos: ManagerChartPoint[]
}

const GARGALO_MIN_CARDS = 3
const CHATS_JANELA_DIAS = 30
const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const

function startOfTodayLocal(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function startOfCurrentWeekLocal(): Date {
  const today = startOfTodayLocal()
  const day = today.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset)
  return monday
}

function startOfCurrentMonthLocal(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function isBetween(isoDate: string, start: Date, end: Date): boolean {
  const time = new Date(isoDate).getTime()
  return time >= start.getTime() && time < end.getTime()
}

function buildChartBuckets(periodo: ManagerChartPeriodo): ManagerChartPoint[] {
  const now = new Date()

  if (periodo === 'dia') {
    return Array.from({ length: 6 }, (_, index) => ({
      label: `${String(index * 4).padStart(2, '0')}h`,
      valor: 0,
      criados: 0,
      concluidos: 0,
      receita: 0,
      threads: 0,
    }))
  }

  if (periodo === 'semana') {
    return WEEKDAY_LABELS.map((label) => ({
      label,
      valor: 0,
      criados: 0,
      concluidos: 0,
      receita: 0,
      threads: 0,
    }))
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, index) => ({
    label: String(index + 1),
    valor: 0,
    criados: 0,
    concluidos: 0,
    receita: 0,
    threads: 0,
  }))
}

function getChartMetricMeta(metrica: ManagerChartMetric): {
  subtitulo: string
  unidade: ManagerChartResponse['unidade']
} {
  switch (metrica) {
    case 'entrada':
      return {
        subtitulo: 'Novos cards adicionados ao funil no período.',
        unidade: 'count',
      }
    case 'receita':
      return {
        subtitulo: 'Valor total dos negócios fechados no período.',
        unidade: 'currency',
      }
    case 'whatsapp':
      return {
        subtitulo: 'Threads únicos de WhatsApp com atividade no período.',
        unidade: 'count',
      }
    case 'conversao':
    default:
      return {
        subtitulo: 'Taxa de cards concluídos sobre cards criados no período.',
        unidade: 'percent',
      }
  }
}

function applyMetricValues(pontos: ManagerChartPoint[], metrica: ManagerChartMetric) {
  for (const ponto of pontos) {
    if (metrica === 'entrada') {
      ponto.valor = ponto.criados
    } else if (metrica === 'receita') {
      ponto.valor = ponto.receita
    } else if (metrica === 'whatsapp') {
      ponto.valor = ponto.threads
    } else {
      ponto.valor = ponto.criados > 0 ? Math.round((ponto.concluidos / ponto.criados) * 100) : 0
    }
  }
}

function getBucketIndex(isoDate: string, periodo: ManagerChartPeriodo): number {
  const date = new Date(isoDate)

  if (periodo === 'dia') {
    return Math.min(Math.floor(date.getHours() / 4), 5)
  }

  if (periodo === 'semana') {
    const day = date.getDay()
    return day === 0 ? 6 : day - 1
  }

  return date.getDate() - 1
}

function getChartPeriodRange(periodo: ManagerChartPeriodo): { start: Date; end: Date; titulo: string } {
  const now = new Date()
  const today = startOfTodayLocal()

  if (periodo === 'dia') {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    return {
      start: today,
      end,
      titulo: `Hoje (${today.toLocaleDateString('pt-BR')})`,
    }
  }

  if (periodo === 'semana') {
    const start = startOfCurrentWeekLocal()
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    return {
      start,
      end,
      titulo: `Semana atual (${start.toLocaleDateString('pt-BR')} – ${new Date(end.getTime() - 1).toLocaleDateString('pt-BR')})`,
    }
  }

  const start = startOfCurrentMonthLocal()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const monthName = start.toLocaleDateString('pt-BR', { month: 'long' })
  return {
    start,
    end,
    titulo: `Mês atual (${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${start.getFullYear()})`,
  }
}

function sumCardValues(cards: { valor?: number | null }[] | null): number {
  return (cards ?? []).reduce((total, card) => total + Number(card.valor ?? 0), 0)
}

export async function getManagerDashboardChart(
  periodo: ManagerChartPeriodo,
  metrica: ManagerChartMetric = 'conversao',
): Promise<{
  data?: ManagerChartResponse
  error?: string
}> {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }

  const empresaId = me.empresa_id
  if (!empresaId) return { error: 'Empresa não vinculada ao perfil.' }

  const { start, end, titulo } = getChartPeriodRange(periodo)
  const { subtitulo, unidade } = getChartMetricMeta(metrica)
  const supabase = await createClient()
  const pontos = buildChartBuckets(periodo)

  const needsCards = metrica !== 'whatsapp'
  const needsConversas = metrica === 'whatsapp'

  const [cardsResult, conversasResult] = await Promise.all([
    needsCards
      ? supabase
          .from('crm_cards')
          .select('created_at, updated_at, finalizado, valor')
          .eq('empresa_id', empresaId)
          .or(
            `and(created_at.gte.${start.toISOString()},created_at.lt.${end.toISOString()}),and(finalizado.eq.true,updated_at.gte.${start.toISOString()},updated_at.lt.${end.toISOString()})`,
          )
      : Promise.resolve({ data: null, error: null }),
    needsConversas
      ? supabase
          .from('crm_conversas')
          .select('sessao_id, created_at')
          .eq('empresa_id', empresaId)
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
      : Promise.resolve({ data: null, error: null }),
  ])

  if (cardsResult.error) {
    console.error('[ManagerDashboard] chart cards:', cardsResult.error.message)
    return { error: cardsResult.error.message }
  }

  if (conversasResult.error) {
    console.error('[ManagerDashboard] chart conversas:', conversasResult.error.message)
    return { error: conversasResult.error.message }
  }

  for (const card of cardsResult.data ?? []) {
    if (isBetween(card.created_at, start, end)) {
      const bucket = getBucketIndex(card.created_at, periodo)
      pontos[bucket].criados++
    }

    if (card.finalizado && card.updated_at && isBetween(card.updated_at, start, end)) {
      const bucket = getBucketIndex(card.updated_at, periodo)
      pontos[bucket].concluidos++
      pontos[bucket].receita += Number(card.valor ?? 0)
    }
  }

  if (needsConversas) {
    const threadsPorBucket = pontos.map(() => new Set<string>())
    for (const conversa of conversasResult.data ?? []) {
      if (!conversa.sessao_id || !isBetween(conversa.created_at, start, end)) continue
      const bucket = getBucketIndex(conversa.created_at, periodo)
      threadsPorBucket[bucket].add(conversa.sessao_id)
    }
    pontos.forEach((ponto, index) => {
      ponto.threads = threadsPorBucket[index].size
    })
  }

  applyMetricValues(pontos, metrica)

  return {
    data: {
      titulo,
      subtitulo,
      metrica,
      unidade,
      pontos,
    },
  }
}

export async function getManagerDashboardMetrics(): Promise<{
  data?: ManagerDashboardMetrics
  error?: string
}> {
  const me = await getMyProfile()
  if (!me) return { error: 'Não autenticado' }

  const empresaId = me.empresa_id
  if (!empresaId) return { error: 'Empresa não vinculada ao perfil.' }

  const supabase = await createClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const chatsSince = new Date(now)
  chatsSince.setDate(chatsSince.getDate() - CHATS_JANELA_DIAS)

  const [
    vendasMesResult,
    vendasMesAnteriorResult,
    leadsResult,
    chatsResult,
    cardsAtivosResult,
  ] = await Promise.all([
    supabase
      .from('crm_cards')
      .select('valor')
      .eq('empresa_id', empresaId)
      .eq('finalizado', true)
      .gte('updated_at', startOfMonth.toISOString())
      .lt('updated_at', startOfNextMonth.toISOString()),
    supabase
      .from('crm_cards')
      .select('valor')
      .eq('empresa_id', empresaId)
      .eq('finalizado', true)
      .gte('updated_at', startOfPrevMonth.toISOString())
      .lt('updated_at', startOfMonth.toISOString()),
    supabase
      .from('crm_cards')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('finalizado', false),
    supabase
      .from('crm_conversas')
      .select('sessao_id')
      .eq('empresa_id', empresaId)
      .gte('created_at', chatsSince.toISOString()),
    supabase
      .from('crm_cards')
      .select('stage_id')
      .eq('empresa_id', empresaId)
      .eq('finalizado', false),
  ])

  const vendasMes = sumCardValues(vendasMesResult.data)
  const vendasMesAnterior = sumCardValues(vendasMesAnteriorResult.data)
  let vendasVariacaoPct: number | null = null
  if (vendasMesAnterior > 0) {
    vendasVariacaoPct = ((vendasMes - vendasMesAnterior) / vendasMesAnterior) * 100
  } else if (vendasMes > 0) {
    vendasVariacaoPct = 100
  }

  const chatsOperacionais = new Set(
    (chatsResult.data ?? []).map((row) => row.sessao_id).filter(Boolean),
  ).size

  const stageCounts: Record<string, number> = {}
  for (const card of cardsAtivosResult.data ?? []) {
    if (!card.stage_id) continue
    stageCounts[card.stage_id] = (stageCounts[card.stage_id] ?? 0) + 1
  }
  const gargalos = Object.values(stageCounts).filter((count) => count >= GARGALO_MIN_CARDS).length

  return {
    data: {
      vendasMes,
      vendasVariacaoPct,
      leadsNoFunil: leadsResult.count ?? 0,
      chatsOperacionais,
      gargalos,
    },
  }
}

export async function getGruposByEmpresa(empresaId: string) {
  const me = await getMyProfile()
  if (!me) return []

  // Ensure user is superadmin OR belongs to the same tenant
  if (me.role_global !== 'superadmin' && me.empresa_id !== empresaId) {
    return []
  }

  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('grupos_acesso')
    .select('id, nome, empresa_id')
    .eq('empresa_id', empresaId)
    .order('nome')

  if (error) {
    console.error("Erro getGruposByEmpresa", error)
  }

  return data || []
}
