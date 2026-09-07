/**
 * Smoke de produção estritamente read-only.
 * Não carrega service role e aborta se mutações estiverem habilitadas.
 */
import { createClient } from '@supabase/supabase-js'

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} ausente`)
  return value
}

function assertReadOnlyTarget() {
  if (process.env.TEST_TARGET_ENV !== 'prod') {
    throw new Error('Defina TEST_TARGET_ENV=prod')
  }
  if (process.env.TEST_PROD_SMOKE !== '1') {
    throw new Error('Defina TEST_PROD_SMOKE=1')
  }
  if (process.env.TEST_ALLOW_MUTATIONS === '1') {
    throw new Error('Smoke de produção recusa TEST_ALLOW_MUTATIONS=1')
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Remova SUPABASE_SERVICE_ROLE_KEY do processo de smoke')
  }
}

async function main() {
  assertReadOnlyTarget()
  const appUrl = new URL(requireEnv('TEST_BASE_URL'))
  const supabaseUrl = new URL(requireEnv('NEXT_PUBLIC_SUPABASE_URL'))
  const expectedRef = requireEnv('TEST_PROD_SUPABASE_REF')
  const tenantId = requireEnv('TEST_TENANT_ID')
  const forbiddenTenant = requireEnv('TEST_PROD_OTHER_TENANT_ID')
  const email = requireEnv('TEST_EMAIL')
  const password = requireEnv('TEST_PASSWORD')
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  if (appUrl.protocol !== 'https:' || supabaseUrl.protocol !== 'https:') {
    throw new Error('Smoke de produção exige HTTPS')
  }
  if (
    ['localhost', '127.0.0.1'].includes(appUrl.hostname) ||
    ['localhost', '127.0.0.1'].includes(supabaseUrl.hostname)
  ) {
    throw new Error('Smoke de produção recusa localhost')
  }
  if (!supabaseUrl.hostname.startsWith(`${expectedRef}.`)) {
    throw new Error('Project ref Supabase não corresponde a TEST_PROD_SUPABASE_REF')
  }
  if (forbiddenTenant === tenantId) {
    throw new Error('TEST_PROD_OTHER_TENANT_ID deve ser diferente de TEST_TENANT_ID')
  }

  const login = await fetch(`${appUrl.origin}/login`, {
    signal: AbortSignal.timeout(20_000),
  })
  if (!login.ok) throw new Error(`/login HTTP ${login.status}`)

  const supabase = createClient(supabaseUrl.origin, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (authError || !auth.user) throw new Error(`Login prod: ${authError?.message ?? 'sem usuário'}`)

  const { data: profile, error: profileError } = await supabase
    .from('usuarios')
    .select('id, empresa_id, ativo')
    .eq('auth_user_id', auth.user.id)
    .eq('empresa_id', tenantId)
    .single()
  if (profileError || !profile?.ativo) {
    throw new Error(`Perfil canário inválido: ${profileError?.message ?? 'inativo'}`)
  }

  const end = new Date()
  const start = new Date(end.getTime() - 7 * 86_400_000)
  const args = {
    p_empresa_id: tenantId,
    p_data_inicio: start.toISOString(),
    p_data_fim: end.toISOString(),
    p_filtros: {},
  }
  for (const rpc of [
    'fn_analytics_overview',
    'fn_analytics_conversations_kpis',
    'fn_analytics_conversations_daily',
    'fn_analytics_traffic_heatmap',
  ]) {
    const { data, error } = await supabase.rpc(rpc, args)
    if (error || data == null) throw new Error(`${rpc}: ${error?.message ?? 'retorno nulo'}`)
  }

  const denied = await supabase.rpc('fn_analytics_overview', {
    ...args,
    p_empresa_id: forbiddenTenant,
  })
  if (!denied.error) throw new Error('Analytics prod aceitou outro tenant')

  await supabase.auth.signOut()
  console.log('✓ Smoke produção read-only: infraestrutura, auth, tenant e analytics')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
