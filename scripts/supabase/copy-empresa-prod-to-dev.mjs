/**
 * Copia estrutura de uma empresa do Supabase PROD → DEV
 * (departamentos, grupos, funis, etapas, acessos, usuários + Auth).
 *
 * Uso:
 *   node scripts/supabase/copy-empresa-prod-to-dev.mjs Nasu
 *   node scripts/supabase/copy-empresa-prod-to-dev.mjs Nasu --password=hugin123@2026
 *
 * Requer .env.local (dev) e .env.production (prod) com service_role.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

function loadEnvFile(file) {
  if (!existsSync(file)) return {}
  const o = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}

const search = process.argv[2]?.trim()
const passwordArg = process.argv.find((a) => a.startsWith('--password='))
const tempPassword = passwordArg?.slice('--password='.length) || process.env.NASU_TEMP_PASSWORD || 'hugin123@2026'

if (!search) {
  console.error('Uso: node copy-empresa-prod-to-dev.mjs <nome-empresa> [--password=...]')
  process.exit(1)
}

const prodEnv = loadEnvFile(resolve(root, '.env.production'))
const devEnv = loadEnvFile(resolve(root, '.env.local'))

for (const [label, env] of [
  ['prod (.env.production)', prodEnv],
  ['dev (.env.local)', devEnv],
]) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em ${label}`)
    process.exit(1)
  }
}

const prod = createClient(prodEnv.NEXT_PUBLIC_SUPABASE_URL, prodEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const dev = createClient(devEnv.NEXT_PUBLIC_SUPABASE_URL, devEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function stripTimestamps(row) {
  const out = { ...row }
  delete out.created_at
  delete out.updated_at
  return out
}

async function upsertById(table, rows, label = table) {
  if (!rows?.length) {
    console.log(`  ${label}: 0`)
    return 0
  }
  const payload = rows.map(stripTimestamps)
  const { error } = await dev.from(table).upsert(payload, { onConflict: 'id' })
  if (error) throw new Error(`${label}: ${error.message}`)
  console.log(`  ${label}: ${payload.length}`)
  return payload.length
}

async function fetchAll(sb, table, filter) {
  let q = sb.from(table).select('*')
  if (filter) q = filter(q)
  const { data, error } = await q
  if (error) throw new Error(`PROD ${table}: ${error.message}`)
  return data ?? []
}

async function ensureAuthUser(email, nome, authUserId) {
  // Tenta localizar por email no Auth DEV
  const { data: listed } = await dev.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())

  if (existing) {
    await dev.auth.admin.updateUserById(existing.id, {
      password: tempPassword,
      email_confirm: true,
      user_metadata: { nome_completo: nome },
    })
    return existing.id
  }

  // Preferir mesmo UUID do prod (se livre)
  const createOpts = {
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { nome_completo: nome },
  }
  if (authUserId) createOpts.id = authUserId

  const { data, error } = await dev.auth.admin.createUser(createOpts)
  if (error) {
    // Colisão de id: cria sem id fixo
    if (authUserId) {
      const retry = await dev.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { nome_completo: nome },
      })
      if (retry.error) throw new Error(`Auth ${email}: ${retry.error.message}`)
      return retry.data.user.id
    }
    throw new Error(`Auth ${email}: ${error.message}`)
  }
  return data.user.id
}

const pattern = `%${search}%`
const { data: prodEmpresas, error: empErr } = await prod
  .from('empresas')
  .select('*')
  .ilike('nome', pattern)

if (empErr) {
  console.error('Erro ao buscar empresa no PROD:', empErr.message)
  process.exit(1)
}
if (!prodEmpresas?.length) {
  console.error(`Nenhuma empresa no PROD com "${search}"`)
  process.exit(1)
}
if (prodEmpresas.length > 1) {
  console.error(`Mais de uma empresa no PROD (${prodEmpresas.length}). Refine o nome:`)
  for (const r of prodEmpresas) console.error(`  - ${r.id} | ${r.nome}`)
  process.exit(1)
}

const empresa = prodEmpresas[0]
const empresaId = empresa.id
console.log(`\nCopiando PROD → DEV: ${empresa.nome} (${empresaId})\n`)

try {
  // 1) Empresa
  await upsertById('empresas', [empresa], 'empresas')

  // 2) Departamentos
  const departamentos = await fetchAll(prod, 'departamentos', (q) => q.eq('empresa_id', empresaId))
  await upsertById('departamentos', departamentos)

  // 3) Grupos de acesso
  const grupos = await fetchAll(prod, 'grupos_acesso', (q) => q.eq('empresa_id', empresaId))
  await upsertById('grupos_acesso', grupos)

  // 4) Pipelines (funis)
  const pipelines = await fetchAll(prod, 'pipelines', (q) => q.eq('empresa_id', empresaId))
  await upsertById('pipelines', pipelines)

  // 5) Stages
  const pipelineIds = pipelines.map((p) => p.id)
  let stages = []
  if (pipelineIds.length) {
    stages = await fetchAll(prod, 'pipeline_stages', (q) => q.in('pipeline_id', pipelineIds))
  }
  await upsertById('pipeline_stages', stages)

  // 6) Acessos funil/etapa
  let pipeGrupo = []
  let stageGrupo = []
  if (pipelineIds.length) {
    pipeGrupo = await fetchAll(prod, 'pipeline_grupo_acesso', (q) => q.in('pipeline_id', pipelineIds))
  }
  const stageIds = stages.map((s) => s.id)
  if (stageIds.length) {
    stageGrupo = await fetchAll(prod, 'pipeline_stage_grupo_acesso', (q) => q.in('stage_id', stageIds))
  }
  await upsertById('pipeline_grupo_acesso', pipeGrupo)
  await upsertById('pipeline_stage_grupo_acesso', stageGrupo)

  // 7) Usuários + Auth DEV
  const usuarios = await fetchAll(prod, 'usuarios', (q) => q.eq('empresa_id', empresaId))
  console.log(`  usuarios (auth+perfil): ${usuarios.length}`)
  for (const u of usuarios) {
    if (!u.email) {
      console.warn(`    skip sem email id=${u.id}`)
      continue
    }
    const authId = await ensureAuthUser(u.email, u.nome_completo || u.email, u.auth_user_id || u.id)
    const profile = stripTimestamps({
      ...u,
      auth_user_id: authId,
      id: u.id,
      empresa_id: empresaId,
    })
    // Colunas que podem existir só em prod
    delete profile.must_change_password
    delete profile.gemini_api_key
    delete profile.openai_api_key
    const { error } = await dev.from('usuarios').upsert([profile], { onConflict: 'id' })
    if (error) {
      // Fallback: perfil com id = authId
      const alt = { ...profile, id: authId }
      const { error: e2 } = await dev.from('usuarios').upsert([alt], { onConflict: 'id' })
      if (e2) throw new Error(`usuarios ${u.email}: ${e2.message}`)
      console.log(`    ok ${u.email} (id=auth)`)
    } else {
      console.log(`    ok ${u.email}`)
    }
  }

  // 8) usuarios_departamentos
  const userIds = usuarios.map((u) => u.id)
  let ud = []
  if (userIds.length) {
    ud = await fetchAll(prod, 'usuarios_departamentos', (q) => q.in('usuario_id', userIds))
  }
  await upsertById('usuarios_departamentos', ud)

  // 9) Canais (estrutura; sem tokens sensíveis de prod se preferir — copia settings para teste)
  const canais = await fetchAll(prod, 'crm_canais', (q) => q.eq('empresa_id', empresaId))
  // Em DEV, zera tokens de Evolution para não apontar à instância de prod por acidente
  const canaisSafe = canais.map((c) => ({
    ...stripTimestamps(c),
    provider_token: null,
    token: null,
    status: 'disconnected',
  }))
  await upsertById('crm_canais', canaisSafe, 'crm_canais (sem tokens)')

  console.log(`\nConcluído. Senha temporária dos usuários no DEV: ${tempPassword}`)
  console.log('Teste no simulador / cockpit apontando .env.local para o projeto DEV.\n')
} catch (err) {
  console.error('\nFalha:', err.message || err)
  process.exit(1)
}
