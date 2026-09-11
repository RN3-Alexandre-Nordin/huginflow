import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertDevTestTarget, getBaseUrl, getTestEmail, getTestTenantId } from './env'

type Cleanup = () => Promise<void>

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Fase 3 exige ${name}`)
  return value
}

function adminClient() {
  if (process.env.TEST_ALLOW_MUTATIONS !== '1') {
    throw new Error('Fase 3 mutável exige TEST_ALLOW_MUTATIONS=1')
  }
  assertDevTestTarget()
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function profile(admin: SupabaseClient) {
  const { data, error } = await admin
    .from('usuarios')
    .select('id, empresa_id, role_global, email')
    .eq('email', getTestEmail())
    .eq('empresa_id', getTestTenantId())
    .single()
  if (error || !data?.empresa_id) throw new Error(`Perfil da fixture: ${error?.message ?? 'ausente'}`)
  if (data.role_global === 'superadmin') {
    throw new Error('Testes tenant/RBAC não podem usar superadmin')
  }
  const expected = getTestTenantId()
  if (expected !== data.empresa_id) {
    throw new Error(`TEST_TENANT_ID ${expected} difere do perfil ${data.empresa_id}`)
  }
  return data
}

async function removeExact(
  admin: SupabaseClient,
  table: string,
  tenantColumn: string,
  tenantId: string,
  ids: string[],
) {
  if (!ids.length) return
  const { error } = await admin
    .from(table)
    .delete()
    .eq(tenantColumn, tenantId)
    .in('id', ids)
  if (error) throw new Error(`cleanup ${table}: ${error.message}`)
}

export async function createRestrictedUserFixture() {
  const admin = adminClient()
  const me = await profile(admin)
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const email = `phase3-restricted-${suffix}@teste.huginflow.com`
  const password = `P3!${randomUUID()}aA`
  let groupId = ''
  let authId = ''

  const cleanup: Cleanup = async () => {
    if (authId) {
      await admin.from('usuarios').delete().eq('id', authId).eq('empresa_id', me.empresa_id)
      await admin.auth.admin.deleteUser(authId)
    }
    if (groupId) {
      await admin.from('grupos_acesso').delete().eq('id', groupId).eq('empresa_id', me.empresa_id)
    }
  }

  try {
    const { data: group, error: groupError } = await admin
      .from('grupos_acesso')
      .insert({
        empresa_id: me.empresa_id,
        nome: `[agent-phase3] Restrito ${suffix}`,
        descricao: 'Fixture efêmera de RBAC',
        is_admin: false,
        permissoes: { leads: ['view'] },
      })
      .select('id')
      .single()
    if (groupError) throw groupError
    groupId = group.id

    const { data: auth, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome_completo: `Restrito ${suffix}`, role_global: 'operador' },
    })
    if (authError || !auth.user) throw authError ?? new Error('Auth user ausente')
    authId = auth.user.id

    const { error: userError } = await admin.from('usuarios').insert({
      id: authId,
      auth_user_id: authId,
      email,
      nome_completo: `Restrito ${suffix}`,
      empresa_id: me.empresa_id,
      role_global: 'operador',
      grupo_id: groupId,
      ativo: true,
      must_change_password: false,
    })
    if (userError) throw userError

    return { email, password, tenantId: me.empresa_id, cleanup }
  } catch (error) {
    await cleanup().catch(() => {})
    throw error
  }
}

export async function createCrossTenantPipelineFixture() {
  const admin = adminClient()
  await profile(admin)
  const suffix = randomUUID().slice(0, 8)
  const { data: other, error: otherError } = await admin
    .from('empresas')
    .insert({ nome: `[agent-phase3] Tenant negativo ${suffix}`, ativo: true, status: 'active' })
    .select('id')
    .single()
  if (otherError || !other) throw new Error(`Criar tenant negativo: ${otherError?.message ?? 'ausente'}`)

  const name = `[agent-phase3] Outro tenant ${suffix}`
  const { data: pipeline, error } = await admin
    .from('pipelines')
    .insert({ empresa_id: other.id, nome: name, descricao: name, is_public: true })
    .select('id')
    .single()
  if (error) {
    await admin.from('empresas').delete().eq('id', other.id)
    throw error
  }
  const { error: stageError } = await admin
    .from('pipeline_stages')
    .insert({ pipeline_id: pipeline.id, nome: 'ETAPA', ordem: 0, cor: '#2BAADF' })
  if (stageError) {
    await admin.from('pipelines').delete().eq('id', pipeline.id).eq('empresa_id', other.id)
    await admin.from('empresas').delete().eq('id', other.id)
    throw stageError
  }

  const cleanup: Cleanup = async () => {
    const errors: string[] = []
    const pipelineDelete = await admin
      .from('pipelines')
      .delete()
      .eq('id', pipeline.id)
      .eq('empresa_id', other.id)
    if (pipelineDelete.error) errors.push(pipelineDelete.error.message)
    const companyDelete = await admin.from('empresas').delete().eq('id', other.id)
    if (companyDelete.error) errors.push(companyDelete.error.message)
    if (errors.length) throw new Error(`cleanup tenant negativo: ${errors.join('; ')}`)
  }
  return { pipelineId: pipeline.id, pipelineName: name, cleanup }
}

export async function createMoveCardFixture() {
  const admin = adminClient()
  const me = await profile(admin)
  const { data: pipelines, error } = await admin
    .from('pipelines')
    .select('id, pipeline_stages(id, ordem)')
    .eq('empresa_id', me.empresa_id)
  if (error) throw error
  const pipeline = (pipelines ?? []).find(
    (item) => Array.isArray(item.pipeline_stages) && item.pipeline_stages.length >= 2,
  )
  if (!pipeline) throw new Error('Tenant precisa de funil com dois estágios')
  const stages = [...pipeline.pipeline_stages].sort((a, b) => a.ordem - b.ordem)
  const title = `[agent-phase3] Move ${randomUUID().slice(0, 8)}`
  const { data: card, error: cardError } = await admin
    .from('crm_cards')
    .insert({
      empresa_id: me.empresa_id,
      pipeline_id: pipeline.id,
      stage_id: stages[0].id,
      titulo: title,
      finalizado: false,
      stage_entered_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (cardError) throw cardError

  const cleanup: Cleanup = async () => {
    await admin.from('crm_cards').delete().eq('id', card.id).eq('empresa_id', me.empresa_id)
  }
  return {
    tenantId: me.empresa_id,
    pipelineId: pipeline.id,
    cardId: card.id,
    fromStageId: stages[0].id,
    toStageId: stages[1].id,
    cleanup,
  }
}

export async function createMultiSessionFixture() {
  const admin = adminClient()
  const me = await profile(admin)
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const leadName = `[agent-phase3] Lead multi ${suffix}`
  const phone = `55119${Date.now().toString().slice(-8)}`
  const ids = {
    departments: [] as string[],
    pipelines: [] as string[],
    cards: [] as string[],
    sessions: [randomUUID(), randomUUID()],
    conversations: [] as string[],
    lead: '',
    channel: '',
  }

  const cleanup: Cleanup = async () => {
    const interactions = await admin
      .from('crm_interacoes')
      .delete()
      .eq('empresa_id', me.empresa_id)
      .in('conversa_id', ids.sessions)
    if (interactions.error) throw new Error(`cleanup crm_interacoes: ${interactions.error.message}`)
    const conversations = await admin
      .from('crm_conversas')
      .delete()
      .eq('empresa_id', me.empresa_id)
      .in('sessao_id', ids.sessions)
    if (conversations.error) {
      throw new Error(`cleanup crm_conversas: ${conversations.error.message}`)
    }
    await removeExact(admin, 'crm_chat_threads', 'empresa_id', me.empresa_id, ids.sessions)
    await removeExact(admin, 'crm_cards', 'empresa_id', me.empresa_id, ids.cards)
    await removeExact(admin, 'pipelines', 'empresa_id', me.empresa_id, ids.pipelines)
    if (ids.lead) await removeExact(admin, 'crm_leads', 'empresa_id', me.empresa_id, [ids.lead])
    await removeExact(admin, 'departamentos', 'empresa_id', me.empresa_id, ids.departments)
    if (ids.channel) await removeExact(admin, 'crm_canais', 'empresa_id', me.empresa_id, [ids.channel])
  }

  try {
    const { data: departments, error: departmentError } = await admin
      .from('departamentos')
      .insert([
        { empresa_id: me.empresa_id, nome: `Comercial P3 ${suffix}`, descricao: 'Fixture' },
        { empresa_id: me.empresa_id, nome: `Financeiro P3 ${suffix}`, descricao: 'Fixture' },
      ])
      .select('id')
    if (departmentError || !departments) throw departmentError ?? new Error('Departamentos ausentes')
    ids.departments.push(...departments.map((item) => item.id))

    const { data: pipelines, error: pipelineError } = await admin
      .from('pipelines')
      .insert(
        ids.departments.map((departmentId, index) => ({
          empresa_id: me.empresa_id,
          departamento_id: departmentId,
          nome: `[agent-phase3] Funil ${index + 1} ${suffix}`,
          is_public: true,
        })),
      )
      .select('id')
    if (pipelineError || !pipelines) throw pipelineError ?? new Error('Funis ausentes')
    ids.pipelines.push(...pipelines.map((item) => item.id))

    const { data: stages, error: stageError } = await admin
      .from('pipeline_stages')
      .insert(
        ids.pipelines.map((pipelineId) => ({
          pipeline_id: pipelineId,
          nome: 'ENTRADA',
          ordem: 0,
          cor: '#2BAADF',
        })),
      )
      .select('id, pipeline_id')
    if (stageError || !stages) throw stageError ?? new Error('Estágios ausentes')

    const { data: channel, error: channelError } = await admin
      .from('crm_canais')
      .insert({
        empresa_id: me.empresa_id,
        nome: `[agent-phase3] Canal ${suffix}`,
        tipo: 'whatsapp',
        provider: 'simulator',
        provider_id: `phase3-${suffix}`,
        status: 'connected',
        token: randomUUID(),
      })
      .select('id')
      .single()
    if (channelError) throw channelError
    ids.channel = channel.id

    const { data: lead, error: leadError } = await admin
      .from('crm_leads')
      .insert({
        empresa_id: me.empresa_id,
        nome: leadName,
        telefone: phone,
        whatsapp: phone,
        canal_id: channel.id,
      })
      .select('id')
      .single()
    if (leadError) throw leadError
    ids.lead = lead.id

    const { data: cards, error: cardError } = await admin
      .from('crm_cards')
      .insert(
        ids.pipelines.map((pipelineId, index) => ({
          empresa_id: me.empresa_id,
          pipeline_id: pipelineId,
          stage_id: stages.find((stage) => stage.pipeline_id === pipelineId)?.id,
          lead_id: lead.id,
          conversa_id: ids.sessions[index],
          titulo: `[agent-phase3] Card ${index + 1} ${suffix}`,
          finalizado: false,
          stage_entered_at: new Date().toISOString(),
        })),
      )
      .select('id')
    if (cardError || !cards) throw cardError ?? new Error('Cards ausentes')
    ids.cards.push(...cards.map((item) => item.id))

    const now = Date.now()
    const { error: threadError } = await admin.from('crm_chat_threads').insert(
      ids.sessions.map((sessionId, index) => ({
        id: sessionId,
        empresa_id: me.empresa_id,
        canal_id: channel.id,
        external_id: phone,
        lead_id: lead.id,
        card_id: cards[index].id,
        departamento_id: ids.departments[index],
        pipeline_id: ids.pipelines[index],
        status: 'human',
        created_at: new Date(now + index * 1000).toISOString(),
        updated_at: new Date(now + index * 1000).toISOString(),
      })),
    )
    if (threadError) throw threadError

    const messages = [`Mensagem Comercial ${suffix}`, `Mensagem Financeiro ${suffix}`]
    const { data: conversations, error: conversationError } = await admin
      .from('crm_conversas')
      .insert(
        ids.sessions.map((sessionId, index) => ({
          sessao_id: sessionId,
          empresa_id: me.empresa_id,
          canal_id: channel.id,
          lead_id: lead.id,
          external_id: phone,
          role: 'user',
          direcao: 'inbound',
          content: messages[index],
          last_message: messages[index],
          status: 'human',
          created_at: new Date(now + index * 1000).toISOString(),
          updated_at: new Date(now + index * 1000).toISOString(),
        })),
      )
      .select('id')
    if (conversationError || !conversations) {
      throw conversationError ?? new Error('Conversas ausentes')
    }
    ids.conversations.push(...conversations.map((item) => item.id))

    return {
      leadName,
      channelId: ids.channel,
      sessionIds: ids.sessions,
      departmentIds: ids.departments,
      messages,
      configureMockProvider: async (apiUrl: string) => {
        const { error } = await admin
          .from('crm_canais')
          .update({
            provider: 'evolution',
            provider_token: `phase3-mock-${suffix}`,
            settings: { apiUrl, instanceName: `phase3-${suffix}` },
          })
          .eq('id', ids.channel)
          .eq('empresa_id', me.empresa_id)
        if (error) throw error
      },
      cleanup,
    }
  } catch (error) {
    await cleanup().catch(() => {})
    throw error
  }
}

export function phase3BaseUrl() {
  return getBaseUrl()
}

export async function createOmniDepartmentIsolationFixture() {
  const admin = adminClient()
  const me = await profile(admin)
  const multi = await createMultiSessionFixture()
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const users: Array<{ id: string; email: string; password: string; groupId: string }> = []

  const cleanup: Cleanup = async () => {
    const errors: string[] = []
    for (const user of users) {
      const membership = await admin
        .from('usuarios_departamentos')
        .delete()
        .eq('usuario_id', user.id)
      if (membership.error) errors.push(`membership ${user.id}: ${membership.error.message}`)
      const profileDelete = await admin
        .from('usuarios')
        .delete()
        .eq('id', user.id)
        .eq('empresa_id', me.empresa_id)
      if (profileDelete.error) errors.push(`usuario ${user.id}: ${profileDelete.error.message}`)
      const authDelete = await admin.auth.admin.deleteUser(user.id)
      if (authDelete.error) errors.push(`auth ${user.id}: ${authDelete.error.message}`)
      const groupDelete = await admin
        .from('grupos_acesso')
        .delete()
        .eq('id', user.groupId)
        .eq('empresa_id', me.empresa_id)
      if (groupDelete.error) errors.push(`grupo ${user.groupId}: ${groupDelete.error.message}`)
    }
    await multi.cleanup().catch((error) => errors.push(`multi: ${String(error)}`))
    if (errors.length) throw new Error(`cleanup Omni por departamento: ${errors.join('; ')}`)
  }

  try {
    for (let index = 0; index < 2; index += 1) {
      const email = `phase5-omni-${index}-${suffix}@teste.huginflow.com`
      const password = `P5!${randomUUID()}aA`
      const { data: group, error: groupError } = await admin
        .from('grupos_acesso')
        .insert({
          empresa_id: me.empresa_id,
          nome: `[agent-phase5] Omni ${index} ${suffix}`,
          is_admin: false,
          permissoes: { leads: ['view'], cards: ['view'], funis: ['view'] },
        })
        .select('id')
        .single()
      if (groupError) throw groupError

      const { data: auth, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome_completo: `Omni Dept ${index} ${suffix}`, role_global: 'operador' },
      })
      if (authError || !auth.user) throw authError ?? new Error('Auth Omni ausente')

      users.push({ id: auth.user.id, email, password, groupId: group.id })
      const { error: userError } = await admin.from('usuarios').insert({
        id: auth.user.id,
        auth_user_id: auth.user.id,
        email,
        nome_completo: `Omni Dept ${index} ${suffix}`,
        empresa_id: me.empresa_id,
        role_global: 'operador',
        grupo_id: group.id,
        ativo: true,
        must_change_password: false,
      })
      if (userError) throw userError

      const { error: membershipError } = await admin.from('usuarios_departamentos').insert({
        usuario_id: auth.user.id,
        departamento_id: multi.departmentIds[index],
        role_departamento: 'membro',
      })
      if (membershipError) throw membershipError
    }

    return {
      tenantId: me.empresa_id,
      leadName: multi.leadName,
      sessionIds: multi.sessionIds,
      messages: multi.messages,
      departmentIds: multi.departmentIds,
      configureMockProvider: multi.configureMockProvider,
      reassignSessionDepartment: async (sessionId: string, departmentId: string) => {
        const thread = await admin
          .from('crm_chat_threads')
          .update({ departamento_id: departmentId, updated_at: new Date().toISOString() })
          .eq('id', sessionId)
          .eq('empresa_id', me.empresa_id)
        if (thread.error) throw thread.error
        const conversation = await admin
          .from('crm_conversas')
          .update({ atribuido_a_id: null, updated_at: new Date().toISOString() })
          .eq('sessao_id', sessionId)
          .eq('empresa_id', me.empresa_id)
        if (conversation.error) throw conversation.error
      },
      countOutboundMessages: async (sessionId: string, content: string) => {
        const { count, error } = await admin
          .from('crm_interacoes')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', me.empresa_id)
          .eq('conversa_id', sessionId)
          .eq('content', content)
        if (error) throw error
        return count ?? 0
      },
      operators: users.map(({ email, password }) => ({ email, password })),
      cleanup,
    }
  } catch (error) {
    await cleanup().catch(() => {})
    throw error
  }
}
