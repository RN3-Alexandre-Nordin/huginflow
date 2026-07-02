/**
 * Bloco 3 — bootstrap empresa de teste (dev) via service role.
 * Espelha createEmpresa + createUsuario do superadmin.
 *
 * Uso: node scripts/supabase/block3-bootstrap-test-empresa.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envLocal = resolve(root, '.env.local')

function loadEnvLocal() {
  if (!existsSync(envLocal)) return {}
  const o = {}
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) o[t.slice(0, i)] = t.slice(i + 1).trim()
  }
  return o
}

const env = loadEnvLocal()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SUFFIX = Date.now().toString().slice(-6)
const EMPRESA_NOME = `Empresa Teste Go-Live ${SUFFIX}`
const CNPJ = `99.${SUFFIX.slice(0, 3)}.${SUFFIX.slice(3, 6)}/0001-90`
const GESTOR_EMAIL = `golive-gestor-${SUFFIX}@teste.ragnar.dev`
const OPERADOR_EMAIL = `golive-operador-${SUFFIX}@teste.ragnar.dev`
const PASSWORD = 'RagnarDevTest1!'

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

async function createAuthUser(email, nome, role_global) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { nome_completo: nome, role_global },
  })
  if (error) throw new Error(`Auth ${email}: ${error.message}`)
  return data.user
}

async function main() {
  const { data: empresa, error: empErr } = await admin
    .from('empresas')
    .insert({
      nome: EMPRESA_NOME,
      tipo_societario: 'ltda',
      cnpj: CNPJ,
      email: `contato-${SUFFIX}@teste.ragnar.dev`,
      telefone: '(11) 3000-0000',
      endereco: 'Rua Teste, 100 - São Paulo/SP',
      cidade: 'São Paulo',
      ramo_atividade: 'Testes Go-Live',
      responsavel_nome: 'Maria Teste Silva',
      responsavel_cpf: '529.982.247-25',
      responsavel_nacionalidade: 'brasileiro(a)',
      responsavel_estado_civil: 'solteiro',
      responsavel_profissao: 'administrador',
      responsavel_cargo: 'Sócia Administradora',
      responsavel_email: `resp-${SUFFIX}@teste.ragnar.dev`,
      responsavel_telefone: '(11) 99000-0000',
      ai_model: 'gpt-4o',
      ai_provider: 'openai',
      ia_silence_timeout: 60,
      ativo: true,
      status: 'active',
    })
    .select('id, nome, ai_model, ativo')
    .single()

  if (empErr) throw new Error(`Empresa: ${empErr.message}`)

  const { data: grupoAdmin, error: gaErr } = await admin
    .from('grupos_acesso')
    .insert({
      empresa_id: empresa.id,
      nome: 'Administrador Local',
      descricao: 'Grupo admin — teste go-live',
      is_admin: true,
      permissoes: adminPerms,
    })
    .select('id')
    .single()
  if (gaErr) throw new Error(`Grupo admin: ${gaErr.message}`)

  const { data: grupoOp, error: goErr } = await admin
    .from('grupos_acesso')
    .insert({
      empresa_id: empresa.id,
      nome: 'Operadores',
      descricao: 'Grupo operador — teste go-live',
      is_admin: false,
      permissoes: operadorPerms,
    })
    .select('id')
    .single()
  if (goErr) throw new Error(`Grupo operador: ${goErr.message}`)

  const gestorAuth = await createAuthUser(GESTOR_EMAIL, 'Gestor Teste Go-Live', 'admin')
  const operadorAuth = await createAuthUser(OPERADOR_EMAIL, 'Operador Teste Go-Live', 'operador')

  const { error: ugErr } = await admin.from('usuarios').insert([
    {
      id: gestorAuth.id,
      auth_user_id: gestorAuth.id,
      email: GESTOR_EMAIL,
      nome_completo: 'Gestor Teste Go-Live',
      empresa_id: empresa.id,
      role_global: 'admin',
      grupo_id: grupoAdmin.id,
      telefone: '(11) 99111-1111',
    },
    {
      id: operadorAuth.id,
      auth_user_id: operadorAuth.id,
      email: OPERADOR_EMAIL,
      nome_completo: 'Operador Teste Go-Live',
      empresa_id: empresa.id,
      role_global: 'operador',
      grupo_id: grupoOp.id,
      telefone: '(11) 99222-2222',
    },
  ])
  if (ugErr) throw new Error(`Usuarios: ${ugErr.message}`)

  // 3.5 — gestor edita empresa (via client anon + login)
  const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { error: loginErr } = await anon.auth.signInWithPassword({
    email: GESTOR_EMAIL,
    password: PASSWORD,
  })
  if (loginErr) throw new Error(`Login gestor: ${loginErr.message}`)

  const novoRamo = `Testes Go-Live atualizado ${SUFFIX}`
  const { error: updErr } = await anon
    .from('empresas')
    .update({ ramo_atividade: novoRamo })
    .eq('id', empresa.id)
  if (updErr) throw new Error(`Gestor editar empresa: ${updErr.message}`)

  await anon.auth.signOut()

  // 3.6 — superadmin vê empresa
  const { data: lista, error: listErr } = await admin
    .from('empresas')
    .select('id, nome')
    .eq('id', empresa.id)
    .single()
  if (listErr) throw new Error(`Superadmin listar: ${listErr.message}`)

  const { data: finalEmp } = await admin
    .from('empresas')
    .select('ramo_atividade, ai_model, ai_provider')
    .eq('id', empresa.id)
    .single()

  console.log(JSON.stringify({
    ok: true,
    empresa_id: empresa.id,
    empresa_nome: empresa.nome,
    cnpj: CNPJ,
    gestor_email: GESTOR_EMAIL,
    operador_email: OPERADOR_EMAIL,
    password: PASSWORD,
    ai_model: finalEmp?.ai_model,
    ai_provider: finalEmp?.ai_provider,
    ramo_atividade: finalEmp?.ramo_atividade,
    gestor_edit_ok: finalEmp?.ramo_atividade === novoRamo,
    superadmin_view_ok: lista?.nome === EMPRESA_NOME,
  }, null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
