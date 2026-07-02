/**
 * Bloco 12 — bootstrap tenant NASU em produção (RN3).
 * Cria grupos, gestor, operador, funil padrão e ajusta IA para OpenAI.
 *
 * Uso:
 *   NASU_GESTOR_EMAIL=... NASU_OPERADOR_EMAIL=... NASU_TEMP_PASSWORD='...' \
 *     node scripts/supabase/block12-bootstrap-nasu-prod.mjs
 *
 * Opcional: NASU_GESTOR_NOME, NASU_OPERADOR_NOME
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envProd = resolve(root, '.env.production')

const NASU_EMPRESA_ID = '2b87fa27-a1da-4a6b-b7c9-8cfef5685ce7'

function loadEnv(path) {
  if (!existsSync(path)) return {}
  const o = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}

const adminPerms = {
  crm: ['view', 'manage'],
  cards: ['view', 'create', 'edit', 'move', 'delete'],
  funis: ['view', 'create', 'edit', 'delete'],
  leads: ['view', 'create', 'edit', 'delete'],
  canais: ['view', 'create', 'edit', 'delete'],
  grupos: ['view', 'create', 'edit', 'delete'],
  empresas: ['view', 'create', 'edit', 'delete'],
  usuarios: ['view', 'invite', 'edit', 'delete'],
  simulador: ['view', 'use'],
  conhecimento: ['view', 'create', 'edit', 'delete'],
  departamentos: ['view', 'create', 'edit', 'delete'],
  card_attachments: ['view', 'create', 'delete'],
}

const operadorPerms = {
  crm: ['view'],
  cards: ['view', 'create', 'edit', 'move'],
  funis: ['view'],
  leads: ['view', 'create', 'edit'],
  simulador: ['view', 'use'],
  conhecimento: ['view'],
}

async function ensureGrupo(admin, empresaId, nome, descricao, is_admin, permissoes) {
  const { data: existing } = await admin.from('grupos_acesso')
    .select('id, nome').eq('empresa_id', empresaId).eq('nome', nome).maybeSingle()
  if (existing?.id) return existing.id

  const { data, error } = await admin.from('grupos_acesso').insert({
    empresa_id: empresaId,
    nome,
    descricao,
    is_admin,
    permissoes,
  }).select('id').single()
  if (error) throw new Error(`Grupo ${nome}: ${error.message}`)
  return data.id
}

async function ensureUser(admin, { email, nome, role_global, grupo_id }) {
  const { data: existing } = await admin.from('usuarios')
    .select('id, email').eq('email', email).maybeSingle()
  if (existing?.id) return { id: existing.id, email: existing.email, created: false }

  const password = process.env.NASU_TEMP_PASSWORD
  if (!password || password.length < 8) {
    throw new Error('Defina NASU_TEMP_PASSWORD (mín. 8 caracteres) para criar novos usuários')
  }

  const { data: auth, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome_completo: nome, role_global },
  })
  if (authErr) throw new Error(`Auth ${email}: ${authErr.message}`)

  const { error: uErr } = await admin.from('usuarios').insert({
    id: auth.user.id,
    auth_user_id: auth.user.id,
    email,
    nome_completo: nome,
    empresa_id: NASU_EMPRESA_ID,
    role_global,
    grupo_id,
  })
  if (uErr) throw new Error(`Usuario ${email}: ${uErr.message}`)
  return { id: auth.user.id, email, created: true }
}

async function ensureFunil(admin) {
  const { data: existing } = await admin.from('pipelines')
    .select('id, nome').eq('empresa_id', NASU_EMPRESA_ID).limit(1).maybeSingle()
  if (existing?.id) return existing

  const { data: pipeline, error: pErr } = await admin.from('pipelines').insert({
    nome: 'Comercial NASU',
    descricao: 'Funil principal — go-live',
    is_public: true,
    empresa_id: NASU_EMPRESA_ID,
  }).select('id, nome').single()
  if (pErr) throw new Error(`Funil: ${pErr.message}`)

  const { error: stErr } = await admin.from('pipeline_stages').insert([
    { pipeline_id: pipeline.id, nome: 'PROSPECÇÃO', ordem: 0, cor: '#80B828' },
    { pipeline_id: pipeline.id, nome: 'NEGOCIAÇÃO', ordem: 1, cor: '#2BAADF' },
    { pipeline_id: pipeline.id, nome: 'FECHADO', ordem: 2, cor: '#1A8FBF' },
  ])
  if (stErr) throw new Error(`Etapas: ${stErr.message}`)
  return pipeline
}

async function main() {
  const gestorEmail = process.env.NASU_GESTOR_EMAIL
  const operadorEmail = process.env.NASU_OPERADOR_EMAIL
  if (!gestorEmail || !operadorEmail) {
    console.error('Defina NASU_GESTOR_EMAIL e NASU_OPERADOR_EMAIL')
    process.exit(1)
  }

  const gestorNome = process.env.NASU_GESTOR_NOME ?? 'Gestor NASU'
  const operadorNome = process.env.NASU_OPERADOR_NOME ?? 'Operador NASU'

  const env = loadEnv(envProd)
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Configure Supabase em .env.production')
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: empresa, error: empErr } = await admin.from('empresas')
    .select('id, nome, ai_model, ai_provider')
    .eq('id', NASU_EMPRESA_ID).single()
  if (empErr) throw new Error(empErr.message)

  const { error: aiErr } = await admin.from('empresas').update({
    ai_model: 'gpt-4o',
    ai_provider: 'openai',
    ia_silence_timeout: 60,
  }).eq('id', NASU_EMPRESA_ID)
  if (aiErr) throw new Error(`IA: ${aiErr.message}`)

  const grupoAdminId = await ensureGrupo(admin, NASU_EMPRESA_ID, 'Administradores', 'Gestores NASU', true, adminPerms)
  const grupoOpId = await ensureGrupo(admin, NASU_EMPRESA_ID, 'Operadores', 'Equipe operacional NASU', false, operadorPerms)

  const gestor = await ensureUser(admin, {
    email: gestorEmail,
    nome: gestorNome,
    role_global: 'admin',
    grupo_id: grupoAdminId,
  })
  const operador = await ensureUser(admin, {
    email: operadorEmail,
    nome: operadorNome,
    role_global: 'operador',
    grupo_id: grupoOpId,
  })

  const funil = await ensureFunil(admin)

  console.log(JSON.stringify({
    ok: true,
    empresa_id: NASU_EMPRESA_ID,
    empresa_nome: empresa.nome,
    ai_updated: { from: `${empresa.ai_provider}/${empresa.ai_model}`, to: 'openai/gpt-4o' },
    gestor,
    operador,
    funil,
    pendente_manual: [
      'Criar canal WhatsApp na UI (superadmin) e conectar QR',
      'Deploy prod com código atual + OPENAI_API_KEY',
      'Rodar block12-preflight-nasu-prod.mjs até ok: true',
      'Entregar credenciais ao cliente e executar Bloco 12 no sábado',
    ],
  }, null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
