/**
 * Bloco 4 — testes extras: editar card, atribuir usuário, anexo.
 * Usa funil/card existentes da Empresa Teste Go-Live (dev).
 *
 * Uso: node scripts/supabase/block4-extended-card-tests.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envLocal = resolve(root, '.env.local')

const EMPRESA_ID = '645679bd-3f41-4f7d-ba10-98d97cab2a46'
const PIPELINE_ID = '5b3a3415-d096-4a80-8c73-d6e2bf398bb4'
const GESTOR_EMAIL = 'golive-gestor-510160@teste.huginflow.com'
const OPERADOR_ID = '0e312f20-dfbd-454e-87da-8b01eda0e03a'
const GESTOR_ID = 'f0367060-0f06-40b1-94e1-7692f6abacf7'
const PASSWORD = 'HuginDevTest1!'

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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  const { error: loginErr } = await sb.auth.signInWithPassword({
    email: GESTOR_EMAIL,
    password: PASSWORD,
  })
  if (loginErr) throw new Error(`Login: ${loginErr.message}`)

  const { data: stage } = await sb
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', PIPELINE_ID)
    .order('ordem')
    .limit(1)
    .single()
  if (!stage) throw new Error('Etapa não encontrada')

  const suffix = Date.now().toString().slice(-6)

  const { data: card, error: cardErr } = await sb
    .from('crm_cards')
    .insert({
      titulo: `Card Extra ${suffix}`,
      descricao: 'Descrição inicial',
      valor: 100,
      cliente_nome: 'Cliente Inicial',
      pipeline_id: PIPELINE_ID,
      stage_id: stage.id,
      empresa_id: EMPRESA_ID,
      stage_entered_at: new Date().toISOString(),
      finalizado: false,
    })
    .select('id')
    .single()
  if (cardErr) throw new Error(`Criar card: ${cardErr.message}`)

  // 4.3 — editar informações
  const novoTitulo = `Card Editado ${suffix}`
  const { error: editErr } = await sb
    .from('crm_cards')
    .update({
      titulo: novoTitulo,
      descricao: 'Descrição atualizada no teste',
      valor: 2500.5,
      cliente_nome: 'Cliente Atualizado',
      observacao: 'Observação de teste go-live',
    })
    .eq('id', card.id)
    .eq('empresa_id', EMPRESA_ID)
  if (editErr) throw new Error(`4.3 editar: ${editErr.message}`)

  const { data: edited } = await sb
    .from('crm_cards')
    .select('titulo, valor, cliente_nome, observacao')
    .eq('id', card.id)
    .single()

  // 4.4 — atribuir a outro usuário (operador)
  const { error: assignErr } = await sb
    .from('crm_cards')
    .update({ responsavel_id: OPERADOR_ID })
    .eq('id', card.id)
    .eq('empresa_id', EMPRESA_ID)
  if (assignErr) throw new Error(`4.4 atribuir: ${assignErr.message}`)

  const { data: assigned } = await sb
    .from('crm_cards')
    .select('responsavel_id')
    .eq('id', card.id)
    .single()

  // 4.5 — anexo no card
  const fileName = `anexo-teste-${suffix}.txt`
  const filePath = `${EMPRESA_ID}/${card.id}/${Date.now()}_${fileName}`
  const fileContent = `Anexo de teste go-live ${suffix}`

  const { error: storageErr } = await sb.storage
    .from('card_attachments')
    .upload(filePath, Buffer.from(fileContent, 'utf8'), {
      contentType: 'text/plain',
      upsert: false,
    })
  if (storageErr) throw new Error(`4.5 storage: ${storageErr.message}`)

  const { data: fileRow, error: fileDbErr } = await sb
    .from('crm_card_files')
    .insert({
      empresa_id: EMPRESA_ID,
      card_id: card.id,
      file_name: fileName,
      file_url: filePath,
      file_type: 'text/plain',
      uploaded_by: GESTOR_ID,
    })
    .select('id, file_name')
    .single()
  if (fileDbErr) throw new Error(`4.5 metadata: ${fileDbErr.message}`)

  const { data: filesList } = await sb
    .from('crm_card_files')
    .select('id, file_name')
    .eq('card_id', card.id)
    .eq('empresa_id', EMPRESA_ID)

  const { data: signed } = await sb.storage
    .from('card_attachments')
    .createSignedUrl(filePath, 60)

  await sb.auth.signOut()

  const tests = {
    '4.3_editar_card':
      edited?.titulo === novoTitulo &&
      Number(edited?.valor) === 2500.5 &&
      edited?.cliente_nome === 'Cliente Atualizado',
    '4.4_atribuir_usuario': assigned?.responsavel_id === OPERADOR_ID,
    '4.5_anexo_card':
      (filesList?.length ?? 0) >= 1 &&
      filesList?.some((f) => f.file_name === fileName) &&
      Boolean(signed?.signedUrl),
  }

  if (!Object.values(tests).every(Boolean)) {
    throw new Error(`Falha nos testes: ${JSON.stringify(tests)}`)
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        card_id: card.id,
        operador_id: OPERADOR_ID,
        file_id: fileRow?.id,
        tests,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
