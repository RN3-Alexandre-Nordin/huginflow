/**
 * Bloco 7 — base de conhecimento RAG em PRODUÇÃO (7.1–7.5).
 * Usa tenant de scripts/supabase/out/prod-test-tenant.json
 *
 * Uso: node scripts/supabase/block7-test-conhecimento-prod.mjs
 */
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdf = require('pdf-parse/lib/pdf-parse')

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const envProd = resolve(root, '.env.production')
const tenantFile = resolve(__dirname, 'out/prod-test-tenant.json')

const KNOWLEDGE_BUCKET = 'knowledge_documents'
const EMBEDDING_MODEL = 'text-embedding-3-large'

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

function getOpenAiKey(env) {
  let key = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || ''
  const corruptIdx = key.search(/N8N_WEBHOOK=/)
  if (corruptIdx > 0) key = key.slice(0, corruptIdx)
  return key.trim()
}

function chunkText(text, size = 1000, overlap = 200) {
  const chunks = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + size, text.length)
    chunks.push(text.substring(start, end))
    start += size - overlap
  }
  return chunks
}

function buildMinimalPdf(text) {
  const safe = text.replace(/[()\\]/g, ' ').slice(0, 80)
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R>>endobj
4 0 obj<</Length 60>>stream
BT /F1 12 Tf 100 700 Td (${safe}) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000190 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
285
%%EOF`,
    'utf8',
  )
}

async function embedText(openai, text) {
  const result = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text })
  return result.data[0]?.embedding ?? []
}

async function ingestKnowledge(sb, openai, empresaId, { type, content, fileName, fileBuffer, category }) {
  const { data: source, error: sourceErr } = await sb
    .from('knowledge_sources')
    .insert({
      organization_id: empresaId,
      file_name: fileName,
      category,
    })
    .select('id')
    .single()
  if (sourceErr) throw new Error(`source: ${sourceErr.message}`)

  const meta = {
    content_text: content,
    mime_type: type === 'pdf' ? 'application/pdf' : 'text/plain',
  }

  if (type === 'pdf' && fileBuffer) {
    const storagePath = `${empresaId}/${source.id}/${fileName}`
    const { error: upErr } = await sb.storage
      .from(KNOWLEDGE_BUCKET)
      .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw new Error(`storage upload: ${upErr.message}`)
    meta.storage_path = storagePath
  }

  await sb.from('knowledge_sources').update(meta).eq('id', source.id)

  const chunks = chunkText(content)
  const rows = []
  for (const chunk of chunks) {
    const embedding = await embedText(openai, chunk)
    rows.push({
      organization_id: empresaId,
      source_id: source.id,
      content: chunk,
      embedding,
    })
  }

  const { error: chunkErr } = await sb.from('knowledge_base').insert(rows)
  if (chunkErr) {
    await sb.from('knowledge_sources').delete().eq('id', source.id)
    throw new Error(`chunks: ${chunkErr.message}`)
  }

  return { sourceId: source.id, chunks: rows.length, storagePath: meta.storage_path }
}

const results = {}

function pass(id, note) {
  results[id] = { ok: true, note }
}

function fail(id, note) {
  results[id] = { ok: false, note }
}

async function main() {
  const env = loadEnv(envProd)
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = getOpenAiKey(env)

  if (!url || !anonKey || !serviceKey) {
    console.error('Configure Supabase em .env.production')
    process.exit(1)
  }
  if (!openaiKey) throw new Error('OPENAI_API_KEY ausente em .env.production')
  if (!existsSync(tenantFile)) {
    console.error('Rode block3 em prod antes (prod-test-tenant.json)')
    process.exit(1)
  }

  const tenant = JSON.parse(readFileSync(tenantFile, 'utf8'))
  const EMPRESA_ID = tenant.empresa_id
  const GESTOR_EMAIL = tenant.gestor_email
  const PASSWORD = tenant.password

  const sb = createClient(url, anonKey)
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const openai = new OpenAI({ apiKey: openaiKey })

  const { error: loginErr } = await sb.auth.signInWithPassword({
    email: GESTOR_EMAIL,
    password: PASSWORD,
  })
  if (loginErr) throw new Error(`Login: ${loginErr.message}`)

  const suffix = Date.now().toString().slice(-6)
  const pdfText = `Hugin Flow conhecimento teste go live bloco sete prod ${suffix} conteudo suficiente para vetorizacao.`
  const pdfBuffer = buildMinimalPdf(pdfText)
  let extracted = pdfText
  try {
    const pdfParsed = await pdf(pdfBuffer)
    if (pdfParsed.text?.trim().length >= 10) extracted = pdfParsed.text.trim()
  } catch {
    console.warn('[block7-prod] pdf-parse falhou; usando texto fallback')
  }

  const textContent = `Politica comercial teste prod ${suffix}. Oferecemos suporte dedicado e prazo de entrega de 5 dias uteis para clientes go-live.`
  const textIng = await ingestKnowledge(sb, openai, EMPRESA_ID, {
    type: 'text',
    content: textContent,
    fileName: `Texto: Geral ${suffix}`,
    category: 'Geral',
  })
  pass('7.3', `fonte ${textIng.sourceId} · ${textIng.chunks} chunks`)

  const pdfIng = await ingestKnowledge(sb, openai, EMPRESA_ID, {
    type: 'pdf',
    content: extracted.length >= 10 ? extracted : pdfText,
    fileName: `documento-teste-${suffix}.pdf`,
    fileBuffer: pdfBuffer,
    category: 'Geral',
  })

  let embeddingLen = 0
  const { data: raw } = await admin
    .from('knowledge_base')
    .select('embedding')
    .eq('source_id', pdfIng.sourceId)
    .limit(1)
    .single()
  if (raw?.embedding) {
    if (Array.isArray(raw.embedding)) embeddingLen = raw.embedding.length
    else if (typeof raw.embedding === 'string') {
      embeddingLen = raw.embedding.replace(/[\[\]]/g, '').split(',').filter(Boolean).length
    }
  }

  if (pdfIng.chunks >= 1 && embeddingLen === 3072) {
    pass('7.1', `PDF · ${pdfIng.chunks} chunks · ${embeddingLen} dims`)
  } else {
    fail('7.1', `chunks=${pdfIng.chunks}, dims=${embeddingLen}`)
  }

  const pageSrc = readFileSync(
    resolve(root, 'src/app/(app)/cockpit/crm/conhecimento/page.tsx'),
    'utf8',
  )
  const uiFilePickerOk =
    pageSrc.includes('type="file"') &&
    pageSrc.includes('fileInputRef.current?.click()') &&
    pageSrc.includes('accept="application/pdf')
  if (uiFilePickerOk) pass('7.2', 'fileInputRef + type=file no código')
  else fail('7.2', 'UI upload não encontrada no código')

  const { data: downloadData, error: dlErr } = await sb.storage
    .from(KNOWLEDGE_BUCKET)
    .download(pdfIng.storagePath)
  const downloadOk = !dlErr && downloadData && (await downloadData.arrayBuffer()).byteLength > 0
  if (downloadOk) pass('7.4', `download ${pdfIng.storagePath}`)
  else fail('7.4', dlErr?.message || 'download falhou')

  const { data: srcBefore } = await sb
    .from('knowledge_sources')
    .select('storage_path')
    .eq('id', pdfIng.sourceId)
    .single()

  if (srcBefore?.storage_path) {
    await sb.storage.from(KNOWLEDGE_BUCKET).remove([srcBefore.storage_path])
  }
  const { error: delErr } = await sb
    .from('knowledge_sources')
    .delete()
    .eq('id', pdfIng.sourceId)
    .eq('organization_id', EMPRESA_ID)
  if (delErr) {
    fail('7.5', delErr.message)
  } else {
    const { data: deletedCheck } = await sb
      .from('knowledge_sources')
      .select('id')
      .eq('id', pdfIng.sourceId)
      .maybeSingle()
    const { count: chunkCount } = await sb
      .from('knowledge_base')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', pdfIng.sourceId)
    if (deletedCheck === null && (chunkCount ?? 0) === 0) {
      pass('7.5', `PDF ${pdfIng.sourceId} removido`)
    } else {
      fail('7.5', `source=${deletedCheck?.id}, chunks=${chunkCount}`)
    }
  }

  await sb.auth.signOut()

  tenant.knowledge_text_source_id = textIng.sourceId
  writeFileSync(tenantFile, JSON.stringify(tenant, null, 2))

  const allOk = Object.values(results).every((r) => r.ok)
  console.log(
    JSON.stringify(
      {
        ok: allOk,
        empresa_id: EMPRESA_ID,
        text_source_id: textIng.sourceId,
        pdf_source_id_deleted: pdfIng.sourceId,
        embedding_dimensions: embeddingLen,
        tests: results,
      },
      null,
      2,
    ),
  )
  if (!allOk) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
