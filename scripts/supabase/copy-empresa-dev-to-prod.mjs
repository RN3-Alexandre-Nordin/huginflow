/**
 * Copia cadastro de uma empresa do Supabase DEV → PROD.
 *
 * Uso:
 *   node scripts/supabase/copy-empresa-dev-to-prod.mjs Nasu
 *   node scripts/supabase/copy-empresa-dev-to-prod.mjs Nasu --with-contratos
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
const withContratos = process.argv.includes('--with-contratos')

if (!search) {
  console.error('Uso: node copy-empresa-dev-to-prod.mjs <nome-empresa> [--with-contratos]')
  process.exit(1)
}

const dev = loadEnvFile(resolve(root, '.env.local'))
const prod = loadEnvFile(resolve(root, '.env.production'))

for (const [label, env] of [
  ['dev (.env.local)', dev],
  ['prod (.env.production)', prod],
]) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em ${label}`)
    process.exit(1)
  }
}

const devSb = createClient(dev.NEXT_PUBLIC_SUPABASE_URL, dev.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const prodSb = createClient(prod.NEXT_PUBLIC_SUPABASE_URL, prod.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const pattern = `%${search}%`
const { data: devRows, error: devErr } = await devSb
  .from('empresas')
  .select('*')
  .ilike('nome', pattern)

if (devErr) {
  console.error('Erro ao buscar empresa no DEV:', devErr.message)
  process.exit(1)
}

if (!devRows?.length) {
  console.error(`Nenhuma empresa encontrada no DEV com "${search}"`)
  process.exit(1)
}

if (devRows.length > 1) {
  console.error(`Mais de uma empresa no DEV (${devRows.length}). Refine o nome:`)
  for (const r of devRows) console.error(`  - ${r.id} | ${r.nome} | ${r.cnpj ?? 'sem cnpj'}`)
  process.exit(1)
}

const source = devRows[0]
const empresaId = source.id

let prodTarget = null
if (source.cnpj) {
  const { data } = await prodSb.from('empresas').select('id, nome, cnpj').eq('cnpj', source.cnpj).maybeSingle()
  prodTarget = data
}
if (!prodTarget) {
  const { data } = await prodSb.from('empresas').select('id, nome, cnpj').eq('id', empresaId).maybeSingle()
  prodTarget = data
}

const row = { ...source }
delete row.created_at
delete row.updated_at

let empresaProdId = empresaId

if (prodTarget) {
  empresaProdId = prodTarget.id
  const { error } = await prodSb.from('empresas').update(row).eq('id', empresaProdId)
  if (error) {
    console.error('Erro ao atualizar empresa no PROD:', error.message)
    process.exit(1)
  }
  console.log(`PROD: empresa atualizada (${prodTarget.nome} → ${row.nome}) id=${empresaProdId}`)
} else {
  const { error } = await prodSb.from('empresas').insert([{ ...row, id: empresaId }])
  if (error) {
    console.error('Erro ao inserir empresa no PROD:', error.message)
    process.exit(1)
  }
  console.log(`PROD: empresa inserida id=${empresaId} nome=${row.nome}`)
}

if (withContratos) {
  const { data: contratos, error: cErr } = await devSb
    .from('finance_contratos')
    .select('*')
    .eq('empresa_id', empresaId)

  if (cErr) {
    console.error('Erro ao ler contratos no DEV:', cErr.message)
    process.exit(1)
  }

  for (const c of contratos ?? []) {
    const contratoId = c.id
    const payload = { ...c, empresa_id: empresaProdId }
    delete payload.created_at
    delete payload.updated_at

    const { data: existing } = await prodSb
      .from('finance_contratos')
      .select('id')
      .eq('id', contratoId)
      .maybeSingle()

    if (existing) {
      const { error } = await prodSb.from('finance_contratos').update(payload).eq('id', contratoId)
      if (error) {
        console.error('Erro ao atualizar contrato:', error.message)
        process.exit(1)
      }
      console.log(`  contrato atualizado: ${contratoId}`)
    } else {
      const { error } = await prodSb.from('finance_contratos').insert([payload])
      if (error) {
        console.error('Erro ao inserir contrato:', error.message)
        process.exit(1)
      }
      console.log(`  contrato inserido: ${contratoId}`)
    }

    const { data: extras, error: eErr } = await devSb
      .from('finance_contrato_servicos_extra')
      .select('*')
      .eq('contrato_id', contratoId)

    if (eErr) {
      console.error('Erro ao ler serviços extra:', eErr.message)
      process.exit(1)
    }

    await prodSb.from('finance_contrato_servicos_extra').delete().eq('contrato_id', contratoId)

    if (extras?.length) {
      const rows = extras.map((x) => ({
        ...x,
        empresa_id: empresaProdId,
        contrato_id: contratoId,
      }))
      const { error } = await prodSb.from('finance_contrato_servicos_extra').insert(rows)
      if (error) {
        console.error('Erro ao copiar serviços extra:', error.message)
        process.exit(1)
      }
      console.log(`  ${rows.length} serviço(s) extra copiado(s)`)
    }
  }

  if (!contratos?.length) console.log('  (nenhum contrato financeiro no DEV para esta empresa)')
}

console.log('Concluído.')
